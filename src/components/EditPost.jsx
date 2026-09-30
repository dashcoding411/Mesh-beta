import { useState } from "react";
import { editPost, kindLabel, STRAND_MAX } from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent } from "../lib/moderation";
import { MAX_POST_TOPICS } from "../lib/interests";
import { InterestToggles } from "./Interests";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import { Field, Input, Textarea } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* Fix a typo, a caption or a description on your own post. The photo or
   video and any poll stay as they are (people may already have voted), and
   the post shows "Edited" to everyone. The words go through the same check
   as a new post. */
export default function EditPostDialog({ post, onClose, onSaved }) {
  const toast = useToast();
  const label = kindLabel(post);
  const long = post.kind === "video";
  const isStrand = post.kind === "text";
  const [text, setText] = useState(post.text || "");
  const [title, setTitle] = useState(post.title || "");
  const [alt, setAlt] = useState(post.alt || "");
  const [location, setLocation] = useState(post.location || "");
  const [topics, setTopics] = useState(post.topics || []);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ for: "", text: "" });
  const max = isStrand ? STRAND_MAX : LIMITS.text;
  const fingerprint = `${title}|${text}|${alt}|${location}`;

  const save = async (e) => {
    e.preventDefault();
    const err = {};
    const vText = validateText(text, max, isStrand ? "Strand" : long ? "Description" : "Caption");
    if (vText.error) err.text = vText.error;
    else if (isStrand && !vText.text && !post.gif) err.text = "Write something, or delete the post instead.";
    if (long) {
      const vTitle = validateText(title, LIMITS.title, "Title");
      if (vTitle.error) err.title = vTitle.error;
      else if (!vTitle.text) err.title = "Long Flicks need a title.";
    }
    const pollText = post.poll ? post.poll.options.join("\n") : "";
    const mod = checkContent(`${long ? title : ""}\n${text}\n${post.kind === "post" ? alt : ""}\n${pollText}\n${location}`,
      { key: "edit", skipCooldown: true, allowQuoted: true });
    if (!err.text && mod.error) err.text = mod.error;
    setErrors(err);
    if (Object.keys(err).length) {
      document.getElementById(`edit-${err.title ? "title" : "text"}`)?.focus();
      return;
    }
    // Same as posting: borderline words need a second, deliberate press.
    if (mod.note && note.for !== fingerprint) return setNote({ for: fingerprint, text: mod.note });

    setBusy(true);
    try {
      const changes = await editPost(post, {
        text: vText.text || "",
        title: long ? title.trim() : post.title || "",
        alt: post.kind === "post" ? alt.trim().slice(0, LIMITS.alt) : post.alt || "",
        location: post.kind !== "text" ? location.trim().slice(0, 60) : undefined,
        topics,
        sensitive: !!mod.sensitive,
      });
      toast({ title: `${label} updated` });
      onSaved(changes);
    } catch (er) {
      console.error(er);
      setBusy(false);
      setErrors({
        submit: er?.code === "permission-denied"
          ? "Couldn't save that. Wait a few seconds between edits and try again."
          : "Couldn't save your changes. Check your connection. Your edits are still here.",
      });
    }
  };

  const warned = note.for === fingerprint;

  return (
    <Dialog title={`Edit ${label.toLowerCase()}`} onClose={busy ? undefined : onClose} dismissible={!busy} size="lg"
      footer={
        <div className="space-y-3">
          <div aria-live="polite"><InlineMessage>{errors.submit}</InlineMessage></div>
          {warned && <p role="status" className="rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">{note.text}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" form="edit-post-form" variant="primary" loading={busy}>
              {warned ? "Save anyway" : "Save"}
            </Button>
          </div>
        </div>
      }>
      <form id="edit-post-form" onSubmit={save} className="space-y-5" noValidate>
        {long && (
          <Field label="Title" error={errors.title} count={title.length} max={LIMITS.title}>
            <Input id="edit-title" value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        )}
        <Field label={isStrand ? "Strand" : long ? "Description" : "Caption"} error={errors.text}
          count={text.length} max={max} optional={!isStrand}>
          <Textarea id="edit-text" autoGrow rows={3} maxRows={12} value={text} maxLength={max}
            onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
        {post.kind !== "text" && (
          <Field label="Location" optional count={location.length} max={60}>
            <Input value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} placeholder="Where was this?" />
          </Field>
        )}
        {post.kind === "post" && (
          <Field label={post.media?.length > 1 ? "Alt text for the first photo" : "Alt text"} hint="Describes the photo for people using screen readers." optional
            count={alt.length} max={LIMITS.alt}>
            <Textarea autoGrow rows={2} maxRows={6} value={alt} maxLength={LIMITS.alt} onChange={(e) => setAlt(e.target.value)} />
          </Field>
        )}
        <div>
          <p className="mb-2 text-callout font-medium text-fg">
            Topics <span className="ml-1.5 font-normal text-fg-subtle">Up to {MAX_POST_TOPICS}</span>
          </p>
          <InterestToggles value={topics} onChange={setTopics} max={MAX_POST_TOPICS} label="Topics" />
        </div>
        {post.poll && (
          <p className="text-caption text-fg-subtle">The poll's choices can't be changed once people can vote.</p>
        )}
      </form>
    </Dialog>
  );
}
