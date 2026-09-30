import { ChevronDown, MapPin, Newspaper, PenLine, ShieldCheck, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearLegalHold, fetchNews, isAdmin, isNewsWriter, reviewNews } from "../../lib/db";
import { NEWS_TOPICS, newsTopicById } from "../../lib/interests";
import { navigate } from "../../lib/router";
import HomeHeader from "../shell/HomeHeader";
import { ReviewCard } from "./Review";
import { Meta, TopicLabel } from "./parts";
import { summaryOf } from "./text";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import MediaImg from "../ui/MediaImg";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

export function NewsHome() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [writer, setWriter] = useState(false);
  const [topic, setTopic] = useState("all");

  const load = useCallback(async () => {
    setError(false);
    try {
      const [approved, amAdmin, amWriter] = await Promise.all([
        fetchNews("approved"),
        isAdmin().catch(() => false),
        isNewsWriter().catch(() => false),
      ]);
      setItems(approved);
      setAdmin(amAdmin);
      setWriter(amWriter);
      if (amAdmin) setPending(await fetchNews("pending").catch(() => []));
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const review = async (item, status, note = "") => {
    try {
      if (status === "hold-cleared") {
        await clearLegalHold(item.id);
        setPending((prev) => prev.map((n) => (n.id === item.id ? { ...n, legalHold: false, legalNote: "" } : n)));
        toast({ title: "Legal hold cleared" });
        return;
      }
      await reviewNews(item.id, status, note);
      setPending((prev) => prev.filter((n) => n.id !== item.id));
      toast({ title: status === "approved" ? "Published" : status === "draft" ? "Sent back with your notes" : "Returned to the author" });
      if (status === "approved") load();
    } catch {
      toast({ tone: "error", title: "Couldn't save that review" });
    }
  };

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
          {liveTopics.length > 1 && (
            <div role="radiogroup" aria-label="News topics" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
              {[{ id: "all", label: "Top stories" }, ...liveTopics].map((t) => {
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

          {admin && pending.length > 0 && (
            <section aria-labelledby="queue-h" className="mt-6">
              <h2 id="queue-h" className="mb-3 flex items-center gap-2 text-title-3">
                Review queue <Badge tone="warning">{pending.length}</Badge>
              </h2>
              <div className="space-y-4">
                {pending.map((n) => <ReviewCard key={n.id} item={n} onReview={review} />)}
              </div>
            </section>
          )}

          <section aria-labelledby="stories-h" className="mt-6">
            <h2 id="stories-h" className="sr-only">{topic === "all" ? "Top stories" : `${newsTopicById(topic)?.label} stories`}</h2>
            {error && <ErrorState title="Couldn't load the news" onRetry={load} />}
            {!error && items === null && (
              <div className="space-y-4" role="status" aria-label="Loading stories">
                <Skeleton className="h-72 !rounded-card" />
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 !rounded-card" />)}
              </div>
            )}
            {items?.length === 0 && (
              <EmptyState icon={Newspaper} title="No stories published yet"
                body="Stories appear here once a reviewer has checked them against their sources."
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
            <TopicLabel id={item.topic} />
            {item.live && <Badge tone="danger" icon={Radio}>Live</Badge>}
            {item.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{item.location}</span>}
          </span>
          <h3 id={`lead-${item.id}`} className="mt-2 font-display text-title-1 leading-tight group-hover:underline decoration-fg-subtle underline-offset-4">{item.title}</h3>
          <span className="mt-2 line-clamp-3 block text-body text-fg-muted">{summaryOf(item)}</span>
          <span className="mt-3 block"><Meta item={item} /></span>
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
          <span className="flex items-center gap-2 text-label"><TopicLabel id={item.topic} />{item.live && <Badge tone="danger" icon={Radio}>Live</Badge>}</span>
          <h3 id={`row-${item.id}`} className="mt-1 line-clamp-2 text-title-3 group-hover:underline decoration-fg-subtle underline-offset-2">{item.title}</h3>
          <span className="mt-1 line-clamp-2 block text-callout text-fg-muted">{summaryOf(item)}</span>
          <span className="mt-2 block"><Meta item={item} /></span>
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
        <ShieldCheck size={20} className="shrink-0 text-success-text" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-semibold">Every story is checked against its sources</span>
          <span className="block text-caption text-fg-subtle">How News works on Mesh</span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2 border-t border-line px-4 py-4 text-callout text-fg-muted">
        <p>Stories are written by writers the Mesh team has approved, each named on what they write. Nobody can publish their own.</p>
        <p>Every story needs at least two sources, cited by number in the text. A reviewer checks it against those sources before it goes up, and anything marked for a legal read waits until it's had one.</p>
        <p>AI can't be used to fabricate evidence: no generated photos, footage, audio or quotes presented as real.</p>
        <p>Spot a mistake? Every story has "Suggest a correction". Corrections are added publicly and never quietly edited away.</p>
        <p className="text-fg">Review isn't a guarantee of truth. Read the sources and make up your own mind.</p>
        {writer && <Button size="sm" variant="primary" icon={PenLine} className="mt-2 md:hidden" onClick={() => navigate("/news/desk")}>Open the newsroom</Button>}
      </div>
    </details>
  );
}
