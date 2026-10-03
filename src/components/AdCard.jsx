import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import { adReason, countAdTap, countAdView } from "../lib/db";
import { followLink } from "../lib/links";
import { useInView } from "../lib/useInView";
import MediaImg from "./ui/MediaImg";
import Button from "./ui/Button";

/**
 * A directly sold ad in Home. Always labelled, easy to scroll past, and it
 * says why it's there. The link opens through Mesh's "leaving Mesh" check.
 */
export default function AdCard({ ad, preview = false }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  useEffect(() => { if (seen && !preview) countAdView(ad); }, [seen, ad, preview]);

  const open = (e) => { if (!preview) countAdTap(ad); followLink(ad.linkUrl, e); };
  const host = (() => { try { return new URL(ad.linkUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  return (
    <article ref={ref} aria-label={`Ad from ${ad.advertiser}`}
      className="py-3.5 md:rounded-card md:border md:border-line md:bg-surface">
      <div className="flex items-center gap-3 px-4">
        <span aria-hidden="true" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-callout font-bold text-fg">
          {ad.advertiser.slice(0, 1).toUpperCase()}
        </span>
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{ad.advertiser}</p>
        <span className="rounded-full border border-line-strong px-2 py-0.5 text-label font-semibold uppercase tracking-wider text-fg-muted">Ad</span>
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls={whyId}
          aria-label="Why am I seeing this ad?" className="press flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
          <Info size={18} aria-hidden="true" />
        </button>
      </div>
      {why && (
        <p id={whyId} className="mx-4 mt-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
          {adReason(ad)} Ads pay for Mesh's servers and moderators. Mesh never sells your data or targets ads on what you do.
        </p>
      )}
      {ad.imageUrl && (
        <button type="button" onClick={open} className="mt-3 block w-full" aria-label={`${ad.headline}, from ${ad.advertiser}. Opens ${host}`} tabIndex={-1}>
          <MediaImg src={ad.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" placeholderClass="aspect-[4/3] w-full" />
        </button>
      )}
      <div className="px-4 pt-3">
        <h3 className="font-display text-title-3 leading-snug">{ad.headline}</h3>
        {ad.body && <p className="mt-1 whitespace-pre-line text-body text-fg-muted">{ad.body}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button variant="primary" size="sm" icon={ExternalLink} onClick={open}>{ad.cta}</Button>
          {host && <span className="truncate text-caption text-fg-subtle">{host}</span>}
        </div>
      </div>
    </article>
  );
}
