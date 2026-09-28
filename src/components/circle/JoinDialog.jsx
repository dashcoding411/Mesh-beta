// Asking to join a circle: its rules and screening questions.
import { useState } from "react";
import { me, requestToJoin } from "../../lib/db";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { Checkbox, Field, Input } from "../ui/Field";
import { InlineMessage } from "../ui/States";

export function JoinDialog({ group, onClose, onRequested }) {
  const questions = group.screeningQuestions || [];
  const [answers, setAnswers] = useState(questions.map(() => ""));
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (group.rules && !agreed) return setError("Agree to the rules to ask to join.");
    if (questions.some((_, i) => !answers[i].trim())) return setError("Answer every question. Admins use them to decide.");
    setBusy(true);
    try {
      await requestToJoin(group.id, questions.map((q, i) => ({ q, a: answers[i].trim() })));
      onRequested({ uid: me(), answers });
    } catch (err) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "This circle's limits don't let this account join."
        : "Couldn't send your request. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Ask to join ${group.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-callout text-fg-muted">An admin reviews every request here.</p>
        {group.rules && (
          <div>
            <p className="mb-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">Rules</p>
            <ol className="max-h-44 list-inside list-decimal space-y-1 overflow-y-auto rounded-control bg-surface-2 p-3 text-callout">
              {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
            </ol>
            <Checkbox checked={agreed} onChange={setAgreed}>I've read these rules and agree to follow them.</Checkbox>
          </div>
        )}
        {questions.map((q, i) => (
          <Field key={i} label={q}>
            <Input value={answers[i]} maxLength={200}
              onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
          </Field>
        ))}
        <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
        <Button type="submit" variant="primary" full loading={busy}>Send request</Button>
      </form>
    </Dialog>
  );
}
