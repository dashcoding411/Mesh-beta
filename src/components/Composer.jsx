import { useEffect, useMemo, useState } from "react";
import { LIMITS, validateText, validateMediaFile } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import { uploadMedia, createPost, isMinor, StorageUnavailableError, storageAvailable, screenPost } from "../lib/db";

/* Every format is visual — a Still needs a photo the same way a Flick needs a
   video. Text rides along as a caption, never as the whole post. */
const KINDS = [
  { id: "post", label: "Still", hint: "A photo, with a caption", media: "image", accept: "image/*" },
  { id: "short", label: "Flick", hint: "Quick vertical video", media: "video", accept: "video/*" },
  { id: "video", label: "Feature", hint: "Long-form video with a title", media: "video", accept: "video/*" },
];

export default function Composer({ onClose, onPosted, groupId, group, profile }) {
  const minor = isMinor(profile);
  const [kind, setKind] = useState("post");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState(minor ? "followers" : "public");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [mediaReady, setMediaReady] = useState(null); // null = still checking

  const spec = KINDS.find((k) => k.id === kind);

  useEffect(() => { storageAvailable().then(setMediaReady).catch(() => setMediaReady(false)); }, []);

  // Local preview so people see what they're about to post. Derived from the
  // file rather than mirrored into state, and revoked when it changes.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    const vText = validateText(text, LIMITS.text, "Caption");
    if (vText.error) return setError(vText.error);
    if (kind === "video") {
      const vTitle = validateText(title, LIMITS.title, "Title");
      if (vTitle.error) return setError(vTitle.error);
      if (!vTitle.text) return setError("Videos need a title.");
    }
    if (!file) {
      return setError(
        kind === "post" ? "Stills need a photo." : `${spec.label}s need a ${spec.media}.`
      );
    }
    const vFile = validateMediaFile(file, spec.media);
    if (vFile.error) return setError(vFile.error);
    // Platform moderation: hate speech, spam, cooldown.
    const mod = checkContent(`${title}\n${text}`);
    if (mod.error) return setError(mod.error);
    // Then the circle's own automated rules, if it has any.
    if (group) {
      const blocked = screenPost(`${title}\n${text}`, group, profile);
      if (blocked) return setError(blocked);
    }

    try {
      let media = { url: "", path: "" };
      if (file) {
        setProgress(0);
        media = await uploadMedia(file, setProgress);
      }
      const post = await createPost({
        kind,
        text: vText.text,
        title: kind === "video" ? title.trim() : "",
        mediaUrl: media.url,
        mediaPath: media.path,
        mediaType: file ? file.type : "",
        groupId,
        // Group posts are gated by membership, so they stay 'public' within
        // the group — that also keeps group queries satisfiable by the rules.
        visibility: groupId ? "public" : minor ? "followers" : visibility,
      });
      markPosted();
      onPosted(kind, post);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof StorageUnavailableError
          ? err.message
          : err?.code === "permission-denied"
            ? "That post was rejected by the server rules."
            : "Upload failed — check your connection and try again."
      );
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 anim-fade" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 p-5 anim-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{groupId ? "Post to group" : "Create"}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">✕</button>
        </div>

        {!groupId && (
          <div className="flex gap-2 mb-4">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => { setKind(k.id); setFile(null); setError(""); }}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  kind === k.id
                    ? "border-violet-500 bg-violet-600/20 text-violet-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500 mb-3">{spec.hint}</p>

        {mediaReady === false && (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-300">Media uploads aren't switched on</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Every post on Mesh needs a photo or video, and Cloud Storage needs the Firebase
              Blaze plan before uploads work. Turn it on in the Firebase console, then deploy
              the storage rules — posting starts working immediately.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {kind === "video" && (
            <input
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500"
              placeholder="Give it a title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={LIMITS.title}
            />
          )}
          <textarea
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm h-24 resize-none focus:outline-none focus:border-violet-500"
            placeholder="Write a caption…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LIMITS.text}
          />
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
              {spec.media === "image" ? (
                <img src={preview} alt="" className="max-h-64 w-full object-contain" />
              ) : (
                <video src={preview} controls playsInline className="max-h-64 w-full" />
              )}
              <button type="button" onClick={() => setFile(null)} aria-label="Remove media"
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/70 text-sm hover:bg-black">
                &#10005;
              </button>
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-3 py-8 text-sm cursor-pointer transition ${
              mediaReady === false
                ? "border-zinc-800 text-zinc-600 cursor-not-allowed"
                : "border-zinc-700 text-zinc-400 hover:border-violet-500"
            }`}>
              <span className="text-2xl opacity-50">{spec.media === "image" ? "\u25a7" : "\u25b6"}</span>
              <span className="font-medium">
                {spec.media === "image" ? "Add a photo" : "Add a video"}
              </span>
              <span className="text-xs text-zinc-600">
                {spec.media === "image" ? "Required \u00b7 up to 10 MB" : "Required \u00b7 up to 200 MB"}
              </span>
              <input type="file" accept={spec.accept} className="hidden"
                disabled={mediaReady === false}
                onChange={(e) => setFile(e.target.files[0] || null)} />
            </label>
          )}

          {!groupId && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-zinc-500">Who can see this?</span>
              <select
                value={minor ? "followers" : visibility}
                disabled={minor}
                onChange={(e) => setVisibility(e.target.value)}
                className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm focus:outline-none focus:border-violet-500 disabled:opacity-60"
              >
                <option value="public">Everyone</option>
                <option value="followers">Followers only</option>
              </select>
              {minor && <span className="text-[11px] text-zinc-500">Under-16 accounts post to followers only.</span>}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {progress !== null && (
            <div className="h-2 rounded bg-zinc-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <button
            disabled={progress !== null}
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 py-3 font-semibold text-sm"
          >
            {progress !== null ? `Uploading ${progress}%` : "Share"}
          </button>
        </form>
      </div>
    </div>
  );
}
