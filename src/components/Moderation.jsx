import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, BadgeCheck, Trash2, Check, Eye, EyeOff, ImageIcon, UserX, FileText, MessageCircle, Mail, UserRound, ExternalLink, Undo2, Gavel, WandSparkles, Scale,
} from "lucide-react";
import {
  staffRole, fetchAppeals, decideAppeal, fetchModerators, addModerator, removeModerator, fetchReports, resolveReports, clearPost, labelPostAi, removeComment, removeMessage, deletePost, fetchPost, fetchProfile,
  suspendUser, liftSuspension, fetchSuspensions, openPost, openUserProfile, REPORT_LABEL, SUSPENSION_LENGTHS, tsMillis,
  fetchWriters, addWriter, removeWriter, fetchVerified, setBadge, uidForUsername, setPostHidden,
} from "../lib/db";
import { assessText, RULE_NAMES } from "../lib/moderation";
import { markImageOk, sweepImages } from "../lib/imageSweep";
import { navigate } from "../lib/router";
import { shortTime, fullTime, plural } from "../lib/format";
import TopBar from "./shell/TopBar";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Dialog from "./ui/Dialog";
import MediaImg from "./ui/MediaImg";
import { Field, Textarea } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";

const TYPE = {
  post: { label: "Post", icon: FileText },
  comment: { label: "Comment", icon: MessageCircle },
  message: { label: "Message", icon: Mail },
  user: { label: "Account", icon: UserRound },
};

