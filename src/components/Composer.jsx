import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Clapperboard, Image, Type, Globe, Lock, ImagePlus, FileVideo, X, WandSparkles, Info, ChartBar, Tags } from "lucide-react";
import { LIMITS, validateText, validateMediaFile } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import {
  uploadMedia, createPost, isMinor, StorageUnavailableError, storageAvailable, screenPost,
  circlePostVisibility, STRAND_MAX, LONG_VIDEO_SECONDS, TRAILER_SECONDS,
} from "../lib/db";
import { formatDuration, spokenDuration, relativeTime } from "../lib/format";
import { suggestTopics, MAX_POST_TOPICS } from "../lib/interests";
import { gifsEnabled } from "../lib/gifs";
import { readDraft, useDraft } from "../lib/drafts";
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

// Remembered for the visit: people tend to post the same kind of thing twice.
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

/* Create. One composer for the three formats, and the Flick tab decides
   short or long for you from the video's length: over three minutes it
   becomes a long Flick, asks for a title, and lets you pick which thirty
   seconds play as its trailer in the Flicks feed.

   Nothing you've typed or picked is lost when something fails. */
export default function Composer({ onClose, onPosted, groupId, group, membership, profile, kind: initialKind, attach, text: initialText = "", circleTopic: initialCircleTopic }) {
  const toast = useToast();
  // Under-16s and private (locked) accounts post to followers only; the rules enforce it too.
  const minor = isMinor(profile) || !!profile?.isPrivate;
  // What you were writing last time, unless you've arrived with something
  // specific to post (a poll or GIF from the feed, say).
  const draftScope = groupId ? `circle:${groupId}` : "post";
  const [draft] = useState(() => (initialText || attach ? null : readDraft(draftScope)));
  const d = draft?.data || {};
  const [kind, setKind] = useState(initialKind || d.kind || lastKind);
  const [text, setText] = useState(d.text ?? initialText);
  const [title, setTitle] = useState(d.title || "");
  const [alt, setAlt] = useState(d.alt || "");
  const [ai, setAi] = useState(false);
  const [visibility, setVisibility] = useState(minor ? "followers" : d.visibility || "public");
  const [restored, setRestored] = useState(!!draft);
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [trailerStart, setTrailerStart] = useState(0);
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(null);
  // A borderline or quoted post needs a second, deliberate press, with a note
  // saying what happens next. Any edit resets it.
  const [warned, setWarned] = useState("");
  const [note, setNote] = useState("");
  const [mediaReady, setMediaReady] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [topics, setTopics] = useState(d.topics || []);
  const [circleTopic, setCircleTopic] = useState(initialCircleTopic || "");
  const [topicsTouched, setTopicsTouched] = useState(!!d.topics);
  const [poll, setPoll] = useState(d.poll || (attach === "poll" ? { options: ["", ""], hours: 24 } : null));
  const [gif, setGif] = useState(d.gif || null);
  const [gifPicker, setGifPicker] = useState(attach === "gif" && gifsEnabled);
  const fileInput = useRef(null);
  const fileId = useId();

  const spec = KINDS.find((k) => k.id === kind);
  // Suggest topics from the words until the author picks their own.
  const shownTopics = topicsTouched ? topics : suggestTopics(`${title} ${text}`);
  const long = kind === "video" && duration > LONG_VIDEO_SECONDS;
  const busy = progress !== null;

  useEffect(() => { storageAvailable().then(setMediaReady).catch(() => setMediaReady(false)); }, []);

  // Words and choices are saved as you go; a photo or video can't be.
  const hasWords = !!(text.trim() || title.trim() || alt.trim() || gif || poll?.options.some((o) => o.trim()));
  const finishDraft = useDraft(draftScope, hasWords ? {
    kind, text, title, alt, visibility, gif,
    poll: kind === "text" ? poll : null,
    topics: topicsTouched ? topics : undefined,
  } : null);
  const discardDraft = () => {
    setText(""); setTitle(""); setAlt(""); setPoll(null); setGif(null);
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
    // A photo can't become a video; keep the words, drop the file.
    if (KINDS.find((x) => x.id === k).media !== spec.media) { setFile(null); setDuration(0); setAlt(""); }
  };

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
    if (spec.media && !file) e.file = kind === "post" ? "Add a photo. Stills are photos." : "Add a video.";
    if (long) {
      const vTitle = validateText(title, LIMITS.title, "Title");
      if (vTitle.error) e.title = vTitle.error;
      else if (!vTitle.text) e.title = "Long Flicks need a title. It's what people see before they commit.";
    }
    // Everything someone else will read goes through the same check.
    const pollText = kind === "text" && poll ? poll.options.join("\n") : "";
    const altText = spec.media === "image" ? alt : "";
    const mod = checkContent(`${long ? title : ""}\n${text}\n${pollText}\n${altText}`, { key: "post", allowQuoted: true });
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
      // Send focus to the first field that needs attention.
      const first = ["file", "title", "text", "poll"].find((k) => e[k]);
      document.getElementById(`composer-${first}`)?.focus();
      return;
    }
    const fingerprint = `${title}|${text}|${alt}|${poll?.options.join("|") || ""}`;
    if (modNote && warned !== fingerprint) { setWarned(fingerprint); setNote(modNote); return; }
    try {
      let media = { url: "", path: "" };
      if (file) {
        setProgress(0);
        media = await uploadMedia(file, setProgress);
      }
      const post = await createPost({
        kind: kind === "video" ? (long ? "video" : "short") : kind,
        text: clean,
        title: long ? title.trim() : "",
        alt: spec.media === "image" ? alt.trim().slice(0, LIMITS.alt) : "",
        mediaUrl: media.url,
        mediaPath: media.path,
        mediaType: file ? file.type : "",
        duration,
        trailerStart: long ? trailerStart : 0,
        aiGenerated: spec.media ? ai : false,
        topics: shownTopics,
        sensitive,
        poll: kind === "text" && poll ? { options: poll.options.map((o) => o.trim()).filter(Boolean), hours: poll.hours } : null,
        gif: kind === "text" && gif ? { url: gif.url, width: gif.width, height: gif.height, title: gif.title } : null,
        groupId,
        // In a circle the circle decides: members-only for private circles,
        // and "pending" when the circle wants to approve posts first.
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

  // Photos work without Cloud Storage (stored compressed in Firestore); video doesn't.
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
            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
                className={`flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-accent-text bg-accent-soft" : errors.file ? "border-danger-text" : "border-field"
                }`}>
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                  {spec.media === "image" ? <ImagePlus size={24} aria-hidden="true" /> : <FileVideo size={24} aria-hidden="true" />}
                </span>
                <p className="text-callout font-semibold">
                  {spec.media === "image" ? "Add a photo" : "Add a video"}
                </p>
                <p className="mt-1 text-caption text-fg-subtle">
                  {spec.media === "image"
                    ? "JPG, PNG, WebP or GIF · up to 10 MB"
                    : `Up to 200 MB. Over ${LONG_VIDEO_SECONDS / 60} minutes becomes a long Flick with a trailer.`}
                </p>
                <Button id="composer-file" className="mt-4" onClick={() => fileInput.current?.click()}
                  aria-describedby={errors.file ? `${fileId}-err` : undefined}>
                  Choose {spec.media === "image" ? "a photo" : "a video"}
                </Button>
                <p className="mt-2 hidden text-label text-fg-subtle md:block">or drag it here</p>
                <input ref={fileInput} type="file" accept={spec.media === "image" ? "image/*" : "video/*"} className="hidden"
                  tabIndex={-1} aria-hidden="true" onChange={(e) => { choose(e.target.files[0]); e.target.value = ""; }} />
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-card border border-line bg-black">
                {spec.media === "image" ? (
                  <img src={preview} alt={alt.trim() || "The photo you picked"} className="max-h-80 w-full object-contain" />
                ) : (
                  <video src={preview} controls playsInline className="max-h-80 w-full" aria-label="The video you picked" />
                )}
                {!busy && (
                  <IconButton icon={X} label={`Remove ${spec.media === "image" ? "photo" : "video"}`} tone="overlay"
                    className="absolute right-2 top-2" onClick={() => { setFile(null); setDuration(0); setAlt(""); }} />
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

        {file && spec.media === "image" && (
          <Field label="Describe this photo" optional count={alt.length} max={LIMITS.alt}
            hint="Read aloud to people using screen readers. Leave it blank and your caption is used instead.">
            <Textarea autoGrow rows={2} maxRows={5} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={LIMITS.alt}
              placeholder="e.g. Two friends laughing on a beach at sunset" />
          </Field>
        )}

        {group?.topics?.length > 0 && (
          <div>
            <p className="mb-2 text-callout font-medium">Topic in {group.name} <span className="font-normal text-fg-subtle">Optional</span></p>
            <TopicChips topics={group.topics} value={circleTopic} onChange={setCircleTopic} label={`Topic in ${group.name}`} />
          </div>
        )}

        {!mediaBlocked && (
          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-callout font-medium">
              <Tags size={16} aria-hidden="true" /> Topics
              <span className="font-normal text-fg-subtle">Up to {MAX_POST_TOPICS}{!topicsTouched && shownTopics.length ? ", suggested from your words" : ""}</span>
            </legend>
            <InterestToggles value={shownTopics} max={MAX_POST_TOPICS} label="Topics"
              onChange={(v) => { setTopicsTouched(true); setTopics(v); }} />
            <p className="mt-2 text-caption text-fg-subtle">Topics put your post in front of people who follow that interest.</p>
          </fieldset>
        )}

        {file && spec.media && (
          <div className="rounded-card border border-line bg-surface p-3">
            <Checkbox checked={ai} onChange={setAi}
              description="Tick this if AI made or changed this in a way someone could mistake for real. Mesh shows a “Made with AI” label. Creative use is welcome; passing it off as real isn't.">
              <span className="inline-flex items-center gap-1.5"><WandSparkles size={15} aria-hidden="true" /> Made with AI</span>
            </Checkbox>
          </div>
        )}
      </form>
      {gifPicker && <GifPicker onClose={() => setGifPicker(false)} onPick={(g) => { setGif(g); setGifPicker(false); }} />}
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

/* Pick which thirty seconds of a long video play as its trailer. The preview
   loops exactly that window so what you see is what the feed will show. */
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
