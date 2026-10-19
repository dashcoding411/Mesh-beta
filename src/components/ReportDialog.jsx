import { useState } from "react";
import { ArrowLeft, HeartHandshake } from "lucide-react";
import { reportContent, REPORT_REASONS } from "../lib/db";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import { MenuItem, MenuGroup } from "./ui/Menu";
import { Field, Textarea } from "./ui/Field";
import { InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

const NOUN = { post: "post", comment: "comment", message: "message", user: "account" };

/** @param {{type, id, authorId, postId?, chatId?, text?}} target */
export default function ReportDialog({ target, onClose, onReported, report = reportContent }) {
  const toast = useToast();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noun = NOUN[target.type] || "post";

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await report(target, reason.id, details.trim());
      toast(res?.duplicate
        ? { tone: "info", title: `You have already reported this ${noun}`, body: "It is awaiting review by a moderator." }
        : { title: "Report submitted", body: target.type === "message" ? "A moderator will review it. Only this message is shared, not the rest of the conversation." : "A moderator will review it against the Community Guidelines." });
      onReported?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError("The report could not be sent. Check your connection and try again.");
      setBusy(false);
    }
  };

  if (!reason) {
    return (
      <Dialog title={`Report ${noun}`} onClose={onClose}>
        <p className="mb-3 text-callout text-fg-muted">
          What's wrong with it?
          {target.type === "message" && " Reporting a message shares that one message with moderators, not the rest of the conversation."}
        </p>
        <MenuGroup>
          {REPORT_REASONS.map((r) => (
            <MenuItem key={r.id} description={r.description} onClick={() => setReason(r)}>{r.label}</MenuItem>
          ))}
        </MenuGroup>
      </Dialog>
    );
  }

  return (
    <Dialog title={reason.label} onClose={busy ? undefined : onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setReason(null)} disabled={busy}>Back</Button>
          <Button variant="primary" loading={busy} onClick={send}>Send report</Button>
        </div>
      }>
      {reason.id === "self_harm" && (
        <p className="mb-4 flex gap-2 rounded-control bg-surface-2 p-3 text-callout text-fg">
          <HeartHandshake size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
          <span>If someone is in immediate danger, call 000. Lifeline is on 13 11 14, any time, and Kids Helpline on 1800 55 1800.</span>
        </p>
      )}
      <Field label="Additional details" optional count={details.length} max={500}>
        <Textarea autoGrow rows={3} value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)}
          placeholder={reason.id === "hate" ? "For example, that it is one of several posts targeting the same group" : "Any context that will help a moderator assess the report"} />
      </Field>
      <div aria-live="polite" className="mt-2"><InlineMessage>{error}</InlineMessage></div>
    </Dialog>
  );
}
