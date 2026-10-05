import { Check, ChevronDown, MapPin, Newspaper, PenLine, Radio, Sunrise } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchNews, isNewsWriter, tsMillis } from "../../lib/db";
import { NEWS_TOPICS, newsTopicById } from "../../lib/interests";
import { navigate } from "../../lib/router";
import HomeHeader from "../shell/HomeHeader";
import { KindBadge, Meta, TopicLabel } from "./parts";
import { AuthorLine } from "./Journalist";
import { readMinutes, summaryOf } from "./text";
import { BRIEF_SIZE, pickBrief, readStoryIds } from "../../lib/newsBrief";
import Badge from "../ui/Badge";
import { VerifiedTick } from "../ui/Badges";
import Button from "../ui/Button";
import MediaImg from "../ui/MediaImg";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";

const publishedAt = (s) => tsMillis(s.publishedAt) || tsMillis(s.createdAt);

export function NewsHome() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [writer, setWriter] = useState(false);
  const [topic, setTopic] = useState("all");

  const load = useCallback(async () => {
    setError(false);
    try {
      const [published, amWriter] = await Promise.all([
        fetchNews("approved"),
        isNewsWriter().catch(() => false),
      ]);
      setItems(published.sort((a, b) => publishedAt(b) - publishedAt(a)));
      setWriter(amWriter);
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const shown = useMemo(() => (items || []).filter((n) => topic === "all" || (n.topic || "world") === topic), [items, topic]);
  const liveTopics = useMemo(() => {
    const have = new Set((items || []).map((n) => n.topic || "world"));
    return NEWS_TOPICS.filter((t) => have.has(t.id) || t.id === topic);
  }, [items, topic]);
  const [lead, ...rest] = shown;

  return (
    <>
      <HomeHeader section="news"
        actions={writer ? <Button size="sm" variant="primary" icon={PenLine} className="hidden md:inline-flex" onClick={() => navigate("/news/desk")}>Newsroom</Button> : null} />

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-4 pb-16 pt-4 md:px-6">
          {/* Journalists publish here; Mesh hosts them. Not Mesh's own publication. */}
          <div className="mb-4 border-b border-line pb-3">
            <p className="font-display text-title-2 font-extrabold tracking-tight">News on Mesh</p>
            <p className="text-callout text-fg-muted">Independent, verified journalists publishing their own stories. Making Every Story Heard.</p>
          </div>
          {liveTopics.length > 1 && (
            <div role="radiogroup" aria-label="News topics" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
              {[{ id: "all", label: "Latest" }, ...liveTopics].map((t) => {
                const on = topic === t.id;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setTopic(t.id)}
                    className={`press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold transition-colors ${
                      on ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                    }`}>
                    {t.icon && <t.icon size={13} aria-hidden="true" />}{t.label}
                  </button>
                );
              })}
            </div>
          )}

          <HowItWorks writer={writer} />

          {topic === "all" && items?.length > 0 && <TodaysBrief items={items} />}

          <section aria-labelledby="stories-h" className="mt-6">
            <h2 id="stories-h" className="sr-only">{topic === "all" ? "Latest stories" : `${newsTopicById(topic)?.label} stories`}</h2>
            {error && <ErrorState title="Couldn't load the news" onRetry={load} />}
            {!error && items === null && (
              <div className="space-y-4" role="status" aria-label="Loading stories">
                <Skeleton className="h-72 !rounded-card" />
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 !rounded-card" />)}
              </div>
            )}
            {items?.length === 0 && (
              <EmptyState icon={Newspaper} title="No stories published yet"
                body="Stories journalists publish on Mesh will appear here, newest first."
                action={writer ? <Button variant="primary" icon={PenLine} onClick={() => navigate("/news/desk")}>Write the first story</Button> : null} />
            )}
            {items?.length > 0 && shown.length === 0 && (
              <EmptyState compact icon={Newspaper} title={`No ${newsTopicById(topic)?.label.toLowerCase()} stories yet`}
                body="Pick another topic."
                action={<Button onClick={() => setTopic("all")}>Show all stories</Button>} />
            )}
            {lead && <LeadStory item={lead} />}
            {rest.length > 0 && (
              <ul className="mt-2 divide-y divide-line" aria-label="More stories">
                {rest.map((n) => <li key={n.id}><StoryRow item={n} /></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>

    </>
  );
}

// Five stories, then done: a news habit with an end.
function TodaysBrief({ items }) {
  const [now] = useState(() => Date.now());
  const [read] = useState(() => readStoryIds());
  const brief = useMemo(() => pickBrief(items, now, publishedAt), [items, now]);
  if (brief.length < 2) return null;
  const done = brief.filter((s) => read.has(s.id)).length;
  const finished = done === brief.length;
  const minutes = brief.reduce((m, s) => m + readMinutes(s.script), 0);

  return (
    <section aria-labelledby="brief-h" className="mt-4 rounded-card border border-line bg-surface">
      <div className="flex items-start gap-3 px-4 pt-4">
        <Sunrise size={20} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="brief-h" className="text-title-3">Today's brief</h2>
          <p className="text-caption text-fg-muted">
            {finished
              ? "You're done for today. That's the news."
              : `The ${brief.length === BRIEF_SIZE ? "five" : brief.length} newest stories across topics, picked automatically. About ${minutes} min.`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-caption font-semibold tabular text-fg-muted" aria-label={`${done} of ${brief.length} read`}>
          {done}/{brief.length}
        </span>
      </div>
      <ol className="mt-2 divide-y divide-line">
        {brief.map((s, i) => {
          const seen = read.has(s.id);
          return (
            <li key={s.id}>
              <button type="button" onClick={() => navigate(`/news/${s.id}`)} className="press group flex w-full items-start gap-3 px-4 py-3 text-left">
                <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-bold tabular ${
                  seen ? "bg-accent text-white" : "bg-surface-2 text-fg-muted"
                }`}>
                  {seen ? <Check size={14} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-callout font-semibold group-hover:underline decoration-fg-subtle underline-offset-2 ${seen ? "text-fg-muted" : ""}`}>
                    {s.title}{seen && <span className="sr-only"> (read)</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-label"><TopicLabel id={s.topic} />{s.live && <Badge tone="danger" icon={Radio}>Live</Badge>}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {finished && (
        <p className="border-t border-line px-4 py-3 text-caption text-fg-muted">
          Nothing else you need to know right now. The rest is below if you want it.
        </p>
      )}
    </section>
  );
}

function LeadStory({ item }) {
  return (
    <article aria-labelledby={`lead-${item.id}`}>
      <button type="button" onClick={() => navigate(`/news/${item.id}`)}
        className="press group block w-full overflow-hidden rounded-card border border-line bg-surface text-left transition-colors hover:border-line-strong">
        {item.coverUrl ? (
          <MediaImg src={item.coverUrl} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" placeholderClass="aspect-[16/9] w-full" />
        ) : (
          <span className="block h-1 bg-accent" aria-hidden="true" />
        )}
        <span className="block p-5">
          <span className="flex flex-wrap items-center gap-2 text-label">
            <KindBadge id={item.label} />
            <TopicLabel id={item.topic} />
            {item.live && <Badge tone="danger" icon={Radio}>Live</Badge>}
            {item.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{item.location}</span>}
          </span>
          <h3 id={`lead-${item.id}`} className="mt-2 font-display text-title-1 leading-tight group-hover:underline decoration-fg-subtle underline-offset-4">{item.title}</h3>
          <span className="mt-2 line-clamp-3 block text-body text-fg-muted">{summaryOf(item)}</span>
          <span className="mt-3 block"><AuthorLine item={item} /></span>
          <span className="mt-1.5 block"><Meta item={item} /></span>
        </span>
      </button>
    </article>
  );
}

function StoryRow({ item }) {
  return (
    <article aria-labelledby={`row-${item.id}`}>
      <button type="button" onClick={() => navigate(`/news/${item.id}`)}
        className="press group flex w-full gap-4 py-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-label"><KindBadge id={item.label} /><TopicLabel id={item.topic} />{item.live && <Badge tone="danger" icon={Radio}>Live</Badge>}</span>
          <h3 id={`row-${item.id}`} className="mt-1 line-clamp-2 text-title-3 group-hover:underline decoration-fg-subtle underline-offset-2">{item.title}</h3>
          <span className="mt-1 line-clamp-2 block text-callout text-fg-muted">{summaryOf(item)}</span>
          <span className="mt-2 block"><AuthorLine item={item} /></span>
          <span className="mt-1 block"><Meta item={item} /></span>
        </span>
        {item.coverUrl && (
          <MediaImg src={item.coverUrl} alt="" loading="lazy"
            className="h-20 w-20 shrink-0 rounded-control object-cover md:h-24 md:w-32" placeholderClass="h-20 w-20 shrink-0 rounded-control md:h-24 md:w-32" />
        )}
      </button>
    </article>
  );
}

function HowItWorks({ writer }) {
  return (
    <details className="group rounded-card border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <VerifiedTick size={22} decorative />
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-semibold">Published by journalists, hosted by Mesh</span>
          <span className="block text-caption text-fg-subtle">How news on Mesh works</span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2 border-t border-line px-4 py-4 text-callout text-fg-muted">
        <p>Stories here are written and published by journalists whose identity Mesh has checked, whether they work for an outlet or independently. Each story carries the journalist's name, outlet, region and any declared political affiliation.</p>
        <p>Each journalist is the publisher of their own stories and answers for them. Mesh hosts them: it doesn't commission, write, edit or approve them, and it lists them newest first rather than choosing which matter most.</p>
        <p>Every story must cite at least two sources by number in the text, and the journalist confirms its accuracy when publishing. AI may not be used to fabricate evidence, such as generated images, footage, audio or quotations presented as genuine.</p>
        <p>Readers can request a correction on any story. Corrections are published on the story itself and are never removed. If you think a story is defamatory or unlawful, report it and Mesh will look at it within 7 days.</p>
        <p className="text-fg">Read the sources and form your own view.</p>
        {writer && <Button size="sm" variant="primary" icon={PenLine} className="mt-2 md:hidden" onClick={() => navigate("/news/desk")}>Open the newsroom</Button>}
      </div>
    </details>
  );
}
