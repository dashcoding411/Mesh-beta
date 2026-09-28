import { useState } from "react";
import { Image, Clapperboard, Lock, ChartBar, Sticker } from "lucide-react";
import { gifsEnabled } from "../lib/gifs";
import { createPost, isMinor, STRAND_MAX } from "../lib/db";
import { validateText } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { Textarea } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* The fastest way to say something: a Strand, typed straight into the top
   of the feed. Photo and Flick open the full composer, since those need a
   file. What you typed stays put if the post fails. */
export default function QuickPost({ onPosted }) {
  const { profile, openComposer } = useShell();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [warned, setWarned] = useState("");
  // Under-16s and private (locked) accounts post to followers only; the rules enforce it too.
  const minor = isMinor(profile) || !!profile?.isPrivate;
  const remaining = STRAND_MAX - text.length;

  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, STRAND_MAX, "Strand");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "post", allowQuoted: true });
    if (mod.error) return setError(mod.error);
    if (mod.note && !warned) return setWarned(mod.note);
    setBusy(true);
    setError("");
    try {
      const post = await createPost({ kind: "text", text: v.text, visibility: minor ? "followers" : "public", sensitive: mod.sensitive });
      markPosted("post", v.text);
      setText("");
      setWarned("");
      setFocused(false);
      onPosted?.(post);
      toast({ title: "Strand posted" });
    } catch (err) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "The server turned that down. If this keeps happening, the posting rules may need redeploying."
        : "Couldn't post. Check your connection. Your words are still here.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="group flex gap-3 border-b border-line px-4 py-4" aria-label="Post a Strand">
      <Avatar profile={profile} size={40} />
      <div className="min-w-0 flex-1">
        <label htmlFor="quick-strand" className="sr-only">Write a Strand</label>
        <Textarea id="quick-strand" autoGrow rows={1} maxRows={10} value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => { setText(e.target.value); setWarned(""); if (error) setError(""); }}
          placeholder="What's on your mind?" maxLength={STRAND_MAX}
          aria-invalid={error ? "true" : undefined} aria-describedby="quick-strand-help"
          className="!border-transparent !bg-transparent !px-0 !py-1.5 !text-title-3 !font-normal hover:!border-transparent focus:!ring-0" />

        <div id="quick-strand-help" aria-live="polite" className="mt-1">
          <InlineMessage>{error}</InlineMessage>
          {warned && (
            <p className="mt-1 text-caption text-warning-text">{warned}</p>
          )}
          {minor && focused && (
            <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
              <Lock size={12} aria-hidden="true" /> {profile?.isPrivate ? "Your account is private, so this goes to your followers." : "Under-16 accounts post to followers only."}
            </p>
          )}
        </div>

        {/* The divider lights up while the box has focus, the textarea itself
            is borderless, so this is its visible focus indicator. */}
        <div className="mt-2 flex items-center gap-1 border-t border-line pt-2 transition-colors group-focus-within:border-accent-text">
          <IconButton icon={Image} label="Post a photo" size={20} onClick={() => openComposer({ kind: "post" })} className="-ml-2.5 text-accent-text" />
          <IconButton icon={Clapperboard} label="Post a Flick" size={20} onClick={() => openComposer({ kind: "video" })} className="text-accent-text" />
          <IconButton icon={ChartBar} label="Ask with a poll" size={20} onClick={() => openComposer({ kind: "text", attach: "poll", text })} className="text-accent-text" />
          {gifsEnabled && <IconButton icon={Sticker} label="Post a GIF" size={20} onClick={() => openComposer({ kind: "text", attach: "gif", text })} className="text-accent-text" />}
          <span className="flex-1" />
          {text.length > 0 && (
            <span className={`mr-2 tabular text-caption ${remaining < 0 ? "text-danger-text" : remaining <= 40 ? "text-warning-text" : "text-fg-subtle"}`}
              aria-label={`${remaining} characters left`}>
              {remaining}
            </span>
          )}
          <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!text.trim() || remaining < 0}>
            {warned ? "Post anyway" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
