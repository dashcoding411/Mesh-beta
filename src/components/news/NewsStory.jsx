import {
  AlertTriangle, ArrowLeft, Clock, Flag, Inbox, Link2, MapPin, Newspaper, PenLine, Share2, X, Radio, RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addCorrection, deleteNews, fetchCorrectionRequests, fetchNewsStory, onTeam, me, recordNewsRead,
  suggestCorrection, tsMillis,
} from "../../lib/db";
import { fullTime, isoTime, plural, shortTime } from "../../lib/format";
import { checkContent } from "../../lib/moderation";
import { goBack, navigate } from "../../lib/router";
import { usePageTitle } from "../../lib/usePageTitle";
import { validateText } from "../../lib/validate";
import { labelOf } from "../../lib/storyDoc";
import HomeHeader from "../shell/HomeHeader";
import { useShell } from "../shell/ShellContext";
import { StoryBody } from "./StoryBody";
import { LiveUpdates } from "./LiveUpdates";
import { Byline } from "./Journalist";
import { KindBadge, TopicLabel } from "./parts";
import { hasFlick, readMinutes, storyUrl } from "./text";
import { markStoryRead } from "../../lib/newsBrief";
import Badge from "../ui/Badge";
import { VerifiedTick } from "../ui/Badges";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import { Field, Textarea } from "../ui/Field";
import MediaImg from "../ui/MediaImg";
import { EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

export function NewsStory({ id }) {
  const toast = useToast();
  const { needsAccount } = useShell();
  const [story, setStory] = useState(undefined); // undefined loading, null missing
  usePageTitle(story?.title || null, 1);
  const [admin, setAdmin] = useState(false);
  const [dialog, setDialog] = useState(null); // "suggest" | "correct" | "withdraw"
  const [requests, setRequests] = useState(null);

  const load = useCallback(async () => {
    const [s, amAdmin] = await Promise.all([fetchNewsStory(id), onTeam("news").catch(() => false)]);
    setStory(s);
    setAdmin(amAdmin);
    const author = !!s && (s.authors || [s.authorId]).includes(me());
    if ((amAdmin || author) && s) setRequests(await fetchCorrectionRequests(id).catch(() => []));
  }, [id]);
  const mine = !!story && (story.authors || [story.authorId]).includes(me());
  useEffect(() => { (async () => { await load(); })(); }, [load]);
  // Counts once per signed-in reader, so journalists see their real audience.
  useEffect(() => {
    if (!story) return;
    recordNewsRead(story).catch(() => {});
    if (story.status === "approved") markStoryRead(story.id);
  }, [story]);
  const kind = labelOf(story?.label);

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
                <KindBadge id={story.label} />
                <TopicLabel id={story.topic} />
                {story.live && <Badge tone="danger" icon={Radio}>Live</Badge>}
                {story.location && <span className="inline-flex items-center gap-1 text-fg-subtle"><MapPin size={12} aria-hidden="true" />{story.location}</span>}
              </p>
              <h1 id="story-title" className="mt-2 font-display text-title-1 leading-tight md:text-[2.25rem]">{story.title}</h1>
              {story.standfirst && <p className="mt-2 text-title-3 font-normal leading-snug text-fg-muted">{story.standfirst}</p>}
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
                {(story.authors || [story.authorId]).map((uid, i) => (
                  <Byline key={uid} uid={uid} username={(story.authorNames || [story.authorName])[i]} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                <time dateTime={isoTime(story.createdAt)} title={fullTime(story.createdAt)}>{fullTime(story.createdAt)}</time>
                <span aria-hidden="true">·</span>
                <span>{readMinutes(story.script)} min read</span>
                {mine && story.status === "approved" && (
                  <><span aria-hidden="true">·</span><span>{plural(story.readCount || 0, "read")} (only you see this)</span></>
                )}
              </div>
              {story.updateNoteAt && (
                <p className="mt-3 flex items-start gap-2 rounded-control border border-line bg-surface-2 p-3 text-caption">
                  <RefreshCw size={14} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
                  <span>
                    <strong className="font-semibold text-fg">Updated <time dateTime={isoTime(story.updateNoteAt)} title={fullTime(story.updateNoteAt)}>{fullTime(story.updateNoteAt)}</time>:</strong>{" "}
                    <span className="text-fg-muted">{story.updateNote}</span>
                  </span>
                </p>
              )}
              {kind?.id === "opinion" && (
                <p className="mt-3 text-caption text-fg-muted">This is opinion: the journalist's own view, not a news report.</p>
              )}

              {story.status === "approved" ? (
                <p className="mt-4 flex items-start gap-2 rounded-control bg-accent-soft p-3 text-caption text-fg-muted">
                  <VerifiedTick size={16} decorative className="mt-0.5" />
                  <span>Written and published by the journalist{story.authors?.length > 1 ? "s" : ""} named above, citing {plural((story.sources || []).length, "source")}, listed below. Mesh hosts this story; it doesn't write, edit or approve it. Read the sources and form your own view.</span>
                </p>
              ) : (
                <p className="mt-4 flex items-center gap-2 rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">
                  <Clock size={16} aria-hidden="true" /> Not yet published. Only the story's journalists can see it.
                </p>
              )}

              {story.corrections?.length > 0 && <Corrections list={story.corrections} />}

              {story.coverUrl && !hasFlick(story) && (
                <MediaImg src={story.coverUrl} alt={`Photo for: ${story.title}`}
                  className="mt-5 aspect-[16/9] w-full rounded-card object-cover" placeholderClass="mt-5 aspect-[16/9] w-full rounded-card" />
              )}

              <StoryBody story={story} />

              {story.format === "live" && story.status === "approved" && (
                <LiveUpdates story={story} isAuthor={(story.authors || [story.authorId]).includes(me())}
                  onLiveChange={(live) => setStory((s) => ({ ...s, live }))} />
              )}

              <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
                {mine && story.status === "approved" && (
                  <Button variant="primary" icon={RefreshCw} onClick={() => navigate(`/news/write/${id}?update=1`)}>Update story</Button>
                )}
                <Button icon={Share2} onClick={share}>Share</Button>
                <Button icon={Link2} onClick={copy}>Copy link</Button>
                {story.status === "approved" && (
                  <Button icon={Flag} onClick={() => { if (!needsAccount("flag mistakes")) setDialog("suggest"); }}>Flag a mistake</Button>
                )}
                {story.status !== "approved" && (story.authors || [story.authorId]).includes(me()) && (
                  <Button icon={PenLine} onClick={() => navigate(`/news/write/${story.id}`)}>Open in the newsroom</Button>
                )}
                {story.status !== "approved" && story.authorId === me() && (
                  <Button variant="danger" icon={X} onClick={() => setDialog("withdraw")}>Delete draft</Button>
                )}
              </div>

              {(admin || mine) && story.status === "approved" && (
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
        <ConfirmDialog title="Delete this draft?" confirmLabel="Delete draft"
          body="The draft and its history will be permanently deleted. To continue working on it instead, open it in the Newsroom."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try { await deleteNews(story.id); toast({ title: "Draft deleted" }); navigate("/news", { replace: true }); }
            catch { toast({ tone: "error", title: "The draft could not be deleted" }); setDialog(null); }
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
      toast({ title: "Sent to the journalist" });
      onClose();
    } catch {
      setError("Couldn't send that. Check your connection and try again.");
      setBusy(false);
    }
  };
  return (
    <Dialog title="Flag a mistake" onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="suggest-form" variant="primary" loading={busy}>Send</Button>
      </div>}>
      <form id="suggest-form" onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-callout text-fg-muted">Only the journalist sees this. They decide whether to correct the story.</p>
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
    catch { setError("The correction could not be added. Only the story's journalists and Mesh administrators can add corrections."); setBusy(false); }
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
