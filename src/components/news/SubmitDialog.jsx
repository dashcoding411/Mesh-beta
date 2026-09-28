// Submitting a story for review.
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { submitNews, uploadMedia } from "../../lib/db";
import { plural } from "../../lib/format";
import { NEWS_TOPICS } from "../../lib/interests";
import { checkContent, markPosted } from "../../lib/moderation";
import { LIMITS, validateSources, validateText } from "../../lib/validate";
import { CITE } from "./text";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/Field";
import { InlineMessage } from "../ui/States";

export function SubmitDialog({ onClose, onSubmitted }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("world");
  const [location, setLocation] = useState("");
  const [keyPoints, setKeyPoints] = useState(["", "", ""]);
  const [script, setScript] = useState("");
  const [sources, setSources] = useState("");
  const [cover, setCover] = useState(null);
  const [preview, setPreview] = useState("");
  const [attest, setAttest] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickCover = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors((x) => ({ ...x, cover: "Choose a photo (JPEG, PNG, WebP or HEIC)." }));
    if (file.size > 20 * 1024 * 1024) return setErrors((x) => ({ ...x, cover: "That photo is over 20 MB." }));
    setErrors((x) => ({ ...x, cover: "" }));
    setCover(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const t = title.trim();
    if (t.length < LIMITS.newsTitle.min) errs.title = `Headlines need at least ${LIMITS.newsTitle.min} characters.`;
    const vScript = validateText(script, LIMITS.newsScript.max, "Script");
    if (vScript.error) errs.script = vScript.error;
    else if (vScript.text.length < LIMITS.newsScript.min) errs.script = `Include the full script, at least ${LIMITS.newsScript.min} characters.`;
    const vSources = validateSources(sources);
    if (vSources.error) errs.sources = vSources.error;
    else if (!errs.script) {
      const cited = [...vScript.text.matchAll(CITE)].map((m) => Number(m[1]));
      const tooHigh = cited.find((n) => n > vSources.sources.length || n < 1);
      if (tooHigh !== undefined) errs.script = `You cite [${tooHigh}] but list ${plural(vSources.sources.length, "source")}.`;
      else if (!cited.length) errs.script = "Cite your sources in the text by number, like [1] or [2], so readers can check each claim.";
    }
    const points = keyPoints.map((k) => k.trim()).filter(Boolean);
    if (points.some((k) => k.length > 200)) errs.keyPoints = "Keep each key point under 200 characters.";
    if (location.trim().length > 80) errs.location = "Keep the location under 80 characters.";
    if (!attest) errs.attest = "Confirm the declaration to submit.";
    if (!errs.title && !errs.script) {
      const mod = checkContent(`${t}\n${points.join("\n")}\n${vScript.text}`, { key: "news" });
      if (mod.error) errs.script = mod.error;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const coverUrl = cover ? (await uploadMedia(cover)).url : "";
      await submitNews({ title: t, script: vScript.text, sources: vSources.sources, topic, keyPoints: points, location: location.trim(), coverUrl });
      markPosted("news", `${t}\n${vScript.text}`);
      onSubmitted();
    } catch (err) {
      console.error(err);
      setErrors({ submit: err?.code === "permission-denied"
        ? "The server turned this down. Under-16 accounts can't submit news; if that's not you, the rules may need redeploying."
        : "Couldn't submit. Check your connection. Your story is still here." });
      setBusy(false);
    }
  };

  return (
    <Dialog title="Submit a news story" onClose={onClose} variant="full" size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0"><InlineMessage>{errors.submit}</InlineMessage></div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form="news-form" variant="primary" loading={busy}>Send for review</Button>
          </div>
        </div>
      }>
      <form id="news-form" onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-callout text-fg-muted">
          A reviewer checks your story against its sources before anyone sees it. Give them everything they need.
        </p>
        <Field label="Headline" error={errors.title} count={title.length} max={LIMITS.newsTitle.max}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.newsTitle.max}
            placeholder="State what happened, plainly" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Topic">
            <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {NEWS_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Where it happened" optional error={errors.location}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} placeholder="e.g. Geelong, VIC" />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-callout font-medium">Key points <span className="font-normal text-fg-subtle">Optional, up to 3</span></legend>
          <p className="mb-2 text-caption text-fg-subtle">The story in three lines, for people skimming. The first one is shown on the front page.</p>
          <div className="space-y-2">
            {keyPoints.map((k, i) => (
              <Input key={i} value={k} maxLength={200} aria-label={`Key point ${i + 1}`} placeholder={`Key point ${i + 1}`}
                onChange={(e) => setKeyPoints((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
          </div>
          <div aria-live="polite"><InlineMessage>{errors.keyPoints}</InlineMessage></div>
        </fieldset>
        <Field label="Full script" hint="Everything you'll say. Cite a source by its number, like [1], after the claim it supports."
          error={errors.script} count={script.length} max={LIMITS.newsScript.max}>
          <Textarea autoGrow rows={8} maxRows={20} value={script} onChange={(e) => setScript(e.target.value)} maxLength={LIMITS.newsScript.max} />
        </Field>
        <Field label="Sources" hint={`At least ${LIMITS.newsSources.min}, up to ${LIMITS.newsSources.max}. One link per line, in the order you number them.`} error={errors.sources}>
          <Textarea autoGrow rows={3} value={sources} onChange={(e) => setSources(e.target.value)}
            placeholder={"https://… (this is [1])\nhttps://… (this is [2])"} spellCheck={false} autoCapitalize="none" />
        </Field>
        <div>
          <p className="mb-2 text-callout font-medium">Cover photo <span className="font-normal text-fg-subtle">Optional</span></p>
          {preview ? (
            <div className="relative overflow-hidden rounded-card border border-line">
              <img src={preview} alt="Your chosen cover" className="aspect-[16/9] w-full object-cover" />
              <Button size="sm" icon={X} className="absolute right-2 top-2" onClick={() => { setCover(null); setPreview(""); }}>Remove</Button>
            </div>
          ) : (
            <Button icon={ImagePlus} onClick={() => fileRef.current?.click()}>Add a cover photo</Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="mt-2 text-caption text-fg-subtle">Only a photo you took or have the right to use. No AI-generated images.</p>
          <div aria-live="polite"><InlineMessage>{errors.cover}</InlineMessage></div>
        </div>
        <div className={`rounded-card border p-3 ${errors.attest ? "border-danger-text" : "border-line"} bg-surface`}>
          <Checkbox checked={attest} onChange={(v) => { setAttest(v); setErrors((x) => ({ ...x, attest: "" })); }}
            description="Your confirmation is recorded with the submission.">
            This story is accurate to the best of my knowledge, and nothing in it (images, footage, audio or quotes) was
            generated or altered by AI to look real.
          </Checkbox>
          <div aria-live="polite"><InlineMessage>{errors.attest}</InlineMessage></div>
        </div>
      </form>
    </Dialog>
  );
}