// Reports are grouped per target, busiest first; decisions are recorded on each report.
export default function Moderation() {
  // Admin or moderator; null while checking.
  const [admin, setAdmin] = useState(null);
  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    staffRole().then((r) => setAdmin(!!r)).catch(() => setAdmin(false));
  }, []);

  // The image sweep runs whenever a moderator opens this page.
  const [sweep, setSweep] = useState({ status: "idle", done: 0, total: 0, flagged: [] });
  const runSweep = useCallback(async () => {
    setSweep({ status: "running", done: 0, total: 0, flagged: [] });
    try {
      const flagged = await sweepImages({ onProgress: (done, total) => setSweep((s) => ({ ...s, done, total })) });
      setSweep((s) => ({ ...s, status: "done", flagged }));
    } catch {
      setSweep((s) => ({ ...s, status: "error" }));
    }
  }, []);
  useEffect(() => { if (admin) (async () => { await runSweep(); })(); }, [admin, runSweep]);

  const load = useCallback(async () => {
    setError(false);
    setReports(null);
    try {
      setReports(["suspended", "writers", "verified", "images", "mods", "appeals"].includes(tab) ? [] : await fetchReports(tab === "open" ? "open" : "actioned")
        .then(async (list) => (tab === "open" ? list : [...list, ...(await fetchReports("dismissed"))])));
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, [tab]);
  useEffect(() => { if (admin) (async () => { await load(); })(); }, [admin, load]);

  const cases = useMemo(() => {
    const byTarget = new Map();
    for (const r of reports || []) {
      const key = `${r.targetType}_${r.targetId}`;
      if (!byTarget.has(key)) byTarget.set(key, { key, type: r.targetType, targetId: r.targetId, reports: [] });
      byTarget.get(key).reports.push(r);
    }
    return [...byTarget.values()].sort((a, b) =>
      b.reports.length - a.reports.length || tsMillis(b.reports[0].createdAt) - tsMillis(a.reports[0].createdAt));
  }, [reports]);

  const done = (key) => setReports((list) => list.filter((r) => `${r.targetType}_${r.targetId}` !== key));

  return (
    <>
      <TopBar title="Moderation" back backTo="/account/settings" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-5 px-4 pb-16 pt-5 md:px-6">
          <header className="hidden md:block"><h1 className="text-title-1">Moderation</h1></header>

          {admin === null && <Skeleton className="h-24 !rounded-card" />}
          {admin === false && (
            <EmptyState icon={ShieldCheck} title="For Mesh moderators"
              body="This page is available to Mesh moderators only. To report content, use the Report option on the post, comment, message or profile." />
          )}

          {admin && (
            <>
              <p className="flex gap-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
                <Gavel size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Decisions must follow the <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => navigate("/legal/guidelines")}>Community Guidelines</button> and
                  be applied consistently, regardless of which group is targeted or which viewpoint is expressed. Criticism of ideas, religions,
                  countries and governments is permitted. Attacks on people for who they are are removed.
                </span>
              </p>
              <Tabs label="Reports" value={tab} onChange={setTab} variant="underline"
                tabs={[{ id: "open", label: "Open reports" }, { id: "appeals", label: "Appeals" }, { id: "closed", label: "Resolved" }, { id: "suspended", label: "Suspensions" },
                  { id: "images", label: sweep.flagged.length ? `Images (${sweep.flagged.length})` : "Images" },
                  { id: "writers", label: "Journalists" }, { id: "verified", label: "Verified" }, { id: "mods", label: "Moderators" }]} />

              {tab === "images" ? <ImageReview sweep={sweep} setSweep={setSweep} onRescan={runSweep} />
                : tab === "appeals" ? <Appeals />
                : tab === "mods" ? <Moderators /> : tab === "writers" ? <Writers /> : tab === "verified" ? <Verified /> : tab === "suspended" ? <Suspensions /> : (
                <>
                  {error && <ErrorState title="Reports could not be loaded" onRetry={load} />}
                  {!error && reports === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>}
                  {reports?.length === 0 && (
                    <EmptyState icon={ShieldCheck} title={tab === "open" ? "No open reports" : "No resolved reports"}
                      body={tab === "open" ? "New reports will appear here for review." : "Resolved reports are listed here with the decision, the moderator and the date."} />
                  )}
                  <ul className="space-y-4">
                    {cases.map((c) => <li key={c.key}><Case item={c} readOnly={tab !== "open"} onDone={() => done(c.key)} /></li>)}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Case({ item, readOnly, onDone }) {
  const toast = useToast();
  const [target, setTarget] = useState(undefined); // undefined: loading, null: gone
  const [busy, setBusy] = useState("");
  const [suspending, setSuspending] = useState(false);
  const first = item.reports[0];
  const authorId = first.authorId;
  const T = TYPE[item.type] || TYPE.post;

  useEffect(() => {
    let alive = true;
    const get = item.type === "post" ? fetchPost(item.targetId)
      : item.type === "user" ? fetchProfile(item.targetId)
      : Promise.resolve({ text: first.excerpt || "" });
    get.then((t) => { if (alive) setTarget(t || null); }).catch(() => { if (alive) setTarget(null); });
    return () => { alive = false; };
  }, [item.type, item.targetId, first.excerpt]);

  const reasons = useMemo(() => {
    const counts = {};
    item.reports.forEach((r) => { counts[r.reason] = (counts[r.reason] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [item.reports]);

  const text = target ? [target.title, target.text, target.bio, target.name].filter(Boolean).join("\n") : "";
  const filter = text ? assessText(text) : { level: "ok" };

  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === "remove") {
        if (item.type === "post" && target) await deletePost({ id: item.targetId, ...target });
        if (item.type === "comment") await removeComment(first.postId, item.targetId);
        if (item.type === "message") await removeMessage(first.chatId, item.targetId);
        await resolveReports(item.reports, "actioned", "removed");
        toast({ title: `${T.label} removed`, body: "The reports have been marked as actioned." });
      } else if (kind === "label") {
        await labelPostAi(item.targetId);
        await resolveReports(item.reports, "actioned", "labelled");
        toast({ title: "Labelled as edited with AI", body: "It now carries the label and is hidden from members who hide AI edits." });
      } else {
        if (item.type === "post" && target) await clearPost(item.targetId);
        await resolveReports(item.reports, "dismissed", "kept");
        toast({ title: "Reports dismissed", body: item.type === "post" ? "The content remains available and will not be held for these reports again." : "The content remains available." });
      }
      onDone();
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: "The action could not be completed", body: "Confirm that your account has administrator access, then try again." });
      setBusy("");
    }
  };

  return (
    <article className="rounded-card border border-line bg-surface p-4" aria-label={`${T.label} reported ${plural(item.reports.length, "time")}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge icon={T.icon}>{T.label}</Badge>
        <span className="text-callout font-semibold">{plural(item.reports.length, "report")}</span>
        {reasons.map(([id, n]) => <Badge key={id} tone={id === "hate" || id === "violence" ? "danger" : "neutral"}>{REPORT_LABEL[id] || id}{n > 1 ? ` × ${n}` : ""}</Badge>)}
        <span className="ml-auto text-caption text-fg-subtle" title={fullTime(first.createdAt)}>{shortTime(first.createdAt)}</span>
      </div>

      <div className="mt-3 rounded-control bg-surface-2 p-3">
        {target === undefined && <Skeleton className="h-12" />}
        {target === null && <p className="text-callout text-fg-muted">This content is no longer available. It was deleted by its author or by another moderator.</p>}
        {target && item.type === "user" && (
          <button type="button" onClick={() => openUserProfile(item.targetId)} className="text-left">
            <span className="block text-callout font-semibold">{target.name} <span className="font-normal text-fg-subtle">@{target.username}</span></span>
            {target.bio && <span className="mt-1 block text-callout text-fg-muted">{target.bio}</span>}
          </button>
        )}
        {target && item.type !== "user" && (
          <>
            {target.title && <p className="text-callout font-semibold">{target.title}</p>}
            {target.text ? <p className="whitespace-pre-wrap break-words text-callout">{target.text}</p>
              : <p className="text-callout italic text-fg-muted">{item.type === "message" ? "A voice message, GIF or shared post. Moderators cannot open private media." : "No text"}</p>}
            {target.mediaUrl && item.type === "post" && target.mediaType?.startsWith("image") !== false && target.kind === "post" && (
              <MediaImg src={target.mediaUrl} alt={target.alt || "Reported photo"} className="mt-2 max-h-60 rounded-control object-contain" placeholderClass="mt-2 h-40 w-full rounded-control" />
            )}
            {item.type === "post" && (
              <button type="button" onClick={() => openPost(item.targetId)} className="mt-2 inline-flex min-h-9 items-center gap-1 text-caption font-semibold text-accent-text hover:underline">
                Open the post <ExternalLink size={12} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle">
        {authorId && (
          <button type="button" onClick={() => openUserProfile(authorId)} className="font-semibold text-fg-muted hover:underline">
            View the author
          </button>
        )}
        {filter.level !== "ok" && (
          <span>Automated assessment: <strong className="text-warning-text">{filter.level}</strong> ({filter.category})</span>
        )}
      </div>

      {item.reports.some((r) => r.details) && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {item.reports.filter((r) => r.details).map((r) => (
            <li key={r.id} className="text-caption text-fg-muted">“{r.details}”</li>
          ))}
        </ul>
      )}

      {readOnly ? (
        <p className="mt-3 border-t border-line pt-3 text-caption text-fg-subtle">
          {{ removed: "Removed", suspended: "Author suspended", labelled: "Labelled as edited with AI" }[first.action] || "Reports dismissed"}
          {first.reviewedBy ? ` by @${first.reviewedBy}` : ""}{first.reviewedAt ? `, ${shortTime(first.reviewedAt)}` : ""}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {item.type !== "user" && target && (
            <Button size="sm" variant="danger" icon={Trash2} loading={busy === "remove"} disabled={!!busy} onClick={() => act("remove")}>
              Remove {T.label.toLowerCase()}
            </Button>
          )}
          {item.type === "post" && target && !target.aiGenerated && (
            <Button size="sm" icon={WandSparkles} loading={busy === "label"} disabled={!!busy} onClick={() => act("label")}>
              Label as edited with AI
            </Button>
          )}
          <Button size="sm" icon={Check} loading={busy === "keep"} disabled={!!busy} onClick={() => act("keep")}>
            {target === null ? "Close report" : "Dismiss reports"}
          </Button>
          {authorId && (
            <Button size="sm" icon={UserX} disabled={!!busy} onClick={() => setSuspending(true)}>Suspend author</Button>
          )}
        </div>
      )}

      {suspending && (
        <SuspendDialog uid={authorId} defaultReason={REPORT_LABEL[reasons[0]?.[0]] || ""} onClose={() => setSuspending(false)}
          onDone={async () => {
            setSuspending(false);
            await resolveReports(item.reports, "actioned", "suspended").catch(() => {});
            onDone();
          }} />
      )}
    </article>
  );
}

function SuspendDialog({ uid, defaultReason, onClose, onDone }) {
  const toast = useToast();
  const [length, setLength] = useState("7");
  const [reason, setReason] = useState(defaultReason ? `${defaultReason}, against the Community Guidelines.` : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (reason.trim().length < 5) return setError("State the reason in at least one sentence. The account holder will see it.");
    setBusy(true);
    try {
      const l = SUSPENSION_LENGTHS.find((x) => x.id === length);
      await suspendUser(uid, l.days, reason.trim());
      toast({ title: `Suspended ${l.days ? `for ${l.label}` : "permanently"}` });
      onDone();
    } catch (err) {
      console.error(err);
      setError("The account could not be suspended. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title="Suspend this account" onClose={busy ? undefined : onClose}
      footer={<div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" loading={busy} onClick={submit}>Suspend</Button>
      </div>}>
      <p className="mb-4 text-callout text-fg-muted">
        They can still sign in and read, but can't post, comment, message or create anything until it ends. They see the reason and how to appeal.
      </p>
      <fieldset className="mb-4">
        <legend className="mb-2 text-callout font-medium">Duration</legend>
        <div className="flex flex-wrap gap-2">
          {SUSPENSION_LENGTHS.map((l) => (
            <label key={l.id} className={`press inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-callout ${
              length === l.id ? "border-accent-text bg-accent-soft" : "border-line-strong"}`}>
              <input type="radio" name="suspend-length" value={l.id} checked={length === l.id} onChange={() => setLength(l.id)} className="sr-only" />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Reason (shown to the account holder)" error={error} count={reason.length} max={500}>
        <Textarea autoGrow rows={3} value={reason} maxLength={500} onChange={(e) => { setReason(e.target.value); setError(""); }} />
      </Field>
    </Dialog>
  );
}

function Suspensions() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchSuspensions()
      .then(async (items) => setList(await Promise.all(items.map(async (s) => ({ ...s, profile: await fetchProfile(s.id).catch(() => null) })))))
      .catch(() => setError("Suspensions could not be loaded."));
  }, []);

  const lift = async (s) => {
    try {
      await liftSuspension(s.id);
      setList((l) => l.filter((x) => x.id !== s.id));
      toast({ title: `Suspension lifted for @${s.profile?.username || "account"}` });
    } catch { toast({ tone: "error", title: "The suspension could not be lifted" }); }
  };

  if (error) return <InlineMessage>{error}</InlineMessage>;
  if (list === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!list.length) return <EmptyState icon={UserX} title="No active suspensions" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {list.map((s) => (
        <li key={s.id} className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => openUserProfile(s.id)} className="text-callout font-semibold hover:underline">
              @{s.profile?.username || "deleted account"}
            </button>
            <p className="mt-0.5 text-caption text-fg-muted">{s.reason}</p>
            <p className="mt-0.5 text-caption text-fg-subtle">
              {new Date(tsMillis(s.until)).getFullYear() > 9000 ? "Permanent" : `Until ${fullTime(s.until)}`}{s.by ? ` · by @${s.by}` : ""}
            </p>
          </div>
          <Button size="sm" icon={Undo2} onClick={() => lift(s)}>Lift suspension</Button>
        </li>
      ))}
    </ul>
  );
}

/** Flagged images from the sweep: hidden (explicit) or waiting for a decision (suggestive). */
function ImageReview({ sweep, setSweep, onRescan }) {
  const toast = useToast();
  const [revealed, setRevealed] = useState(new Set());
  const [busy, setBusy] = useState("");
  const update = (postId, patch) => setSweep((s) => ({ ...s, flagged: s.flagged.map((f) => (f.post.id === postId ? { ...f, ...patch } : f)) }));
  const drop = (postId) => setSweep((s) => ({ ...s, flagged: s.flagged.filter((f) => f.post.id !== postId) }));
  const act = async (key, fn, message) => {
    setBusy(key);
    try { await fn(); if (message) toast({ title: message }); }
    catch { toast({ tone: "error", title: "That didn't work. Try again." }); }
    finally { setBusy(""); }
  };

  return (
    <section className="space-y-4">
      <p className="text-caption text-fg-muted">
        Every photo and video is checked for nudity and sexual content on the uploader's device before it posts. This sweep
        rechecks recent public posts for anything that got through, such as posts from before the check or from a modified app.
        Clearly explicit images are hidden straight away; borderline and suggestive ones wait for your decision.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" icon={ImageIcon} loading={sweep.status === "running"} onClick={onRescan}>Scan again</Button>
        <p className="text-caption text-fg-subtle" role="status">
          {sweep.status === "running" ? (sweep.total ? `Checked ${sweep.done} of ${sweep.total} images…` : "Loading recent posts…")
            : sweep.status === "error" ? "The scan couldn't finish. Try again."
            : sweep.status === "done" ? `${sweep.total} images checked. ${sweep.flagged.length ? `${sweep.flagged.length} flagged.` : "Nothing flagged."}` : ""}
        </p>
      </div>
      {sweep.status === "done" && sweep.flagged.length === 0 && (
        <EmptyState compact icon={ShieldCheck} title="No flagged images" body="Recent public posts passed the image check." />
      )}
      <ul className="space-y-3">
        {sweep.flagged.map(({ post, url, verdict, hidden }) => (
          <li key={post.id} className="flex gap-3 rounded-card border border-line bg-surface p-3">
            <button type="button" onClick={() => setRevealed((r) => new Set(r).add(post.id))}
              aria-label={revealed.has(post.id) ? "Flagged image" : "Show the flagged image"}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-control bg-surface-2">
              <MediaImg src={url} alt="" className={`h-full w-full object-cover ${revealed.has(post.id) ? "" : "scale-110 blur-xl"}`} placeholderClass="h-full w-full" />
              {!revealed.has(post.id) && <span className="absolute inset-0 flex items-center justify-center text-label font-semibold text-white">Tap to show</span>}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={verdict === "explicit" ? "danger" : "warning"}>{verdict === "explicit" ? "Explicit" : "Suggestive"}</Badge>
                {hidden && <Badge icon={EyeOff}>Hidden</Badge>}
              </div>
              <p className="mt-1 truncate text-callout">
                <button type="button" className="font-semibold hover:underline" onClick={() => openUserProfile(post.authorId)}>@{post.authorName}</button>
                <span className="text-fg-subtle"> · {shortTime(post.createdAt)}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => openPost(post.id)}>Open post</Button>
                <Button size="sm" icon={Trash2} loading={busy === `del-${post.id}`}
                  onClick={() => act(`del-${post.id}`, async () => { await deletePost(post); drop(post.id); }, "Post deleted")}>Delete post</Button>
                {hidden ? (
                  <Button size="sm" icon={Eye} loading={busy === `show-${post.id}`}
                    onClick={() => act(`show-${post.id}`, async () => { await setPostHidden(post.id, false); markImageOk(url); drop(post.id); }, "Post restored")}>Restore</Button>
                ) : (
                  <>
                    <Button size="sm" icon={EyeOff} loading={busy === `hide-${post.id}`}
                      onClick={() => act(`hide-${post.id}`, async () => { await setPostHidden(post.id, true); update(post.id, { hidden: true }); }, "Post hidden")}>Hide</Button>
                    <Button size="sm" variant="ghost" icon={Check} loading={busy === `ok-${post.id}`}
                      onClick={() => act(`ok-${post.id}`, async () => { await setPostHidden(post.id, false); markImageOk(url); drop(post.id); })}>Not a problem</Button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Verified() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetchVerified().then((l) => setList(l.sort((a, b) => a.username.localeCompare(b.username)))).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    const name = handle.trim().replace(/^@/, "").toLowerCase();
    setBusy(true);
    setError("");
    try {
      const uid = await uidForUsername(name);
      if (!uid) throw new Error(`No account has the handle @${name}.`);
      await setBadge(uid, "verified", true);
      toast({ title: `@${name} is verified`, body: "A purple tick now shows beside their name." });
      setHandle("");
      load();
    } catch (err) { setError(err?.code === "permission-denied" ? "Only admins and moderators can verify accounts." : err.message); }
    finally { setBusy(false); }
  };
  const remove = async (p) => {
    try {
      await setBadge(p.id, "verified", false);
      setList((l) => l.filter((x) => x.id !== p.id));
      toast({ title: `Verification removed from @${p.username}` });
    } catch { toast({ tone: "error", title: "The verification could not be removed" }); }
  };
  return (
    <section className="space-y-4">
      <p className="text-caption text-fg-muted">
        Verify accounts whose identity you have confirmed, such as public figures, organisations and creators people may impersonate. Verified accounts show a purple tick beside their name on their profile, posts, comments and in search. Journalists show the tick automatically.
      </p>
      <form onSubmit={add} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="verify-handle" className="sr-only">Handle</label>
          <input id="verify-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle"
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
          <InlineMessage>{error}</InlineMessage>
        </div>
        <Button type="submit" variant="primary" icon={BadgeCheck} loading={busy} disabled={handle.trim().length < 3}>Verify</Button>
      </form>
      {list === null ? <Skeleton className="h-24 !rounded-card" /> : list.length === 0 ? (
        <EmptyState compact icon={BadgeCheck} title="No verified accounts yet" body="Verify an account by its handle, or from the menu on their profile." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-3 px-4">
              <button type="button" onClick={() => openUserProfile(p.id)} className="min-w-0 flex-1 truncate text-left text-callout hover:underline">
                {p.name || p.username} <span className="text-fg-subtle">@{p.username}</span>
              </button>
              <Button size="sm" variant="ghost" onClick={() => remove(p)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** People whose words the hate filter blocked, asking a person to look again. */
function Appeals() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    let live = true;
    fetchAppeals("open").then((l) => { if (live) setList(l); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, []);

  const decide = async (a, outcome) => {
    setBusy(a.id);
    try {
      await decideAppeal(a, outcome, notes[a.id] || "");
      setList((l) => l.filter((x) => x.id !== a.id));
      toast({ title: outcome === "overturned" ? `@${a.username} can post it now` : "The block stays", body: "They've been told." });
    } catch { toast({ tone: "error", title: "The decision couldn't be saved" }); }
    finally { setBusy(null); }
  };

  if (list === null) return <Skeleton className="h-32 !rounded-card" />;
  if (!list.length) return <EmptyState icon={Scale} title="No appeals waiting" body="When someone appeals a block, it shows here for a person to decide." />;
  return (
    <section className="space-y-4">
      <p className="text-caption text-fg-muted">
        Judge the words, not the person. Allow quoting to call something out, reporting, and reclaimed use about oneself.
        Keep the block for attacks on people for who they are. Overturning lets them post exactly this text.
      </p>
      <ul className="space-y-3">
        {list.map((a) => (
          <li key={a.id} className="rounded-card border border-line bg-surface p-4">
            <p className="flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
              <button type="button" onClick={() => openUserProfile(a.uid)} className="font-semibold text-fg hover:underline">@{a.username}</button>
              <span>· {a.where}</span><span>· {shortTime(a.createdAt)}</span>
              <Badge>{RULE_NAMES[a.rule] || a.rule}</Badge>
            </p>
            <blockquote className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-control bg-surface-2 p-3 text-callout [overflow-wrap:anywhere]">{a.text}</blockquote>
            {a.note && <p className="mt-2 text-callout"><span className="font-semibold">Their reason:</span> {a.note}</p>}
            <label htmlFor={`appeal-${a.id}`} className="sr-only">Note for your decision</label>
            <input id={`appeal-${a.id}`} value={notes[a.id] || ""} maxLength={500} placeholder="Note for the record (optional)"
              onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
              className="field mt-3 min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button size="sm" disabled={busy === a.id} onClick={() => decide(a, "upheld")}>Keep the block</Button>
              <Button size="sm" variant="primary" icon={Check} loading={busy === a.id} onClick={() => decide(a, "overturned")}>Allow it</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Staff appoint moderator accounts, which can do everything admins can except give the pink check. */
function Moderators() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetchModerators().then((l) => setList(l.sort((a, b) => a.username.localeCompare(b.username)))).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    const username = handle.trim().replace(/^@/, "").toLowerCase();
    setBusy(true);
    setError("");
    try {
      const uid = await uidForUsername(username);
      if (!uid) throw new Error(`There's no account called @${username}.`);
      await addModerator({ uid, username });
      toast({ title: `@${username} is now a moderator`, body: "Mesh opens on the moderation queue for them." });
      setHandle("");
      load();
    } catch (err) { setError(err?.code === "permission-denied" ? "Only admins and moderators can add moderators." : err.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4">
      <p className="text-caption text-fg-muted">
        Moderators can do everything admins can: review reports, suspend accounts, remove content, give checks, add journalists,
        review news and appoint other moderators. Only the founder gives the pink check. Mesh opens on this page for them, and they
        can't create posts.
      </p>
      <form onSubmit={add} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="mod-handle" className="sr-only">Handle</label>
          <input id="mod-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle"
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
          <InlineMessage>{error}</InlineMessage>
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={handle.trim().length < 3}>Add moderator</Button>
      </form>
      {list === null ? <Skeleton className="h-24 !rounded-card" /> : list.length === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="No moderators yet" body="Add someone you trust by their handle." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((m) => (
            <li key={m.id} className="flex min-h-12 items-center gap-3 px-4">
              <button type="button" onClick={() => openUserProfile(m.id)} className="min-w-0 flex-1 truncate text-left text-callout hover:underline">@{m.username}</button>
              <span className="text-caption text-fg-subtle">since {shortTime(m.addedAt)}</span>
              <Button size="sm" variant="ghost" onClick={async () => {
                try { await removeModerator(m.id); setList((l) => l.filter((x) => x.id !== m.id)); toast({ title: `@${m.username} is no longer a moderator` }); }
                catch { toast({ tone: "error", title: "The moderator could not be removed" }); }
              }}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Writers() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetchWriters().then((l) => setList(l.sort((a, b) => a.username.localeCompare(b.username)))).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const w = await addWriter(handle.trim().replace(/^@/, "").toLowerCase());
      toast({ title: `@${w.username} has been added as a journalist`, body: "They can now publish on Mesh News." });
      setHandle("");
      load();
    } catch (err) { setError(err?.code === "permission-denied" ? "Only admins and moderators can add journalists." : err.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4">
      <p className="text-caption text-fg-muted">
        Add journalists whose identity you have verified. Journalists publish their own stories on Mesh News under their name and byline, without review. Each story must cite at least two sources, and readers can request corrections.
      </p>
      <form onSubmit={add} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="writer-handle" className="sr-only">Handle</label>
          <input id="writer-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle"
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
          <InlineMessage>{error}</InlineMessage>
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={handle.trim().length < 3}>Add journalist</Button>
      </form>
      {list === null ? <Skeleton className="h-24 !rounded-card" /> : list.length === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="No journalists yet" body="Add a verified journalist by their handle." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((w) => (
            <li key={w.id} className="flex min-h-12 items-center gap-3 px-4">
              <span className="min-w-0 flex-1 truncate text-callout">@{w.username}</span>
              <span className="text-caption text-fg-subtle">since {shortTime(w.addedAt)}</span>
              <Button size="sm" variant="ghost" onClick={async () => {
                try { await removeWriter(w.id); setList((l) => l.filter((x) => x.id !== w.id)); toast({ title: `@${w.username} has been removed as a journalist` }); }
                catch { toast({ tone: "error", title: "The journalist could not be removed" }); }
              }}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
