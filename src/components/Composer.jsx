import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Clapperboard, Image, Type, Globe, Lock, ImagePlus, FileVideo, X, WandSparkles, Info, ChartBar, Tags, ChevronLeft, ChevronRight, MapPin, Plus, Camera as CameraIcon, Accessibility } from "lucide-react";
import { LIMITS, validateText, validateMediaFile } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import {
  uploadMedia, uploadPhotos, createPost, isMinor, StorageUnavailableError, storageAvailable, screenPost, MAX_SLIDES,
  circlePostVisibility, STRAND_MAX, LONG_VIDEO_SECONDS, TRAILER_SECONDS,
} from "../lib/db";
import { formatDuration, spokenDuration, relativeTime } from "../lib/format";
import { suggestTopics, MAX_POST_TOPICS, interestById } from "../lib/interests";
import { gifsEnabled } from "../lib/gifs";
import { readDraft, useDraft } from "../lib/drafts";
import { cameraSupported } from "../lib/cameras";
import { InterestToggles } from "./Interests";
import GifPicker, { GifView } from "./GifPicker";
import { PollBuilder } from "./Poll";
import { TopicChips } from "./circle/TopicPicker";
import Dialog from "./ui/Dialog";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { Field, Input, Textarea, Checkbox } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

const KINDS = [
  { id: "video", label: "Flick", icon: Clapperboard, media: "video" },
  { id: "post", label: "Still", icon: Image, media: "image" },
  { id: "text", label: "Strand", icon: Type, media: null },
];

const Camera = lazy(() => import("./Camera"));

