// One story's page, with its corrections and the ways to report an error.
import {
  AlertTriangle, ArrowLeft, Clock, Flag, Inbox, Link2, MapPin, Newspaper, PenLine, Share2, ShieldCheck, X, Radio,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addCorrection, deleteNews, fetchCorrectionRequests, fetchNewsStory, isAdmin, me,
  openUserProfile, suggestCorrection, tsMillis,
} from "../../lib/db";
import { fullTime, isoTime, plural, shortTime } from "../../lib/format";
import { checkContent } from "../../lib/moderation";
import { goBack, navigate } from "../../lib/router";
import { usePageTitle } from "../../lib/usePageTitle";
import { validateText } from "../../lib/validate";
import HomeHeader from "../shell/HomeHeader";
import { StoryBody } from "./StoryBody";
import { LiveUpdates } from "./LiveUpdates";
import { TopicLabel } from "./parts";
import { readMinutes, storyUrl } from "./text";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import { Field, Textarea } from "../ui/Field";
import MediaImg from "../ui/MediaImg";
import { EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

export function NewsStory({ id }) {
  const toast = useToast();
  const [story, setStory] = useState(undefined); // undefined loading, null missing
  usePageTitle(story?.title || null, 1);
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
                {story.live && <Badge tone="danger" icon={Radio}>Live</Badge>}
                {story.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{story.location}</span>}
              </p>
              <h1 id="story-title" className="mt-2 font-display text-title-1 leading-tight md:text-[2.25rem]">{story.title}</h1>
              {story.standfirst && <p className="mt-2 text-title-3 font-normal leading-snug text-fg-muted">{story.standfirst}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                <span>By{" "}
                  {(story.authors || [story.authorId]).map((uid, i, all) => (
                    <span key={uid}>
                      <button type="button" onClick={() => openUserProfile(uid)} className="font-semibold text-fg-muted hover:underline">
                        @{(story.authorNames || [story.authorName])[i]}
                      </button>
                      {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
                    </span>
                  ))}
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

              {story.format === "live" && story.status === "approved" && (
                <LiveUpdates story={story} isAuthor={(story.authors || [story.authorId]).includes(me())}
                  onLiveChange={(live) => setStory((s) => ({ ...s, live }))} />
              )}

              <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
                <Button icon={Share2} onClick={share}>Share</Button>
                <Button icon={Link2} onClick={copy}>Copy link</Button>
                {story.status === "approved" && (
                  <Button icon={Flag} onClick={() => setDialog("suggest")}>Suggest a correction</Button>
                )}
                {story.status !== "approved" && (story.authors || [story.authorId]).includes(me()) && (
                  <Button icon={PenLine} onClick={() => navigate(`/news/write/${story.id}`)}>Open in the newsroom</Button>
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
          body="It's deleted, with its history, and reviewers won't see it. To keep working on it instead, open it in the Newsroom."
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
