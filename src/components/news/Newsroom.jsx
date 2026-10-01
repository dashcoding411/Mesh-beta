import { useEffect, useState } from "react";
import { FilePen, Newspaper, Plus, Radio, Users } from "lucide-react";
import { createNewsStory, fetchMyStories, isNewsWriter, setLive, tsMillis, me } from "../../lib/db";
import { useJournalist, useJournalistStories } from "../../lib/journalists";
import { JournalistCard, JournalistSettings } from "./Journalist";
import { shortTime } from "../../lib/format";
import { navigate } from "../../lib/router";
import { usePageTitle } from "../../lib/usePageTitle";
import TopBar from "../shell/TopBar";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import { EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

const STAGES = [
  { id: "draft", title: "Drafts", match: (s) => s.status !== "approved" },
  { id: "approved", title: "Published", match: (s) => s.status === "approved" },
];

export default function Newsroom() {
  usePageTitle("Newsroom", 1);
  const toast = useToast();
  const [writer, setWriter] = useState(undefined);
  const [stories, setStories] = useState(null);
  const [busy, setBusy] = useState("");
  const loadedJournalist = useJournalist(me());
  const [editedJournalist, setEditedJournalist] = useState(null);
  const journalist = editedJournalist || loadedJournalist;
  const published = useJournalistStories(me(), !!journalist);
  const [editingByline, setEditingByline] = useState(false);

  const load = () => fetchMyStories().then(setStories).catch(() => setStories([]));
  useEffect(() => {
    isNewsWriter().then((w) => { setWriter(w); if (w) load(); }).catch(() => setWriter(false));
  }, []);

  const start = async (format) => {
    setBusy(format);
    try { navigate(`/news/write/${await createNewsStory(format)}`); }
    catch { toast({ tone: "error", title: "Couldn't start a story" }); setBusy(""); }
  };

  return (
    <>
      <TopBar title="Newsroom" back backTo="/news" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-5 md:px-6">
          <header className="mb-5 hidden md:block">
            <h1 className="text-title-1">Newsroom</h1>
            <p className="text-callout text-fg-muted">Write, co-write and publish your stories.</p>
          </header>

          {writer === undefined && <Skeleton className="h-32 !rounded-card" />}
          {writer === false && (
            <EmptyState icon={Newspaper} title="Mesh News is written by verified journalists"
              body="Publishing on Mesh News is limited to journalists whose identity Mesh has verified. Anyone can read stories and request corrections."
              action={<Button onClick={() => navigate("/news")}>Read the news</Button>} />
          )}
          {writer && (
            <>
              {journalist && (
                <div className="-mx-4 md:-mx-6">
                  {!journalist.region && (
                    <p className="mx-4 mb-2 text-callout text-fg-muted md:mx-6">
                      Set up your byline: readers see your outlet, region and any political affiliation on every story.
                    </p>
                  )}
                  <JournalistCard uid={me()} journalist={journalist} stories={published} onEdit={() => setEditingByline(true)} />
                </div>
              )}
              <div className="mb-6 flex flex-wrap gap-2">
                <Button variant="primary" icon={Plus} loading={busy === "story"} onClick={() => start("story")}>New story</Button>
                <Button icon={Radio} loading={busy === "live"} onClick={() => start("live")}>New live blog</Button>
              </div>
              {stories === null && <Skeleton className="h-40 !rounded-card" />}
              {stories?.length === 0 && (
                <EmptyState compact icon={FilePen} title="Nothing on your desk yet" body="Start a story, or a co-author can add you to theirs." />
              )}
              {stories?.length > 0 && STAGES.map((stage) => {
                const list = stories.filter(stage.match);
                if (!list.length) return null;
                return (
                  <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="mb-6">
                    <h2 id={`stage-${stage.id}`} className="mb-2 px-1 text-label font-semibold uppercase tracking-wider text-fg-subtle">{stage.title}</h2>
                    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                      {list.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                          <button type="button" className="min-w-0 flex-1 text-left"
                            onClick={() => navigate(s.status === "approved" ? `/news/${s.id}` : `/news/write/${s.id}`)}>
                            <span className="block truncate text-callout font-semibold">{s.title || "Untitled story"}</span>
                            <span className="flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
                              <span>{shortTime(tsMillis(s.updatedAt) || tsMillis(s.createdAt))}</span>
                              {(s.authors || []).length > 1 && <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" />{(s.authorNames || []).map((n) => `@${n}`).join(", ")}</span>}
                              {s.legalHold && <span className="text-warning-text">Legal review required</span>}
                              {s.reviewNote && stage.id === "back" && <span className="text-warning-text">“{s.reviewNote}”</span>}
                            </span>
                          </button>
                          {s.format === "live" && <Badge tone={s.live ? "danger" : "neutral"} icon={Radio}>{s.live ? "Live" : "Live blog"}</Badge>}
                          {s.format === "live" && s.status === "approved" && (
                            <Button size="sm" variant={s.live ? "secondary" : "primary"} onClick={async () => {
                              try { await setLive(s.id, !s.live); setStories((l) => l.map((x) => (x.id === s.id ? { ...x, live: !s.live } : x))); }
                              catch { toast({ tone: "error", title: "Couldn't change that" }); }
                            }}>{s.live ? "End live" : "Go live"}</Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>
      {editingByline && journalist && (
        <JournalistSettings journalist={journalist} onClose={() => setEditingByline(false)}
          onSaved={(j) => { setEditedJournalist(j); setEditingByline(false); }} />
      )}
    </>
  );
}