const photoEntry = (f) => ({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`, file: f, url: URL.createObjectURL(f), alt: "" });

// Last-used format, per session.
let lastKind = "text";

function readDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const url = URL.createObjectURL(file);
    const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    v.src = url;
  });
}

// A JPEG of the frame at `at` seconds, used as the video's thumbnail. Phones
// (iPhones especially) show no frame for an unplayed video without one.
function capturePoster(file, at) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (blob) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    setTimeout(() => done(null), 8000);
    v.onloadeddata = () => { v.currentTime = Math.min(at, Math.max(0, (v.duration || 1) - 0.1)); };
    v.onseeked = () => {
      const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight, 1));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      if (!c.width || !c.height) return done(null);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(done, "image/jpeg", 0.82);
    };
    v.onerror = () => done(null);
    v.src = url;
  });
}

// Best effort: a post without a poster still works.
async function uploadPoster(file, at) {
  try {
    const blob = await capturePoster(file, at);
    if (!blob) return "";
    const { url } = await uploadMedia(new File([blob], "poster.jpg", { type: "image/jpeg" }));
    return url.startsWith("https://firebasestorage.googleapis.com/") ? url : "";
  } catch {
    return "";
  }
}

// Composer for all formats. Videos longer than LONG_VIDEO_SECONDS become long
// Flicks, which need a title and a trailer window.
// `files`: media captured before the composer opened (from the story camera).
export default function Composer({ onClose, onPosted, groupId, group, membership, profile, kind: initialKind, attach, files: initialFiles, text: initialText = "", circleTopic: initialCircleTopic }) {
  const toast = useToast();
  // Under-16 and private accounts are followers-only (also enforced by the rules).
  const minor = isMinor(profile) || !!profile?.isPrivate;
  // Restore the draft unless opened with explicit content.
  const draftScope = groupId ? `circle:${groupId}` : "post";
  const [draft] = useState(() => (initialText || attach || initialFiles?.length ? null : readDraft(draftScope)));
  const d = draft?.data || {};
  const [kind, setKind] = useState(initialKind || d.kind || lastKind);
  const [text, setText] = useState(d.text ?? initialText);
  const [title, setTitle] = useState(d.title || "");
  // [{ id, file, url: object URL, alt }]
  const [photos, setPhotos] = useState(() => (initialKind === "post" ? (initialFiles || []).map(photoEntry) : []));
  const [activePhoto, setActivePhoto] = useState(0);
  const [location, setLocation] = useState(d.location || "");
  const [ai, setAi] = useState(false);
  const [visibility, setVisibility] = useState(minor ? "followers" : d.visibility || "public");
  const [restored, setRestored] = useState(!!draft);
  const [file, setFile] = useState(() => (initialKind === "video" ? initialFiles?.[0] || null : null));
  const [camera, setCamera] = useState(false);
  // Secondary details stay folded until wanted.
  const [showLocation, setShowLocation] = useState(!!d.location);
  const [showAlt, setShowAlt] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trailerStart, setTrailerStart] = useState(0);
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(null);
  // Borderline/quoted content requires a second submit; any edit resets it.
  const [warned, setWarned] = useState("");
  const [note, setNote] = useState("");
  const [mediaReady, setMediaReady] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [topics, setTopics] = useState(d.topics || []);
  const [circleTopic, setCircleTopic] = useState(initialCircleTopic || "");
  const [topicsTouched, setTopicsTouched] = useState(!!d.topics);
  const [pickingTopics, setPickingTopics] = useState(false);
  const [poll, setPoll] = useState(d.poll || (attach === "poll" ? { options: ["", ""], hours: 24 } : null));
  const [gif, setGif] = useState(d.gif || null);
  const [gifPicker, setGifPicker] = useState(attach === "gif" && gifsEnabled);
  const fileInput = useRef(null);
  const fileId = useId();

  const spec = KINDS.find((k) => k.id === kind);
  const shownTopics = topicsTouched ? topics : suggestTopics(`${title} ${text}`);
  const long = kind === "video" && duration > LONG_VIDEO_SECONDS;
  const busy = progress !== null;

  useEffect(() => { storageAvailable().then(setMediaReady).catch(() => setMediaReady(false)); }, []);
  useEffect(() => {
    if (initialKind === "video" && initialFiles?.[0]) readDuration(initialFiles[0]).then(setDuration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drafts persist text and choices only, not media.
  const alt = photos.map((p) => p.alt).join("\n");
  const altShown = showAlt || !!alt.trim();
  // Unfold a detail and put the cursor in it.
  const reveal = (show, id) => { show(true); requestAnimationFrame(() => document.getElementById(id)?.focus()); };
  const picked = spec.media === "image" ? photos.length > 0 : !!file;
  const hasWords = !!(text.trim() || title.trim() || location.trim() || gif || poll?.options.some((o) => o.trim()));
  const finishDraft = useDraft(draftScope, hasWords ? {
    kind, text, title, location, visibility, gif,
    poll: kind === "text" ? poll : null,
    topics: topicsTouched ? topics : undefined,
  } : null);
  const discardDraft = () => {
    setText(""); setTitle(""); setLocation(""); setPoll(null); setGif(null);
    setTopics([]); setTopicsTouched(false); setRestored(false); setWarned("");
  };
  const close = () => {
    if (hasWords) toast({ title: "Draft saved", body: "It'll be here next time you open Create." });
    onClose();
  };
  useEffect(() => { lastKind = kind; }, [kind]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const switchKind = (k) => {
    if (busy) return;
    setKind(k);
    setErrors({});
    // Switching media type keeps text but drops files.
    if (KINDS.find((x) => x.id === k).media !== spec.media) { setFile(null); setDuration(0); clearPhotos(); }
  };

  const addPhotos = (list) => {
    const files = [...(list || [])];
    if (!files.length) return;
    const room = MAX_SLIDES - photos.length;
    let error = "";
    const fresh = [];
    for (const f of files) {
      const v = validateMediaFile(f, "image");
      if (v.error) { error = v.error; continue; }
      if (fresh.length >= room) { error = `A Still can have up to ${MAX_SLIDES} photos.`; break; }
      fresh.push(photoEntry(f));
    }
    setErrors(error ? { file: error } : {});
    if (!fresh.length) return;
    if (!photos.length) setActivePhoto(0);
    setPhotos((list) => [...list, ...fresh]);
  };
  const removePhoto = (i) => {
    URL.revokeObjectURL(photos[i].url);
    setPhotos((list) => list.filter((_, j) => j !== i));
    setActivePhoto((a) => Math.max(0, Math.min(a > i ? a - 1 : a, photos.length - 2)));
  };
  const movePhoto = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= photos.length) return;
    setPhotos((list) => { const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next; });
    setActivePhoto(j);
  };
  // Revoke preview object URLs on unmount.
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; });
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const clearPhotos = () => { photos.forEach((p) => URL.revokeObjectURL(p.url)); setPhotos([]); setActivePhoto(0); };
  const setPhotoAlt = (value) => setPhotos((list) => list.map((p, i) => (i === activePhoto ? { ...p, alt: value } : p)));

  const choose = async (f) => {
    if (!f) return;
    const v = validateMediaFile(f, spec.media);
    if (v.error) return setErrors({ file: v.error });
    setErrors({});
    setFile(f);
    setTrailerStart(0);
    setDuration(spec.media === "video" ? await readDuration(f) : 0);
  };

  const validate = () => {
    const e = {};
    const max = kind === "text" ? STRAND_MAX : LIMITS.text;
    const vText = validateText(text, max, kind === "text" ? "Strand" : "Caption");
    if (vText.error) e.text = vText.error;
    if (kind === "text" && !vText.text && !gif) e.text = poll ? "Ask your question first." : "Write something first.";
    if (kind === "text" && poll) {
      const opts = poll.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) e.poll = "Give the poll at least two choices.";
      else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) e.poll = "Each choice needs to be different.";
    }
    if (spec.media && !picked) e.file = kind === "post" ? "Add a photo. Stills are photos." : "Add a video.";
    if (long) {
      const vTitle = validateText(title, LIMITS.title, "Title");
      if (vTitle.error) e.title = vTitle.error;
      else if (!vTitle.text) e.title = "Long Flicks need a title. It's what people see before they commit.";
    }
    const pollText = kind === "text" && poll ? poll.options.join("\n") : "";
    const altText = spec.media === "image" ? alt : "";
    const mod = checkContent(`${long ? title : ""}\n${text}\n${pollText}\n${altText}\n${location}`, { key: "post", allowQuoted: true });
    if (!e.text && mod.error) e.text = mod.error;
    if (group && !e.text) {
      const blocked = screenPost(`${title}\n${text}`, group, profile, membership, { kind });
      if (blocked) e.text = blocked;
    }
    return { e, text: vText.text || "", note: mod.note || "", sensitive: !!mod.sensitive };
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const { e, text: clean, note: modNote, sensitive } = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      const first = ["file", "title", "text", "poll"].find((k) => e[k]);
      document.getElementById(`composer-${first}`)?.focus();
      return;
    }
    const fingerprint = `${title}|${text}|${alt}|${poll?.options.join("|") || ""}`;
    if (modNote && warned !== fingerprint) { setWarned(fingerprint); setNote(modNote); return; }
    try {
      let media = { url: "", path: "" };
      let slides = null;
      let posterUrl = "";
      if (spec.media === "image") {
        setProgress(0);
        slides = (await uploadPhotos(photos.map((p) => p.file), setProgress))
          .map((u, i) => ({ ...u, alt: photos[i].alt.trim().slice(0, LIMITS.alt) }));
        media = slides[0];
      } else if (file) {
        setProgress(0);
        media = await uploadMedia(file, setProgress);
        posterUrl = await uploadPoster(file, long ? trailerStart || 1 : 0.5);
      }
      const post = await createPost({
        kind: kind === "video" ? (long ? "video" : "short") : kind,
        text: clean,
        title: long ? title.trim() : "",
        alt: slides ? slides[0].alt : "",
        mediaUrl: media.url,
        mediaPath: media.path,
        posterUrl,
        mediaType: spec.media === "image" ? photos[0].file.type : file ? file.type : "",
        media: slides,
        location: spec.media ? location : "",
        duration,
        trailerStart: long ? trailerStart : 0,
        aiGenerated: spec.media ? ai : false,
        topics: shownTopics,
        sensitive,
        poll: kind === "text" && poll ? { options: poll.options.map((o) => o.trim()).filter(Boolean), hours: poll.hours } : null,
        gif: kind === "text" && gif ? { url: gif.url, width: gif.width, height: gif.height, title: gif.title } : null,
        groupId,
        // Circles decide visibility ("circle" when private, "pending" when held for review).
        visibility: groupId ? circlePostVisibility(group, membership, { text: `${title}\n${clean}`, profile }) : minor ? "followers" : visibility,
        circleTopic: groupId ? circleTopic : "",
      });
      markPosted("post", clean);
      finishDraft();
      toast(post.visibility === "pending"
        ? { tone: "info", title: "Sent to the circle's admins", body: "It'll appear once someone approves it." }
        : { title: `${long ? "Long Flick" : spec.label} posted` });
      onPosted(post);
    } catch (err) {
      console.error(err);
      setProgress(null);
      setErrors({
        submit: err instanceof StorageUnavailableError || /very quickly/.test(err?.message || "")
          ? err.message
          : err?.code === "permission-denied"
            ? "The server turned this down. If it keeps happening, the posting rules may need redeploying."
            : "Upload failed. Check your connection and try again. Everything you added is still here.",
      });
    }
  };

  // Video requires Cloud Storage; photos fall back to inline storage.
  const mediaBlocked = spec.media === "video" && mediaReady === false;
  const heading = group ? `Post to ${group.name}` : "Create";
  const remaining = STRAND_MAX - text.length;

  return (
    <Dialog title={heading} onClose={busy ? undefined : close} dismissible={!busy} variant="full" size="lg"
      footer={
        <div className="space-y-3">
          <div aria-live="polite"><InlineMessage>{errors.submit}</InlineMessage></div>
          {warned === `${title}|${text}|${alt}|${poll?.options.join("|") || ""}` && (
            <p role="status" className="rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">{note}</p>
          )}
          {busy && (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar"
                aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                <div className="h-full bg-accent transition-[width] duration-standard" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-caption text-fg-subtle tabular">Uploading… {progress}%. Keep this open until it finishes.</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            {!groupId && (
              <Visibility value={minor ? "followers" : visibility} onChange={setVisibility} locked={minor} />
            )}
            <span className="flex-1" />
            <Button type="submit" form="composer-form" variant="primary" loading={busy} disabled={mediaBlocked}>
              {warned === `${title}|${text}|${alt}|${poll?.options.join("|") || ""}` ? "Post anyway" : `Post ${long ? "long Flick" : spec.label}`}
            </Button>
          </div>
          {minor && !groupId && (
            <p className="text-caption text-fg-subtle">
              {profile?.isPrivate ? "Your account is private, so posts go to your followers only." : "Under-16 accounts post to followers only."}
            </p>
          )}
        </div>
      }>
      {restored && (
        <div role="status" className="mb-4 flex items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5 text-caption text-fg-muted">
          <span className="min-w-0 flex-1">
            Your draft from {relativeTime(draft.at)} is back.{spec.media ? ` Add your ${spec.media === "image" ? "photo" : "video"} again: files aren't kept.` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={discardDraft}>Discard</Button>
        </div>
      )}
      <Tabs label="What are you posting?" value={kind} onChange={switchKind} className="mb-5 flex w-full"
        tabs={KINDS.map((k) => ({ id: k.id, label: k.label }))} />

      <form id="composer-form" onSubmit={submit} className="space-y-5" noValidate>
        {mediaBlocked && (
          <div className="flex gap-3 rounded-card border border-amber-500/30 bg-amber-500/10 p-4" role="note">
            <Info size={18} className="mt-0.5 shrink-0 text-warning-text" aria-hidden="true" />
            <div>
              <p className="text-callout font-semibold text-warning-text">Video uploads aren't switched on yet</p>
              <p className="mt-1 text-caption text-fg-muted">
                Video needs Firebase Cloud Storage, which needs the Blaze plan. Stills and Strands work right now.
              </p>
              <Button size="sm" className="mt-3" onClick={() => switchKind("text")}>Write a Strand instead</Button>
            </div>
          </div>
        )}

        {spec.media && !mediaBlocked && (
          <div>
            {!picked ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (spec.media === "image") addPhotos(e.dataTransfer.files); else choose(e.dataTransfer.files[0]); }}
                className={`flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-accent-text bg-accent-soft" : errors.file ? "border-danger-text" : "border-field"
                }`}>
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                  {spec.media === "image" ? <ImagePlus size={24} aria-hidden="true" /> : <FileVideo size={24} aria-hidden="true" />}
                </span>
                <p className="text-callout font-semibold">
                  {spec.media === "image" ? "Add photos" : "Add a video"}
                </p>
                <p className="mt-1 text-caption text-fg-subtle">
                  {spec.media === "image"
                    ? `Up to ${MAX_SLIDES}, swiped through in order · JPG, PNG, WebP or GIF · up to 10 MB each`
                    : `Up to 200 MB. Over ${LONG_VIDEO_SECONDS / 60} minutes becomes a long Flick with a trailer.`}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {cameraSupported() && (
                    <Button variant="primary" icon={CameraIcon} onClick={() => setCamera(true)}>
                      {spec.media === "image" ? "Take a photo" : "Record"}
                    </Button>
                  )}
                  <Button id="composer-file" icon={spec.media === "image" ? ImagePlus : FileVideo} onClick={() => fileInput.current?.click()}
                    aria-describedby={errors.file ? `${fileId}-err` : undefined}>
                    Choose {spec.media === "image" ? "photos" : "a video"}
                  </Button>
                </div>
                <p className="mt-2 hidden text-label text-fg-subtle md:block">or drag it here</p>
                <input ref={fileInput} type="file" accept={spec.media === "image" ? "image/*" : "video/*"} className="hidden"
                  multiple={spec.media === "image"} tabIndex={-1} aria-hidden="true"
                  onChange={(e) => { if (spec.media === "image") addPhotos(e.target.files); else choose(e.target.files[0]); e.target.value = ""; }} />
              </div>
            ) : spec.media === "image" ? (
              <PhotoSet photos={photos} active={activePhoto} onActive={setActivePhoto} busy={busy}
                onRemove={removePhoto} onMove={movePhoto} onAdd={addPhotos} onCamera={cameraSupported() ? () => setCamera(true) : null} />
            ) : (
              <div className="relative overflow-hidden rounded-card border border-line bg-black">
                <video src={preview} controls playsInline className="max-h-80 w-full" aria-label="The video you picked" />
                {!busy && (
                  <IconButton icon={X} label="Remove video" tone="overlay"
                    className="absolute right-2 top-2" onClick={() => { setFile(null); setDuration(0); }} />
                )}
                {spec.media === "video" && duration > 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-label font-semibold text-white">
                    {long ? `Long Flick · ${formatDuration(duration)}` : `Flick · ${formatDuration(duration)}`}
                  </span>
                )}
              </div>
            )}
            <div aria-live="polite" className="mt-1.5"><InlineMessage id={`${fileId}-err`}>{errors.file}</InlineMessage></div>
          </div>
        )}

        {long && file && (
          <>
            <Field label="Title" error={errors.title} count={title.length} max={LIMITS.title}
              hint="The first thing people read on the trailer.">
              <Input id="composer-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.title}
                placeholder="What's it about?" />
            </Field>
            <TrailerPicker src={preview} duration={duration} value={trailerStart} onChange={setTrailerStart} />
          </>
        )}

        {(kind === "text" || !mediaBlocked) && (
          kind === "text" ? (
            <div>
              <label htmlFor="composer-text" className="sr-only">Your Strand</label>
              <Textarea id="composer-text" autoGrow rows={4} maxRows={14} value={text}
                onChange={(e) => { setText(e.target.value); if (errors.text) setErrors((x) => ({ ...x, text: "" })); }}
                placeholder="What's on your mind?" maxLength={STRAND_MAX}
                aria-invalid={errors.text ? "true" : undefined} aria-describedby="composer-text-meta"
                className="!text-title-3 !font-normal" />
              <div id="composer-text-meta" className="mt-1.5 flex items-start justify-between gap-3">
                <div aria-live="polite"><InlineMessage>{errors.text}</InlineMessage></div>
                <span className={`shrink-0 tabular text-caption ${remaining <= 40 ? "text-warning-text" : "text-fg-subtle"}`}>
                  {remaining} left
                </span>
              </div>
              {gif && (
                <div className="relative mt-3 w-fit">
                  <GifView gif={gif} />
                  <IconButton icon={X} label="Remove GIF" tone="overlay" className="absolute right-1 top-1" onClick={() => setGif(null)} />
                </div>
              )}
              {poll && (
                <div className="mt-3">
                  <PollBuilder value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />
                  <div aria-live="polite" className="mt-1.5"><InlineMessage>{errors.poll}</InlineMessage></div>
                </div>
              )}
              {!poll && !gif && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" icon={ChartBar} onClick={() => setPoll({ options: ["", ""], hours: 24 })}>Add a poll</Button>
                  {gifsEnabled && <Button size="sm" icon={Image} onClick={() => setGifPicker(true)}>Add a GIF</Button>}
                </div>
              )}
            </div>
          ) : (
            <Field label={long ? "Description" : "Caption"} optional error={errors.text} count={text.length} max={LIMITS.text}>
              <Textarea id="composer-text" autoGrow rows={3} maxRows={10} value={text}
                onChange={(e) => setText(e.target.value)} maxLength={LIMITS.text}
                placeholder={long ? "What should people know before watching?" : "Say something about it…"} />
            </Field>
          )
        )}

        {picked && spec.media && (!(showLocation || location) || (spec.media === "image" && !altShown)) && (
          <div className="flex flex-wrap gap-2">
            {!(showLocation || location) && (
              <Button size="sm" icon={MapPin} onClick={() => reveal(setShowLocation, "composer-location")}>Add location</Button>
            )}
            {spec.media === "image" && !altShown && (
              <Button size="sm" icon={Accessibility} onClick={() => reveal(setShowAlt, "composer-alt")}>
                Describe {photos.length > 1 ? "photos" : "photo"}
              </Button>
            )}
          </div>
        )}

        {picked && spec.media && (showLocation || location) && (
          <Field label="Location" optional count={location.length} max={60}>
            <div className="relative">
              <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              <Input id="composer-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60}
                placeholder="Where was this?" className="!pl-9" />
            </div>
          </Field>
        )}

        {picked && spec.media === "image" && altShown && (
          <Field label={photos.length > 1 ? `Describe photo ${activePhoto + 1}` : "Describe this photo"} optional
            count={(photos[activePhoto]?.alt || "").length} max={LIMITS.alt}
            hint="Read aloud to people using screen readers. Leave it blank and your caption is used instead.">
            <Textarea id="composer-alt" autoGrow rows={2} maxRows={5} value={photos[activePhoto]?.alt || ""} onChange={(e) => setPhotoAlt(e.target.value)} maxLength={LIMITS.alt}
              placeholder="e.g. Two friends laughing on a beach at sunset" />
          </Field>
        )}

        {group?.topics?.length > 0 && (
          <div>
            <p className="mb-2 text-callout font-medium">Topic in {group.name} <span className="font-normal text-fg-subtle">Optional</span></p>
            <TopicChips topics={group.topics} value={circleTopic} onChange={setCircleTopic} label={`Topic in ${group.name}`} />
          </div>
        )}

        {!mediaBlocked && !pickingTopics && (
          <div className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
            <Tags size={15} aria-hidden="true" />
            {shownTopics.length ? (
              <>
                <span>Topics:</span>
                {shownTopics.map((id) => (
                  <span key={id} className="rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-fg-muted ring-1 ring-line">{interestById(id)?.label}</span>
                ))}
                {!topicsTouched && <span>worked out from your words</span>}
              </>
            ) : (
              <span>{text.trim() || title.trim() ? "No topic spotted in your words" : "Topics are worked out from your words"}</span>
            )}
            <button type="button" onClick={() => setPickingTopics(true)} className="font-semibold text-accent-text hover:underline">Change</button>
          </div>
        )}
        {!mediaBlocked && pickingTopics && (
          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-callout font-medium">
              <Tags size={16} aria-hidden="true" /> Topics
              <span className="font-normal text-fg-subtle">Up to {MAX_POST_TOPICS}</span>
            </legend>
            <InterestToggles value={shownTopics} max={MAX_POST_TOPICS} label="Topics"
              onChange={(v) => { setTopicsTouched(true); setTopics(v); }} />
            <p className="mt-2 text-caption text-fg-subtle">Topics put your post in front of people who follow that interest.</p>
          </fieldset>
        )}

        {picked && spec.media && (
          <div className="rounded-card border border-line bg-surface p-3">
            <Checkbox checked={ai} onChange={setAi}
              description="Tick this if AI made or changed this in a way someone could mistake for real. Mesh shows a “Made with AI” label. Creative use is welcome; passing it off as real isn't.">
              <span className="inline-flex items-center gap-1.5"><WandSparkles size={15} aria-hidden="true" /> Made with AI</span>
            </Checkbox>
          </div>
        )}
      </form>
      {gifPicker && <GifPicker onClose={() => setGifPicker(false)} onPick={(g) => { setGif(g); setGifPicker(false); }} />}
      {camera && (
        <Suspense fallback={null}>
          <Camera title={spec.media === "image" ? "Take a photo" : "Record a Flick"} photo={spec.media === "image"} video={spec.media === "video"}
            actions={[{ id: "use", label: spec.media === "image" ? "Use photo" : "Use video", primary: true }]}
            onClose={() => setCamera(false)}
            onLibrary={(list) => { setCamera(false); if (spec.media === "image") addPhotos(list); else choose(list[0]); }}
            onDone={(_, f) => { setCamera(false); if (spec.media === "image") addPhotos([f]); else choose(f); }} />
        </Suspense>
      )}
    </Dialog>
  );
}

