// Starting a poll in a group chat.
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { sendPoll } from "../../lib/db";
import { checkContent } from "../../lib/moderation";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import IconButton from "../ui/IconButton";
import { InlineMessage } from "../ui/States";

export function PollDialog({ chatId, onClose }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (q.length < 3) return setError("Ask a question of at least 3 characters.");
    if (opts.length < 2) return setError("Add at least two options.");
    const mod = checkContent([q, ...opts].join("\n"), { key: "poll", skipCooldown: true, hate: false });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    try { await sendPoll(chatId, q, opts); onClose(); }
    catch { setError("Couldn't post the poll. Try again."); setBusy(false); }
  };

  return (
    <Dialog title="New poll" onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Question" count={question.length} max={120}>
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} placeholder="Where should we eat?" />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-callout font-medium">Options</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input value={o} maxLength={60} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && (
                <IconButton icon={X} label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))} />
              )}
            </div>
          ))}
          {options.length < 4 && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setOptions([...options, ""])}>Add an option</Button>
          )}
        </fieldset>
        <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
        <Button type="submit" variant="primary" full loading={busy}>Post poll</Button>
      </form>
    </Dialog>
  );
}
