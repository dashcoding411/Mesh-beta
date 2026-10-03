import { useState } from "react";
import { Scale } from "lucide-react";
import { submitAppeal } from "../lib/db";
import { RULE_NAMES } from "../lib/moderation";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import { Field, Textarea } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/** Ask a person to look again at something the hate filter blocked. */
export default function AppealDialog({ block, onClose }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await submitAppeal({ ...block, note });
      toast({ title: "Appeal sent", body: "A person will look at it and you'll get a notification with the decision." });
      onClose();
    } catch {
      setError("Couldn't send the appeal. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title="Appeal to a person" onClose={onClose} size="sm"
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Scale} onClick={send} loading={busy}>Send appeal</Button>
        </div>
      )}>
      <p className="text-callout text-fg-muted">
        Filters get things wrong, like when someone quotes a slur to call it out. A member of the Mesh team, not a machine,
        will read this and decide. If they agree, you can post it as it is.
      </p>
      <p className="mt-3 text-caption font-semibold text-fg-subtle">Matched rule: {RULE_NAMES[block.rule] || block.rule}</p>
      <blockquote className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-control bg-surface-2 p-3 text-callout text-fg [overflow-wrap:anywhere]">
        {block.text}
      </blockquote>
      <Field label="Why should this be allowed?" optional count={note.length} max={500} className="mt-4">
        <Textarea autoGrow rows={2} maxRows={6} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
          placeholder="For example: I'm quoting what was said to me." />
      </Field>
      <InlineMessage>{error}</InlineMessage>
    </Dialog>
  );
}
