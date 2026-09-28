import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldCheck, ExternalLink, Newspaper, PenLine, ChevronDown, Clock, XCircle, Check, X, ArrowLeft, MapPin,
  Link2, Share2, Flag, AlertTriangle, ImagePlus, ListChecks, Inbox,
} from "lucide-react";
import {
  fetchNews, fetchMyNews, submitNews, isAdmin, reviewNews, fetchNewsStory, suggestCorrection,
  fetchCorrectionRequests, addCorrection, uploadMedia, openUserProfile, tsMillis, deleteNews, me,
} from "../lib/db";
import { LIMITS, validateText, validateSources } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import { NEWS_TOPICS, newsTopicById } from "../lib/interests";
import { useLocation, navigate, goBack } from "../lib/router";
import { shortTime, fullTime, isoTime, plural } from "../lib/format";
import HomeHeader from "./shell/HomeHeader";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import MediaImg from "./ui/MediaImg";
import { Field, Input, Textarea, Checkbox, Select } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* News is its own place, with its own rules: every story names its sources,
   and a person checks it against them before it's published. The page is
   careful to say what review is and isn't: it's not a guarantee of truth. */
export default function News({ storyId }) {
  const loc = useLocation();
  const legacy = loc.query.get("story");
  // Old links were /news?story=id; they now have a page of their own.
  useEffect(() => {
    if (legacy && !storyId) navigate(`/news/${encodeURIComponent(legacy)}`, { replace: true });
  }, [legacy, storyId]);
  return storyId ? <NewsStory id={storyId} /> : <NewsHome />;
}

// ---------- helpers ----------

