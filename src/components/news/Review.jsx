// A story waiting for review, and the checklist a reviewer ticks before publishing.
import { Check, MapPin, X } from "lucide-react";
import { useState } from "react";
import { shortTime } from "../../lib/format";
import { StoryBody } from "./StoryBody";
import { TopicLabel } from "./parts";
import Button from "../ui/Button";
import { Checkbox, Field, Textarea } from "../ui/Field";
import MediaImg from "../ui/MediaImg";

const CHECKS = [
  "Every claim in the script is supported by one of its sources",
  "The sources are real, reachable, and say what the story says they say",
  "No photos, footage, audio or quotes look generated or altered",
];

/* Approving needs the checklist ticked, so review is a deliberate act,
   not a button pressed on the way past. */
export function ReviewCard({ item, onReview }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState([]);
  const ready = checked.length === CHECKS.length;
  return (
    <article aria-labelledby={`rv-${item.id}`} className="rounded-card border border-accent-text bg-surface p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label">
        <TopicLabel id={item.topic} />
        {item.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{item.location}</span>}
        <span className="text-fg-subtle">by @{item.authorName} · {shortTime(item.createdAt)}</span>
      </p>
      <h3 id={`rv-${item.id}`} className="mt-2 text-title-2">{item.title}</h3>
      {item.coverUrl && <MediaImg src={item.coverUrl} alt="Submitted cover photo" className="mt-3 aspect-[16/9] w-full rounded-control object-cover" placeholderClass="mt-3 aspect-[16/9] w-full rounded-control" />}
      <StoryBody story={item} />

      <div className="mt-5 border-t border-line pt-4">
        {!rejecting ? (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-callout font-semibold">Before you publish</legend>
              {CHECKS.map((c, i) => (
                <Checkbox key={i} checked={checked.includes(i)}
                  onChange={(v) => setChecked((prev) => (v ? [...prev, i] : prev.filter((x) => x !== i)))}>
                  {c}
                </Checkbox>
              ))}
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={Check} disabled={!ready} onClick={() => onReview(item, "approved")}>Approve and publish</Button>
              <Button icon={X} onClick={() => setRejecting(true)}>Don't publish</Button>
            </div>
            {!ready && <p className="mt-2 text-caption text-fg-subtle">Tick all three to publish.</p>}
          </>
        ) : (
          <div className="space-y-3">
            <Field label="Why not? (shown to the author)" optional>
              <Textarea autoGrow rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
                placeholder="e.g. The second source doesn't support the claim about…" />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => setRejecting(false)}>Back</Button>
              <Button variant="danger" onClick={() => onReview(item, "rejected", note.trim())}>Return to author</Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
