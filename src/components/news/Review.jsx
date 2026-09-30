import { Check, MapPin, X, Scale, Undo2, Radio } from "lucide-react";
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

// Approval requires the checklist.
export function ReviewCard({ item, onReview }) {
  const [rejecting, setRejecting] = useState(false); // false | "back" | "reject"
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState([]);
  const ready = checked.length === CHECKS.length;
  return (
    <article aria-labelledby={`rv-${item.id}`} className="rounded-card border border-accent-text bg-surface p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label">
        <TopicLabel id={item.topic} />
        {item.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{item.location}</span>}
        {item.format === "live" && <span className="inline-flex items-center gap-1 font-semibold text-danger-text"><Radio size={12} aria-hidden="true" />Live blog</span>}
        <span className="text-fg-subtle">by {(item.authorNames || [item.authorName]).map((n) => `@${n}`).join(", ")} · {shortTime(item.submittedAt || item.createdAt)}</span>
      </p>
      <h3 id={`rv-${item.id}`} className="mt-2 text-title-2">{item.title}</h3>
      {item.standfirst && <p className="mt-1 text-callout text-fg-muted">{item.standfirst}</p>}
      {item.legalHold && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-control border border-warning-text/30 bg-warning-text/10 p-3">
          <Scale size={18} className="shrink-0 text-warning-text" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-callout text-warning-text">
            <strong>Needs a legal read.</strong>{item.legalNote ? ` ${item.legalNote}` : ""} It can't be published until this is cleared.
          </p>
          <Button size="sm" onClick={() => onReview(item, "hold-cleared")}>Legal read done</Button>
        </div>
      )}
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
              <Button variant="primary" icon={Check} disabled={!ready || item.legalHold} onClick={() => onReview(item, "approved")}>Approve and publish</Button>
              <Button icon={Undo2} onClick={() => setRejecting("back")}>Send back with notes</Button>
              <Button variant="ghost" icon={X} onClick={() => setRejecting("reject")}>Don't publish</Button>
            </div>
            {!ready && <p className="mt-2 text-caption text-fg-subtle">Tick all three to publish.</p>}
          </>
        ) : (
          <div className="space-y-3">
            <Field label={rejecting === "back" ? "What needs changing? (shown to the authors)" : "Why not? (shown to the author)"} optional={rejecting !== "back"}>
              <Textarea autoGrow rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
                placeholder="e.g. The second source doesn't support the claim about…" />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => setRejecting(false)}>Back</Button>
              {rejecting === "back"
                ? <Button variant="primary" disabled={!note.trim()} onClick={() => onReview(item, "draft", note.trim())}>Send back to the authors</Button>
                : <Button variant="danger" onClick={() => onReview(item, "rejected", note.trim())}>Don't publish it</Button>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
