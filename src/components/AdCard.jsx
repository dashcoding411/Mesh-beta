import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { adReason, countAdTap, countAdView } from "../lib/db";
import { followLink } from "../lib/links";
import { navigate } from "../lib/router";
import { useInView } from "../lib/useInView";
import MediaImg from "./ui/MediaImg";

/**
 * A directly sold ad in Home, laid out like a post (header, full-width 4:5
 * picture, caption) so it sits naturally in the feed, but always labelled,
 * easy to scroll past, and able to say why it's there. The link opens through
 * Mesh's "leaving Mesh" check.
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
      <AdHeader name={ad.advertiser} initial={ad.advertiser.slice(0, 1).toUpperCase()} why={why} setWhy={setWhy} whyId={whyId} />
      {why && (
        <p id={whyId} className="mx-4 mt-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
          {adReason(ad)} Ads pay for Mesh's servers and moderators. Mesh never sells your data or targets ads on what you do.{" "}
          <button type="button" onClick={() => navigate("/account/settings?open=advertise")} className="font-semibold text-accent-text hover:underline">
            Advertise on Mesh
          </button>
        </p>
      )}
      {ad.imageUrl && (
        <button type="button" onClick={open} tabIndex={-1} aria-hidden="true" className="mt-3 block w-full overflow-hidden bg-surface-2">
          <MediaImg src={ad.imageUrl} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" placeholderClass="aspect-[4/5] w-full" />
        </button>
      )}
      <button type="button" onClick={open}
        className={`press flex min-h-12 w-full items-center gap-2 bg-surface-2 px-4 text-left hover:bg-surface-3 ${ad.imageUrl ? "" : "mt-3"}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-semibold text-fg">{ad.cta}</span>
          {host && <span className="block truncate text-label text-fg-subtle">{host}</span>}
        </span>
        <ChevronRight size={18} className="shrink-0 text-fg-muted" aria-hidden="true" />
      </button>
      <div className="px-4 pt-2.5">
        <p className="text-body text-fg">
          <span className="font-semibold">{ad.advertiser}</span> <span className="font-semibold">{ad.headline}</span>
        </p>
        {ad.body && <p className="mt-0.5 whitespace-pre-line text-body text-fg-muted">{ad.body}</p>}
      </div>
    </article>
  );
}

/** Like a post's author line, with "Sponsored" where the time would be. */
export function AdHeader({ name, initial, icon: Icon, why, setWhy, whyId }) {
  return (
    <header className="flex items-center gap-3 px-4">
      <span aria-hidden="true" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-callout font-bold text-fg">
        {Icon ? <Icon size={18} /> : initial}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-callout font-semibold text-fg">{name}</p>
        <p className="text-caption text-fg-subtle">Sponsored</p>
      </div>
      <span className="rounded-full border border-line-strong px-2 py-0.5 text-label font-semibold uppercase tracking-wider text-fg-muted">Ad</span>
      <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls={whyId}
        aria-label="Why am I seeing this ad?" className="press flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
        <Info size={18} aria-hidden="true" />
      </button>
    </header>
  );
}
