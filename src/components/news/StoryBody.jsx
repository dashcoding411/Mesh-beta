import { ExternalLink, Timer } from "lucide-react";
import { CITE, hostOf } from "./text";
import { blocksFromDoc } from "../../lib/storyDoc";
import MediaImg from "../ui/MediaImg";
import { followLink } from "../../lib/links";

// Shared by the story page and the editor preview.
export function StoryBody({ story }) {
  const sources = story.sources || [];
  const uid = `n-${story.id}`;
  const jump = (e, n) => {
    e.preventDefault();
    const el = document.getElementById(`${uid}-src-${n}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector("a")?.focus({ preventScroll: true });
  };
  const blocks = story.blocks || blocksFromDoc(story);
  // Drop the space before a citation marker.
  const cite = (text) => String(text || "").split(CITE).map((part, j, all) => {
    if (j % 2 === 0) return j + 1 < all.length ? part.replace(/\s+$/, "") : part;
    const n = Number(part);
    if (!n || n > sources.length) return `[${part}]`;
    return (
      <sup key={j}>
        <a href={`#${uid}-src-${n}`} onClick={(e) => jump(e, n)}
          aria-label={`Source ${n}, ${hostOf(sources[n - 1])}`}
          className="ml-0.5 rounded px-0.5 text-label font-semibold text-accent-text hover:underline">
          [{n}]
        </a>
      </sup>
    );
  });

  return (
    <>
      {story.keyPoints?.filter(Boolean).length > 0 && (
        <section aria-label="The 60-second version" className="mt-6 rounded-card border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">
            <Timer size={14} aria-hidden="true" /> The 60-second version
          </h2>
          <ul className="space-y-1.5">
            {story.keyPoints.filter(Boolean).map((k, i) => (
              <li key={i} className="flex gap-2 text-callout text-fg">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text" aria-hidden="true" />{k}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 max-w-[68ch] space-y-4 text-body leading-relaxed text-fg">
        {blocks.map((b) => {
          if (b.type === "h2") return <h2 key={b.id} className="pt-2 text-title-2">{cite(b.text)}</h2>;
          if (b.type === "h3") return <h3 key={b.id} className="pt-1 text-title-3">{cite(b.text)}</h3>;
          if (b.type === "quote") {
            return (
              <blockquote key={b.id} className="border-l-4 border-accent-text py-1 pl-4 font-display text-title-3 font-semibold leading-snug">
                {cite(b.text)}
              </blockquote>
            );
          }
          if (b.type === "list") {
            return (
              <ul key={b.id} className="list-disc space-y-1 pl-6">
                {b.text.split("\n").filter((l) => l.trim()).map((l, i) => <li key={i}>{cite(l)}</li>)}
              </ul>
            );
          }
          if (b.type === "image") {
            return b.media ? (
              <figure key={b.id} className="my-2">
                <MediaImg src={b.media} alt={b.alt || ""} loading="lazy" className="w-full rounded-card object-cover"
                  placeholderClass="aspect-[16/9] w-full rounded-card" />
                {b.text && <figcaption className="mt-2 text-caption text-fg-subtle">{cite(b.text)}</figcaption>}
              </figure>
            ) : null;
          }
          if (b.type === "divider") return <hr key={b.id} className="my-6 border-line" />;
          return b.text.trim() ? <p key={b.id} className="whitespace-pre-wrap break-words">{cite(b.text)}</p> : null;
        })}
      </div>

      <section aria-labelledby={`${uid}-src-h`} className="mt-8 border-t border-line pt-5">
        <h2 id={`${uid}-src-h`} className="text-label font-semibold uppercase tracking-wider text-fg-subtle">
          Sources · {sources.length}
        </h2>
        <ol className="mt-3 space-y-2">
          {sources.map((s, i) => (
            <li key={i} id={`${uid}-src-${i + 1}`} className="flex scroll-mt-24 gap-3">
              <span className="mt-2 w-6 shrink-0 text-right text-caption font-semibold text-fg-subtle tabular">{i + 1}</span>
              <a href={s} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => followLink(s, e)}
                className="press flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control bg-surface-2 px-3 py-2 hover:bg-surface-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-callout font-semibold text-fg">{hostOf(s)}</span>
                  <span className="block truncate text-caption text-fg-subtle">{s}</span>
                </span>
                <ExternalLink size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
