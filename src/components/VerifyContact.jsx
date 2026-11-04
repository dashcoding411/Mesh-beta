import { useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { auth } from "../firebase";
import { authMessage, syncVerifiedToken, verifyEmail } from "../lib/auth";
import { isThrowawayEmail, isVerifiedUser } from "../lib/verified";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import { useToast } from "./ui/toast-context";

/**
 * Asked before someone with an unconfirmed email posts, comments, messages or
 * follows (the rules need verifiedContact). Browsing never asks.
 */
export default function VerifyContact({ reason, onClose }) {
  const toast = useToast();
  const email = auth.currentUser?.email || "";
  const throwaway = isThrowawayEmail(email);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(null); // "send" | "check"
  const [error, setError] = useState("");

  const send = async () => {
    setBusy("send");
    setError("");
    try { await verifyEmail(); setSent(true); }
    catch (err) { setError(authMessage(err)); }
    finally { setBusy(null); }
  };

  // Confirmed on another device already? Then there's nothing to ask.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    let live = true;
    auth.currentUser?.reload().then(async () => {
      if (!live || !isVerifiedUser(auth.currentUser)) return;
      await syncVerifiedToken();
      toast({ title: "Email confirmed", body: "Try that again." });
      close.current();
    }).catch(() => {});
    return () => { live = false; };
  }, [toast]);

  // The link is opened elsewhere, so reload the account and its sign-in token.
  const check = async () => {
    setBusy("check");
    setError("");
    try {
      await auth.currentUser?.reload();
      if (isVerifiedUser(auth.currentUser)) {
        await syncVerifiedToken();
        toast({ title: "Email confirmed" });
        onClose();
        return;
      }
      setError("It isn't confirmed yet. Open the link in the email, then try again.");
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog title="Confirm your email" onClose={onClose} size="sm"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {throwaway ? (
          <Button variant="primary" onClick={onClose}>OK</Button>
        ) : sent ? (
          <>
            <Button variant="ghost" loading={busy === "send"} onClick={send}>Send it again</Button>
            <Button variant="primary" loading={busy === "check"} onClick={check}>I've confirmed it</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Not now</Button>
            <Button variant="primary" loading={busy === "send"} onClick={send}>Send the link</Button>
          </>
        )}
      </div>}>
      <MailCheck size={28} className="text-accent-text" aria-hidden="true" />
      <p className="mt-3 text-body">
        {throwaway
          ? <><strong>{email}</strong> is a throwaway inbox, which bot farms use by the thousand, so it can&apos;t be confirmed. To {reason} on Mesh, sign up again with an email you keep.</>
          : sent
            ? <>We sent a link to <strong>{email}</strong>. Open it, then come back here.</>
            : <>To {reason} on Mesh, confirm your email first. It keeps bots out.</>}
      </p>
      {error && <p className="mt-3 text-callout text-danger-text">{error}</p>}
    </Dialog>
  );
}