const CITE = /\[(\d{1,2})\]/g;
const stripCites = (t) => String(t || "").replace(/\s?\[\d{1,2}\]/g, "");
const readMinutes = (t) => Math.max(1, Math.round(String(t || "").split(/\s+/).filter(Boolean).length / 220));
const summaryOf = (n) => n.keyPoints?.[0] || stripCites(n.script).slice(0, 240);
const storyUrl = (id) => `${window.location.origin}/news/${encodeURIComponent(id)}`;

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function TopicLabel({ id, className = "" }) {
  const t = newsTopicById(id) || newsTopicById("world");
  return (
    <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-accent-text ${className}`}>
      <t.icon size={12} aria-hidden="true" /> {t.label}
    </span>
  );
}

function Meta({ item }) {
  const sources = (item.sources || []).length;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
      <span>{readMinutes(item.script)} min read</span>
      <span aria-hidden="true">·</span>
      <span>{plural(sources, "source")}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={isoTime(item.createdAt)} title={fullTime(item.createdAt)}>{shortTime(item.createdAt)}</time>
      {item.corrections?.length > 0 && <Badge tone="warning" icon={AlertTriangle}>Corrected</Badge>}
    </span>
  );
}

// ---------- the front page ----------

function NewsHome() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [topic, setTopic] = useState("all");

  const load = useCallback(async () => {
    setError(false);
    try {
      const [approved, myItems, amAdmin] = await Promise.all([
        fetchNews("approved"),
        fetchMyNews().catch(() => []),
        isAdmin().catch(() => false),
      ]);
      setItems(approved);
      setMine(myItems);
      setAdmin(amAdmin);
      if (amAdmin) setPending(await fetchNews("pending").catch(() => []));
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const review = async (item, status, note = "") => {
    try {
      await reviewNews(item.id, status, note);
      setPending((prev) => prev.filter((n) => n.id !== item.id));
      toast({ title: status === "approved" ? "Published" : "Returned to the author" });
      if (status === "approved") load();
    } catch {
      toast({ tone: "error", title: "Couldn't save that review" });
    }
  };

  const unpublished = mine.filter((n) => n.status !== "approved");
  const shown = useMemo(() => (items || []).filter((n) => topic === "all" || (n.topic || "world") === topic), [items, topic]);
  // Only offer topics that have something in them, plus whatever is selected.
  const liveTopics = useMemo(() => {
    const have = new Set((items || []).map((n) => n.topic || "world"));
    return NEWS_TOPICS.filter((t) => have.has(t.id) || t.id === topic);
  }, [items, topic]);
  const [lead, ...rest] = shown;

  return (
    <>
      <HomeHeader section="news"
        actions={<Button size="sm" variant="primary" icon={PenLine} className="hidden md:inline-flex" onClick={() => setSubmitting(true)}>Submit a story</Button>} />

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

          <HowItWorks onSubmit={() => setSubmitting(true)} />

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

          {unpublished.length > 0 && (
            <section aria-labelledby="mine-h" className="mt-6">
              <h2 id="mine-h" className="mb-3 text-title-3">Your submissions</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {unpublished.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => navigate(`/news/${n.id}`)}
                      className="press block w-full p-4 text-left transition-colors hover:bg-surface-2">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-callout font-medium">{n.title}</span>
                        {n.status === "pending"
                          ? <Badge tone="warning" icon={Clock}>In review</Badge>
                          : <Badge tone="danger" icon={XCircle}>Not published</Badge>}
                      </span>
                      {n.status === "rejected" && n.reviewNote && (
                        <span className="mt-2 block text-caption text-fg-muted">Reviewer's note: {n.reviewNote}</span>
                      )}
                      <span className="mt-1 block text-caption text-accent-text">Preview how it will look</span>
                    </button>
                  </li>
                ))}
              </ul>
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
                action={<Button variant="primary" icon={PenLine} onClick={() => setSubmitting(true)}>Submit the first story</Button>} />
            )}
            {items?.length > 0 && shown.length === 0 && (
              <EmptyState compact icon={Newspaper} title={`No ${newsTopicById(topic)?.label.toLowerCase()} stories yet`}
                body="Pick another topic, or submit one yourself."
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

      {submitting && (
        <SubmitDialog onClose={() => setSubmitting(false)}
          onSubmitted={() => { setSubmitting(false); load(); toast({ title: "Sent for review", body: "You'll see its status under Your submissions." }); }} />
      )}
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
          <span className="block h-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500" aria-hidden="true" />
        )}
        <span className="block p-5">
          <span className="flex flex-wrap items-center gap-2 text-label">
            <TopicLabel id={item.topic} />
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
          <span className="text-label"><TopicLabel id={item.topic} /></span>
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

function HowItWorks({ onSubmit }) {
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
        <p>Anyone 16 or over can submit a story. Nobody can publish their own.</p>
        <p>Each submission needs its full script and at least two sources, cited by number in the text. A reviewer checks the story against those sources before it goes up.</p>
        <p>AI can't be used to fabricate evidence: no generated photos, footage, audio or quotes presented as real.</p>
        <p>Spot a mistake? Every story has "Suggest a correction". Corrections are added publicly and never quietly edited away.</p>
        <p className="text-fg">Review isn't a guarantee of truth. Read the sources and make up your own mind.</p>
        <Button size="sm" variant="primary" icon={PenLine} className="mt-2 md:hidden" onClick={onSubmit}>Submit a story</Button>
      </div>
    </details>
  );
}

// ---------- one story ----------

function NewsStory({ id }) {
  const toast = useToast();
  const [story, setStory] = useState(undefined); // undefined loading, null missing
  const [admin, setAdmin] = useState(false);
  const [dialog, setDialog] = useState(null); // suggest | correct | withdraw
  const [requests, setRequests] = useState(null);

  const load = useCallback(async () => {
    const [s, amAdmin] = await Promise.all([fetchNewsStory(id), isAdmin().catch(() => false)]);
    setStory(s);
    setAdmin(amAdmin);
    if (amAdmin && s) setRequests(await fetchCorrectionRequests(id).catch(() => []));
  }, [id]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: story.title, url: storyUrl(id) }); } catch { /* dismissed */ }
      return;
    }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(storyUrl(id)); toast({ title: "Link copied" }); }
    catch { toast({ tone: "error", title: "Couldn't copy the link", body: storyUrl(id) }); }
  };

  return (
    <>
      <HomeHeader section="news" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-4 pb-20 pt-3 md:px-6">
          <Button variant="ghost" size="sm" icon={ArrowLeft} className="-ml-2" onClick={() => goBack("/news")}>News</Button>

          {story === undefined && (
            <div className="mt-4 space-y-4" role="status" aria-label="Loading story">
              <Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-56 !rounded-card" />
            </div>
          )}
          {story === null && (
            <EmptyState icon={Newspaper} title="This story isn't available"
              body="It may have been removed, or it hasn't been published yet."
              action={<Button onClick={() => navigate("/news")}>Back to News</Button>} />
          )}
          {story && (
            <article aria-labelledby="story-title" className="mt-3">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label">
                <TopicLabel id={story.topic} />
                {story.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{story.location}</span>}
              </p>
              <h1 id="story-title" className="mt-2 font-display text-title-1 leading-tight md:text-[2.25rem]">{story.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                <span>By{" "}
                  <button type="button" onClick={() => openUserProfile(story.authorId)} className="font-semibold text-fg-muted hover:underline">@{story.authorName}</button>
                </span>
                <span aria-hidden="true">·</span>
                <time dateTime={isoTime(story.createdAt)} title={fullTime(story.createdAt)}>{fullTime(story.createdAt)}</time>
                <span aria-hidden="true">·</span>
                <span>{readMinutes(story.script)} min read</span>
              </div>

              {story.status === "approved" ? (
                <p className="mt-4 flex items-start gap-2 rounded-control bg-success-text/10 p-3 text-caption text-fg-muted">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success-text" aria-hidden="true" />
                  <span>Checked against its {plural((story.sources || []).length, "source")}{story.reviewedBy ? ` by @${story.reviewedBy}` : ""}{story.reviewedAt ? ` on ${fullTime(story.reviewedAt)}` : ""}. Review isn't a guarantee of truth, so read the sources too.</span>
                </p>
              ) : (
                <p className="mt-4 flex items-center gap-2 rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">
                  <Clock size={16} aria-hidden="true" /> Not published. Only you and reviewers can see this.
                </p>
              )}

              {story.corrections?.length > 0 && <Corrections list={story.corrections} />}

              {story.coverUrl && (
                <MediaImg src={story.coverUrl} alt={`Photo for: ${story.title}`}
                  className="mt-5 aspect-[16/9] w-full rounded-card object-cover" placeholderClass="mt-5 aspect-[16/9] w-full rounded-card" />
              )}

              <StoryBody story={story} />

              <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
                <Button icon={Share2} onClick={share}>Share</Button>
                <Button icon={Link2} onClick={copy}>Copy link</Button>
                {story.status === "approved" && (
                  <Button icon={Flag} onClick={() => setDialog("suggest")}>Suggest a correction</Button>
                )}
                {story.status !== "approved" && story.authorId === me() && (
                  <Button variant="danger" icon={X} onClick={() => setDialog("withdraw")}>Withdraw submission</Button>
                )}
              </div>

              {admin && story.status === "approved" && (
                <section aria-labelledby="corr-admin-h" className="mt-8 rounded-card border border-line bg-surface p-4">
                  <h2 id="corr-admin-h" className="flex items-center gap-2 text-callout font-semibold">
                    <Inbox size={16} aria-hidden="true" /> Correction requests
                    {requests?.length > 0 && <Badge tone="warning">{requests.length}</Badge>}
                  </h2>
                  {requests === null && <p className="mt-2 text-caption text-fg-subtle">Loading…</p>}
                  {requests?.length === 0 && <p className="mt-2 text-caption text-fg-muted">No one has flagged anything.</p>}
                  {requests?.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {requests.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)).map((r) => (
                        <li key={r.id} className="rounded-control bg-surface-2 p-3 text-callout">
                          <p className="whitespace-pre-wrap break-words">{r.text}</p>
                          <p className="mt-1 text-caption text-fg-subtle">@{r.authorName || "reader"} · {shortTime(r.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button size="sm" variant="primary" icon={PenLine} className="mt-3" onClick={() => setDialog("correct")}>Add a public correction</Button>
                </section>
              )}
            </article>
          )}
        </div>
      </div>

      {dialog === "suggest" && <SuggestCorrectionDialog story={story} onClose={() => setDialog(null)} />}
      {dialog === "withdraw" && (
        <ConfirmDialog title="Withdraw this submission?" confirmLabel="Withdraw and delete"
          body="It's deleted, and reviewers won't see it. You can submit a new version any time."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try { await deleteNews(story.id); toast({ title: "Submission withdrawn" }); navigate("/news", { replace: true }); }
            catch { toast({ tone: "error", title: "Couldn't withdraw it" }); setDialog(null); }
          }} />
      )}
      {dialog === "correct" && (
        <AddCorrectionDialog story={story} onClose={() => setDialog(null)}
          onAdded={() => { setDialog(null); load(); toast({ title: "Correction added", body: "It shows at the top of the story." }); }} />
      )}
    </>
  );
}

/* Key points, the script with its numbered citations, and the source list
   they point to. Shared by the story page and the review queue. */
function StoryBody({ story }) {
  const sources = story.sources || [];
  const uid = `n-${story.id}`;
  const jump = (e, n) => {
    e.preventDefault();
    const el = document.getElementById(`${uid}-src-${n}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector("a")?.focus({ preventScroll: true });
  };
  const paragraphs = String(story.script || "").split(/\n{2,}|\n/).filter((p) => p.trim());

  return (
    <>
      {story.keyPoints?.filter(Boolean).length > 0 && (
        <section aria-label="Key points" className="mt-6 rounded-card border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">
            <ListChecks size={14} aria-hidden="true" /> Key points
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
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap break-words">
            {p.split(CITE).map((part, j, all) => {
              // "morning [1]." reads as "morning¹." with no gap before the number.
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
            })}
          </p>
        ))}
      </div>

      <section aria-labelledby={`${uid}-src-h`} className="mt-8 border-t border-line pt-5">
        <h2 id={`${uid}-src-h`} className="text-label font-semibold uppercase tracking-wider text-fg-subtle">
          Sources · {sources.length}
        </h2>
        <ol className="mt-3 space-y-2">
          {sources.map((s, i) => (
            <li key={i} id={`${uid}-src-${i + 1}`} className="flex scroll-mt-24 gap-3">
              <span className="mt-2 w-6 shrink-0 text-right text-caption font-semibold text-fg-subtle tabular">{i + 1}</span>
              <a href={s} target="_blank" rel="noopener noreferrer nofollow ugc"
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

function Corrections({ list }) {
  const sorted = [...list].sort((a, b) => tsMillis(b.at) - tsMillis(a.at));
  return (
    <section aria-labelledby="corrections-h" className="mt-4 rounded-card border border-warning-text/40 bg-warning-text/10 p-4">
      <h2 id="corrections-h" className="flex items-center gap-2 text-callout font-semibold text-warning-text">
        <AlertTriangle size={16} aria-hidden="true" /> {list.length === 1 ? "Correction" : `${list.length} corrections`}
      </h2>
      <ul className="mt-2 space-y-2">
        {sorted.map((c, i) => (
          <li key={i} className="text-callout text-fg">
            <time dateTime={isoTime(c.at)} className="mr-1.5 font-semibold">{fullTime(c.at)}:</time>{c.note}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SuggestCorrectionDialog({ story, onClose }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, 1000, "Your note");
    if (v.error) return setError(v.error);
    if (v.text.length < 10) return setError("Say what's wrong in at least a few words.");
    const mod = checkContent(v.text, { key: "correction" });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    try {
      await suggestCorrection(story.id, v.text);
      toast({ title: "Thanks, a reviewer will look at it", body: "If it's right, a correction is added to the story publicly." });
      onClose();
    } catch {
      setError("Couldn't send that. Check your connection and try again.");
      setBusy(false);
    }
  };
  return (
    <Dialog title="Suggest a correction" onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="suggest-form" variant="primary" loading={busy}>Send to reviewers</Button>
      </div>}>
      <form id="suggest-form" onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-callout text-fg-muted">What's wrong, and how do you know? A link to a better source helps most. Only reviewers see this.</p>
        <Field label="Your note" error={error} count={text.length} max={1000}>
          <Textarea autoGrow rows={4} value={text} maxLength={1000} onChange={(e) => { setText(e.target.value); setError(""); }}
            placeholder="e.g. The second paragraph says 40%, but source 2 says 14%." />
        </Field>
      </form>
    </Dialog>
  );
}

function AddCorrectionDialog({ story, onClose, onAdded }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const t = note.trim();
    if (t.length < 10) return setError("Describe the correction in a sentence.");
    setBusy(true);
    try { await addCorrection(story, t); onAdded(); }
    catch { setError("Couldn't add it. Only reviewers can add corrections."); setBusy(false); }
  };
  return (
    <Dialog title="Add a public correction" onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="correct-form" variant="primary" loading={busy}>Publish correction</Button>
      </div>}>
      <form id="correct-form" onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-callout text-fg-muted">It's shown at the top of the story with today's date and can't be removed later. Say what was wrong and what's right.</p>
        <Field label="Correction" error={error} count={note.length} max={500}>
          <Textarea autoGrow rows={3} value={note} maxLength={500} onChange={(e) => { setNote(e.target.value); setError(""); }}
            placeholder="An earlier version said the council voted 6 to 3. It was 5 to 4." />
        </Field>
      </form>
    </Dialog>
  );
}

// ---------- review ----------

const CHECKS = [
  "Every claim in the script is supported by one of its sources",
  "The sources are real, reachable, and say what the story says they say",
  "No photos, footage, audio or quotes look generated or altered",
];

/* Approving needs the checklist ticked, so review is a deliberate act,
   not a button pressed on the way past. */
function ReviewCard({ item, onReview }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState([]);
  const ready = checked.length === CHECKS.length;
  return (
    <article aria-labelledby={`rv-${item.id}`} className="rounded-card border border-accent-text bg-surface p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label">
        <TopicLabel id={item.topic} />
        {item.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{item.location}</span>}
        <span className="text-fg-subtle">by @{item.authorName} · {shortTime(item.createdAt)}</span>
      </p>
      <h3 id={`rv-${item.id}`} className="mt-2 text-title-2">{item.title}</h3>
      {item.coverUrl && <MediaImg src={item.coverUrl} alt="Submitted cover photo" className="mt-3 aspect-[16/9] w-full rounded-control object-cover" placeholderClass="mt-3 aspect-[16/9] w-full rounded-control" />}
      <StoryBody story={item} />

      <div className="mt-5 border-t border-line pt-4">
        {!rejecting ? (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-callout font-semibold">Before you publish</legend>
              {CHECKS.map((c, i) => (
                <Checkbox key={i} checked={checked.includes(i)}
                  onChange={(v) => setChecked((prev) => (v ? [...prev, i] : prev.filter((x) => x !== i)))}>
                  {c}
                </Checkbox>
              ))}
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={Check} disabled={!ready} onClick={() => onReview(item, "approved")}>Approve and publish</Button>
              <Button icon={X} onClick={() => setRejecting(true)}>Don't publish</Button>
            </div>
            {!ready && <p className="mt-2 text-caption text-fg-subtle">Tick all three to publish.</p>}
          </>
        ) : (
          <div className="space-y-3">
            <Field label="Why not? (shown to the author)" optional>
              <Textarea autoGrow rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
                placeholder="e.g. The second source doesn't support the claim about…" />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => setRejecting(false)}>Back</Button>
              <Button variant="danger" onClick={() => onReview(item, "rejected", note.trim())}>Return to author</Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

// ---------- submitting ----------

function SubmitDialog({ onClose, onSubmitted }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("world");
  const [location, setLocation] = useState("");
  const [keyPoints, setKeyPoints] = useState(["", "", ""]);
  const [script, setScript] = useState("");
  const [sources, setSources] = useState("");
  const [cover, setCover] = useState(null);
  const [preview, setPreview] = useState("");
  const [attest, setAttest] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickCover = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors((x) => ({ ...x, cover: "Choose a photo (JPEG, PNG, WebP or HEIC)." }));
    if (file.size > 20 * 1024 * 1024) return setErrors((x) => ({ ...x, cover: "That photo is over 20 MB." }));
    setErrors((x) => ({ ...x, cover: "" }));
    setCover(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const t = title.trim();
    if (t.length < LIMITS.newsTitle.min) errs.title = `Headlines need at least ${LIMITS.newsTitle.min} characters.`;
    const vScript = validateText(script, LIMITS.newsScript.max, "Script");
    if (vScript.error) errs.script = vScript.error;
    else if (vScript.text.length < LIMITS.newsScript.min) errs.script = `Include the full script, at least ${LIMITS.newsScript.min} characters.`;
    const vSources = validateSources(sources);
    if (vSources.error) errs.sources = vSources.error;
    else if (!errs.script) {
      const cited = [...vScript.text.matchAll(CITE)].map((m) => Number(m[1]));
      const tooHigh = cited.find((n) => n > vSources.sources.length || n < 1);
      if (tooHigh !== undefined) errs.script = `You cite [${tooHigh}] but list ${plural(vSources.sources.length, "source")}.`;
      else if (!cited.length) errs.script = "Cite your sources in the text by number, like [1] or [2], so readers can check each claim.";
    }
    const points = keyPoints.map((k) => k.trim()).filter(Boolean);
    if (points.some((k) => k.length > 200)) errs.keyPoints = "Keep each key point under 200 characters.";
    if (location.trim().length > 80) errs.location = "Keep the location under 80 characters.";
    if (!attest) errs.attest = "Confirm the declaration to submit.";
    if (!errs.title && !errs.script) {
      const mod = checkContent(`${t}\n${points.join("\n")}\n${vScript.text}`, { key: "news" });
      if (mod.error) errs.script = mod.error;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const coverUrl = cover ? (await uploadMedia(cover)).url : "";
      await submitNews({ title: t, script: vScript.text, sources: vSources.sources, topic, keyPoints: points, location: location.trim(), coverUrl });
      markPosted("news", `${t}\n${vScript.text}`);
      onSubmitted();
    } catch (err) {
      console.error(err);
      setErrors({ submit: err?.code === "permission-denied"
        ? "The server turned this down. Under-16 accounts can't submit news; if that's not you, the rules may need redeploying."
        : "Couldn't submit. Check your connection. Your story is still here." });
      setBusy(false);
    }
  };

  return (
    <Dialog title="Submit a news story" onClose={onClose} variant="full" size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0"><InlineMessage>{errors.submit}</InlineMessage></div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form="news-form" variant="primary" loading={busy}>Send for review</Button>
          </div>
        </div>
      }>
      <form id="news-form" onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-callout text-fg-muted">
          A reviewer checks your story against its sources before anyone sees it. Give them everything they need.
        </p>
        <Field label="Headline" error={errors.title} count={title.length} max={LIMITS.newsTitle.max}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.newsTitle.max}
            placeholder="State what happened, plainly" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Topic">
            <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {NEWS_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Where it happened" optional error={errors.location}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} placeholder="e.g. Geelong, VIC" />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-callout font-medium">Key points <span className="font-normal text-fg-subtle">Optional, up to 3</span></legend>
          <p className="mb-2 text-caption text-fg-subtle">The story in three lines, for people skimming. The first one is shown on the front page.</p>
          <div className="space-y-2">
            {keyPoints.map((k, i) => (
              <Input key={i} value={k} maxLength={200} aria-label={`Key point ${i + 1}`} placeholder={`Key point ${i + 1}`}
                onChange={(e) => setKeyPoints((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
          </div>
          <div aria-live="polite"><InlineMessage>{errors.keyPoints}</InlineMessage></div>
        </fieldset>
        <Field label="Full script" hint="Everything you'll say. Cite a source by its number, like [1], after the claim it supports."
          error={errors.script} count={script.length} max={LIMITS.newsScript.max}>
          <Textarea autoGrow rows={8} maxRows={20} value={script} onChange={(e) => setScript(e.target.value)} maxLength={LIMITS.newsScript.max} />
        </Field>
        <Field label="Sources" hint={`At least ${LIMITS.newsSources.min}, up to ${LIMITS.newsSources.max}. One link per line, in the order you number them.`} error={errors.sources}>
          <Textarea autoGrow rows={3} value={sources} onChange={(e) => setSources(e.target.value)}
            placeholder={"https://… (this is [1])\nhttps://… (this is [2])"} spellCheck={false} autoCapitalize="none" />
        </Field>
        <div>
          <p className="mb-2 text-callout font-medium">Cover photo <span className="font-normal text-fg-subtle">Optional</span></p>
          {preview ? (
            <div className="relative overflow-hidden rounded-card border border-line">
              <img src={preview} alt="Your chosen cover" className="aspect-[16/9] w-full object-cover" />
              <Button size="sm" icon={X} className="absolute right-2 top-2" onClick={() => { setCover(null); setPreview(""); }}>Remove</Button>
            </div>
          ) : (
            <Button icon={ImagePlus} onClick={() => fileRef.current?.click()}>Add a cover photo</Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="mt-2 text-caption text-fg-subtle">Only a photo you took or have the right to use. No AI-generated images.</p>
          <div aria-live="polite"><InlineMessage>{errors.cover}</InlineMessage></div>
        </div>
        <div className={`rounded-card border p-3 ${errors.attest ? "border-danger-text" : "border-line"} bg-surface`}>
          <Checkbox checked={attest} onChange={(v) => { setAttest(v); setErrors((x) => ({ ...x, attest: "" })); }}
            description="Your confirmation is recorded with the submission.">
            This story is accurate to the best of my knowledge, and nothing in it (images, footage, audio or quotes) was
            generated or altered by AI to look real.
          </Checkbox>
          <div aria-live="polite"><InlineMessage>{errors.attest}</InlineMessage></div>
        </div>
      </form>
    </Dialog>
  );
}
