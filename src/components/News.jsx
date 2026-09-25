import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, ExternalLink, Newspaper, PenLine, ChevronDown, Clock, XCircle, Check, X } from "lucide-react";
import { fetchNews, fetchMyNews, submitNews, isAdmin, reviewNews, openUserProfile } from "../lib/db";
import { LIMITS, validateText, validateSources } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";
import { useLocation } from "../lib/router";
import { shortTime, fullTime, isoTime } from "../lib/format";
import HomeHeader from "./shell/HomeHeader";
import FeedTabs from "./shell/FeedTabs";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Dialog from "./ui/Dialog";
import { Field, Input, Textarea, Checkbox } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

/* News is its own place, with its own rules: every story names its sources,
   and a person checks it against them before it's published. The page is
   careful to say what review is and isn't: it's not a guarantee of truth. */
export default function News() {
  const toast = useToast();
  const loc = useLocation();
  const focusId = loc.query.get("story");
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <>
      <HomeHeader section="news"
        actions={<Button size="sm" variant="primary" icon={PenLine} className="hidden md:inline-flex" onClick={() => setSubmitting(true)}>Submit a story</Button>}>
        <FeedTabs value="news" />
      </HomeHeader>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-4 pb-16 pt-5 md:px-6">
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
                  <li key={n.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-callout font-medium">{n.title}</p>
                      {n.status === "pending"
                        ? <Badge tone="warning" icon={Clock}>In review</Badge>
                        : <Badge tone="danger" icon={XCircle}>Not published</Badge>}
                    </div>
                    {n.status === "rejected" && n.reviewNote && (
                      <p className="mt-2 text-caption text-fg-muted">Reviewer's note: {n.reviewNote}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="stories-h" className="mt-8">
            <h2 id="stories-h" className="sr-only">Published stories</h2>
            {error && <ErrorState title="Couldn't load the news" onRetry={load} />}
            {!error && items === null && (
              <div className="space-y-4" role="status" aria-label="Loading stories">
                {[0, 1].map((i) => <Skeleton key={i} className="h-48 !rounded-card" />)}
              </div>
            )}
            {items?.length === 0 && (
              <EmptyState icon={Newspaper} title="No stories published yet"
                body="Stories appear here once a reviewer has checked them against their sources."
                action={<Button variant="primary" icon={PenLine} onClick={() => setSubmitting(true)}>Submit the first story</Button>} />
            )}
            <div className="space-y-4">
              {items?.map((n) => <NewsCard key={n.id} item={n} focused={n.id === focusId} />)}
            </div>
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
        <p>Each submission needs its full script and at least two sources. A reviewer checks the story against those sources before it goes up.</p>
        <p>AI can't be used to fabricate evidence: no generated photos, footage, audio or quotes presented as real.</p>
        <p className="text-fg">Review isn't a guarantee of truth. Read the sources and make up your own mind.</p>
        <Button size="sm" variant="primary" icon={PenLine} className="mt-2 md:hidden" onClick={onSubmit}>Submit a story</Button>
      </div>
    </details>
  );
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function NewsCard({ item, focused = false, children }) {
  const [expanded, setExpanded] = useState(focused);
  const ref = useRef(null);
  const long = (item.script || "").length > 420;

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focused]);

  return (
    <article ref={ref} aria-labelledby={`n-${item.id}`}
      className={`scroll-mt-4 rounded-card border bg-surface p-5 ${focused ? "border-accent-text" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
        {item.status === "approved" && <Badge tone="success" icon={ShieldCheck}>Reviewed against sources</Badge>}
        <button type="button" onClick={() => openUserProfile(item.authorId)} className="font-medium text-fg-muted hover:underline">
          @{item.authorName}
        </button>
        <time dateTime={isoTime(item.createdAt)} title={fullTime(item.createdAt)}>· {shortTime(item.createdAt)}</time>
      </div>
      <h3 id={`n-${item.id}`} className="mt-3 text-title-2">{item.title}</h3>
      <p id={`n-${item.id}-body`} className={`mt-2 max-w-[68ch] whitespace-pre-wrap break-words text-body text-fg-muted ${expanded || !long ? "" : "line-clamp-5"}`}>
        {item.script}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} aria-controls={`n-${item.id}-body`}
          className="mt-2 min-h-11 text-callout font-semibold text-accent-text hover:underline">
          {expanded ? "Show less" : "Read the full story"}
        </button>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-label font-semibold uppercase tracking-wider text-fg-subtle">Sources · {(item.sources || []).length}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {(item.sources || []).map((s, i) => (
            <li key={i}>
              <a href={s} target="_blank" rel="noopener noreferrer nofollow ugc" title={s}
                className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-caption font-medium text-fg hover:bg-surface-3">
                {hostOf(s)} <ExternalLink size={12} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      {children}
    </article>
  );
}

function ReviewCard({ item, onReview }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  return (
    <NewsCard item={item} focused>
      <div className="mt-4 border-t border-line pt-4">
        {!rejecting ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Check} onClick={() => onReview(item, "approved")}>Approve and publish</Button>
            <Button icon={X} onClick={() => setRejecting(true)}>Don't publish</Button>
          </div>
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
    </NewsCard>
  );
}

function SubmitDialog({ onClose, onSubmitted }) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [sources, setSources] = useState("");
  const [attest, setAttest] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

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
    if (!attest) errs.attest = "Confirm the declaration to submit.";
    if (!errs.title && !errs.script) {
      const mod = checkContent(`${t}\n${vScript.text}`, { key: "news" });
      if (mod.error) errs.script = mod.error;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await submitNews({ title: t, script: vScript.text, sources: vSources.sources });
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
        <Field label="Full script" hint="Everything you'll say. Every claim should be traceable to a source."
          error={errors.script} count={script.length} max={LIMITS.newsScript.max}>
          <Textarea autoGrow rows={8} maxRows={20} value={script} onChange={(e) => setScript(e.target.value)} maxLength={LIMITS.newsScript.max} />
        </Field>
        <Field label="Sources" hint={`At least ${LIMITS.newsSources.min}, up to ${LIMITS.newsSources.max}. One link per line.`} error={errors.sources}>
          <Textarea autoGrow rows={3} value={sources} onChange={(e) => setSources(e.target.value)}
            placeholder={"https://…\nhttps://…"} spellCheck={false} autoCapitalize="none" />
        </Field>
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
