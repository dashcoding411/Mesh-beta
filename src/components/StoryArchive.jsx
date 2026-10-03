import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { History, Lock, Plus } from "lucide-react";
import { fetchMyStoryArchive, me, tsMillis } from "../lib/db";
import TopBar from "./shell/TopBar";
import Button from "./ui/Button";
import { EmptyState, ErrorState, Skeleton } from "./ui/States";
import { useShell } from "./shell/ShellContext";
import { HighlightEditor, StoryFrame } from "./Highlights";
const StoryViewer = lazy(() => import("./StoryViewer"));

const monthOf = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "long", year: "numeric" });

/** Every story you've posted, kept after its 24 hours. Only you can see it. */
export default function StoryArchive() {
  const { profile } = useShell();
  const [stories, setStories] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(null); // { items, at }
  const [making, setMaking] = useState(false);

  const load = async () => {
    setError(false);
    try { setStories(await fetchMyStoryArchive()); } catch { setError(true); }
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const months = useMemo(() => {
    const out = new Map();
    for (const s of stories || []) {
      const key = monthOf(tsMillis(s.createdAt));
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(s);
    }
    return [...out.entries()];
  }, [stories]);

  return (
    <>
      <TopBar title="Story archive" back backTo="/account" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-5 px-4 pb-16 pt-5 md:px-6">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="hidden flex-1 text-title-1 md:block">Story archive</h1>
            <p className="flex flex-1 items-center gap-2 text-caption text-fg-muted md:flex-none">
              <Lock size={14} aria-hidden="true" /> Only you can see this. Stories are kept here after 24 hours.
            </p>
            {stories?.length > 0 && <Button variant="primary" size="sm" icon={Plus} onClick={() => setMaking(true)}>New highlight</Button>}
          </header>

          {error && <ErrorState title="Couldn't load your archive" onRetry={load} />}
          {!error && stories === null && (
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-[9/16] !rounded-control" />)}</div>
          )}
          {stories?.length === 0 && (
            <EmptyState icon={History} title="No stories yet" body="When you post a story, it stays here after it disappears from everyone else's view." />
          )}

          {months.map(([month, list]) => (
            <section key={month} aria-label={month}>
              <h2 className="mb-2 text-callout font-semibold text-fg-muted">{month}</h2>
              <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                {list.map((s, i) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setOpen({ items: [...list].reverse(), at: list.length - 1 - i })}
                      aria-label={`Story from ${new Date(tsMillis(s.createdAt)).toLocaleString()}`}
                      className="press relative block aspect-[9/16] w-full overflow-hidden rounded-control bg-surface-2">
                      <StoryFrame url={s.mediaUrl} type={s.mediaType} className="h-full w-full" />
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-label font-semibold text-white">
                        {new Date(tsMillis(s.createdAt)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {open && (
        <Suspense fallback={null}>
          <StoryViewer key={open.items[open.at].id} startAt={open.at}
            thread={{ authorId: me(), authorName: profile?.username || "", authorPhoto: profile?.photoURL || "", items: open.items }}
            onClose={() => setOpen(null)} onNextThread={() => setOpen(null)}
            onDeleted={(id) => setStories((l) => l.filter((s) => s.id !== id))} />
        </Suspense>
      )}
      {making && <HighlightEditor onClose={() => setMaking(false)} onSaved={() => setMaking(false)} onDeleted={() => setMaking(false)} />}
    </>
  );
}
