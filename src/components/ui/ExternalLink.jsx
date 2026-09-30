import { useEffect, useState } from "react";
import { ExternalLink as ExternalIcon, TriangleAlert } from "lucide-react";
import { EXTERNAL_LINK_EVENT } from "../../lib/links";
import Dialog from "./Dialog";
import Button from "./Button";

// Shows the host separately and warns on punycode or IP-address hosts.
export function ExternalLinkDialog() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const open = (e) => setUrl(e.detail);
    window.addEventListener(EXTERNAL_LINK_EVENT, open);
    return () => window.removeEventListener(EXTERNAL_LINK_EVENT, open);
  }, []);
  if (!url) return null;

  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  const lookalike = host.split(".").some((part) => part.startsWith("xn--"));
  const numeric = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  const close = () => setUrl(null);

  return (
    <Dialog title="You're leaving Mesh" variant="center" size="sm" onClose={close}>
      <p className="text-callout text-fg-muted">
        This link goes to <strong className="break-all text-fg">{host}</strong>, a website that isn't part of Mesh.
        We can't check what's on it, so only continue if you trust it, and never enter your Mesh password there.
      </p>
      {(lookalike || numeric) && (
        <p role="alert" className="mt-3 flex gap-2 rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {lookalike
            ? "This address uses letters that can imitate another site's name. Check it carefully."
            : "This address is a bare number rather than a name, which scam links often use."}
        </p>
      )}
      <p className="mt-3 break-all rounded-control bg-surface-2 px-3 py-2 font-mono text-caption text-fg-muted">{url}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={close}>Stay on Mesh</Button>
        <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={close}
          className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-callout font-semibold text-white hover:bg-accent-hover">
          Open {host} <ExternalIcon size={15} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </Dialog>
  );
}
