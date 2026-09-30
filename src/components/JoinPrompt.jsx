import { authPath, navigate } from "../lib/router";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import { EmptyState } from "./ui/States";
import { LogoMark } from "./shell/Sidebar";

const Mark = () => <LogoMark size={30} />;

function AuthButtons({ onPick }) {
  const go = (mode) => { onPick?.(); navigate(authPath(mode)); };
  return (
    <div className="flex justify-center gap-2">
      <Button variant="primary" onClick={() => go("signup")}>Sign up</Button>
      <Button onClick={() => go("login")}>Log in</Button>
    </div>
  );
}

/** Shown in place of pages that belong to an account. */
export function JoinPage({ title, body }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState icon={Mark} title={title} body={body} action={<AuthButtons />} />
    </div>
  );
}

/** Opened by `needsAccount(reason)` when a signed-out visitor tries to act. */
export function JoinDialog({ reason, onClose }) {
  return (
    <Dialog title="You need an account for that" onClose={onClose} variant="center" size="sm">
      <p className="text-callout text-fg-muted">
        Browsing is open to everyone. To {reason}, log in or create an account. It&apos;s free, with no ads.
      </p>
      <div className="mt-5">
        <AuthButtons onPick={onClose} />
      </div>
    </Dialog>
  );
}