function Visibility({ value, onChange, locked }) {
  const opts = [
    { id: "public", label: "Everyone", icon: Globe },
    { id: "followers", label: "Followers", icon: Lock },
  ];
  return (
    <div role="radiogroup" aria-label="Who can see this" className="inline-flex rounded-control bg-surface-2 p-1">
      {opts.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} disabled={locked && o.id === "public"}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                if (!locked) onChange(o.id === "public" ? "followers" : "public");
              }
            }}
            tabIndex={on ? 0 : -1}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-caption font-semibold transition-colors disabled:opacity-40 ${
              on ? "bg-surface-3 text-fg shadow-raised" : "text-fg-subtle hover:text-fg-muted"
            }`}>
            <Icon size={14} aria-hidden="true" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Trailer window picker; the preview loops the selected window.
function TrailerPicker({ src, duration, value, onChange }) {
  const ref = useRef(null);
  const max = Math.max(0, Math.floor(duration - TRAILER_SECONDS));
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (el) el.currentTime = value;
  }, [value]);

  const onTime = () => {
    const el = ref.current;
    if (el && el.currentTime >= value + TRAILER_SECONDS) el.currentTime = value;
  };

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-callout font-semibold">Trailer</p>
      <p className="mt-0.5 text-caption text-fg-subtle">
        These {TRAILER_SECONDS} seconds play in Flicks. Tapping through opens all {spokenDuration(duration)}.
      </p>
      <video ref={ref} src={src} muted playsInline autoPlay onTimeUpdate={onTime} aria-label="Trailer preview"
        className="mt-3 aspect-video w-full rounded-control bg-black object-contain" />
      <label htmlFor={id} className="mt-3 flex items-center justify-between text-callout">
        <span>Starts at</span>
        <span className="tabular font-semibold">{formatDuration(value)} – {formatDuration(Math.min(duration, value + TRAILER_SECONDS))}</span>
      </label>
      <input id={id} type="range" min={0} max={max} step={1} value={value} disabled={max === 0}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`Trailer starts at ${formatDuration(value)}`}
        className="mt-2 h-11 w-full cursor-pointer accent-violet-500" />
    </div>
  );
}

// Selected photo preview plus the ordered strip. Index 0 is the cover.
function PhotoSet({ photos, active, onActive, busy, onRemove, onMove, onAdd, onCamera }) {
  const addRef = useRef(null);
  const current = photos[active] || photos[0];
  return (
    <div>
      <div className="relative overflow-hidden rounded-card border border-line bg-black">
        <img src={current.url} alt={current.alt.trim() || `Photo ${active + 1} of ${photos.length}`}
          className="max-h-96 min-h-48 w-full object-contain" />
        {photos.length > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-label font-semibold text-white tabular">
            {active + 1}/{photos.length}
          </span>
        )}
      </div>
      <ul className="mt-2 flex gap-2 overflow-x-auto px-1 pb-1 pt-2 no-scrollbar" aria-label="Photos in this post, in order">
        {photos.map((ph, i) => (
          <li key={ph.id} className="relative shrink-0">
            <button type="button" onClick={() => onActive(i)} aria-label={`Photo ${i + 1}${i === 0 ? ", the cover" : ""}`} aria-current={i === active || undefined}
              className={`press block h-16 w-16 overflow-hidden rounded-control ring-2 ring-offset-2 ring-offset-canvas ${i === active ? "ring-accent" : "ring-transparent"}`}>
              <img src={ph.url} alt="" className="h-full w-full object-cover" />
            </button>
            {!busy && (
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove photo ${i + 1}`}
                className="press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-canvas">
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {photos.length < MAX_SLIDES && !busy && (
          <li className="shrink-0">
            <button type="button" onClick={() => addRef.current?.click()} aria-label="Add more photos"
              className="press flex h-16 w-16 items-center justify-center rounded-control border-2 border-dashed border-field text-fg-muted hover:text-fg">
              <Plus size={20} aria-hidden="true" />
            </button>
            <input ref={addRef} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
          </li>
        )}
        {photos.length < MAX_SLIDES && !busy && onCamera && (
          <li className="shrink-0">
            <button type="button" onClick={onCamera} aria-label="Take another photo"
              className="press flex h-16 w-16 items-center justify-center rounded-control border-2 border-dashed border-field text-fg-muted hover:text-fg">
              <CameraIcon size={20} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
      {photos.length > 1 && !busy && (
        <div className="mt-1 flex items-center gap-1 text-caption text-fg-subtle">
          <span className="mr-1">{active === 0 ? "Photo 1 is the cover." : `Photo ${active + 1} of ${photos.length}.`} Move it:</span>
          <IconButton icon={ChevronLeft} label="Move this photo earlier" size={16} disabled={active === 0} onClick={() => onMove(active, -1)} />
          <IconButton icon={ChevronRight} label="Move this photo later" size={16} disabled={active === photos.length - 1} onClick={() => onMove(active, 1)} />
        </div>
      )}
    </div>
  );
}
