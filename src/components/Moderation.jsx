import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, BadgeCheck, Trash2, Check, Eye, EyeOff, ImageIcon, UserX, FileText, MessageCircle, Mail, UserRound, ExternalLink, Undo2, Gavel, WandSparkles, Scale,
} from "lucide-react";
import {
  staffAccess, TEAMS, setModeratorTeams, fetchAppeals, decideAppeal, fetchModerators, addModerator, removeModerator, fetchReports, resolveReports, clearPost, labelPostAi, removeComment, removeMessage, deletePost, fetchPost, fetchProfile,
  suspendUser, liftSuspension, setPostGraphic, fetchSuspensions, openPost, openUserProfile, REPORT_LABEL, SUSPENSION_LENGTHS, tsMillis,
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
import JournalistApplications from "./JournalistApplications";

const TYPE = {
  post: { label: "Post", icon: FileText },
  comment: { label: "Comment", icon: MessageCircle },
  message: { label: "Message", icon: Mail },
  user: { label: "Account", icon: UserRound },
};

// Each staff member sees their own teams' work (firestore.rules, onTeam):
// news (applications, journalists), content (post and comment reports,
// appeals, images, bans) and accounts (message and profile reports, bans,
// verification). Admins see everything and manage staff. Reports are grouped
// per target, busiest first; decisions are recorded on each report.
export default function Moderation() {
  // { admin, teams }; undefined while checking, null if not staff.
  const [access, setAccess] = useState(undefined);
  const [tab, setTab] = useState(null);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    staffAccess().then((a) => setAccess(a || null)).catch(() => setAccess(null));
  }, []);
  const on = useCallback((team) => !!access?.teams.includes(team), [access]);
  const admin = access === undefined ? null : !!access;
  const handlesReports = !!access && (access.admin || on("content") || on("accounts"));
  // Which kinds of report this person sees; null is all of them (admins).
  const reportTypes = useMemo(() => (access?.admin ? null
    : [...(on("content") ? ["post", "comment"] : []), ...(on("accounts") ? ["message", "user"] : [])]), [access, on]);
  const tabs = useMemo(() => (access ? [
    handlesReports && { id: "open", label: "Reports" },
    on("content") && { id: "appeals", label: "Appeals" },
    on("news") && { id: "applications", label: "Applications" },
    on("news") && { id: "writers", label: "Journalists" },
    on("content") && { id: "images", label: "Images" },
    (on("content") || on("accounts")) && { id: "suspended", label: "Bans" },
    on("accounts") && { id: "verified", label: "Verified" },
    handlesReports && { id: "closed", label: "Resolved" },
    access.admin && { id: "mods", label: "Staff" },
  ].filter(Boolean) : []), [access, on, handlesReports]);
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

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
  useEffect(() => { if (on("content")) (async () => { await runSweep(); })(); }, [on, runSweep]);

  const load = useCallback(async () => {
    setError(false);
    setReports(null);
    if (current !== "open" && current !== "closed") return setReports([]);
    if (reportTypes?.length === 0) return setReports([]);
    try {
      const get = (status) => fetchReports(status, reportTypes);
      setReports(current === "open" ? await get("open") : [...await get("actioned"), ...await get("dismissed")]);
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, [current, reportTypes]);
  useEffect(() => { if (admin) (async () => { await load(); })(); }, [admin, load]);

  const cases = useMemo(() => {
    const byTarget = new Map();
    for (const r of reports || []) {
      const key = `${r.targetType}_${r.targetId}`;
      if (!byTarget.has(key)) byTarget.set(key, { key, type: r.targetType, targetId: r.targetId, reports: [] });
      byTarget.get(key).reports.push(r);
    }
    const urgent = (c) => (c.reports.some((r) => r.reason === "child_safety") ? 1 : 0);
    return [...byTarget.values()].sort((a, b) =>
      urgent(b) - urgent(a) || b.reports.length - a.reports.length || tsMillis(b.reports[0].createdAt) - tsMillis(a.reports[0].createdAt));
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
              <Tabs label="Moderation" value={current} onChange={setTab} variant="underline"
                tabs={tabs.map((t) => (t.id === "images" && sweep.flagged.length ? { ...t, label: `Images (${sweep.flagged.length})` } : t))} />

              {current === "images" ? <ImageReview sweep={sweep} setSweep={setSweep} onRescan={runSweep} />
                : current === "appeals" ? <Appeals />
                : current === "applications" ? <JournalistApplications />
                : current === "mods" ? <Moderators /> : current === "writers" ? <Writers /> : current === "verified" ? <Verified /> : current === "suspended" ? <Suspensions /> : (
                <>
                  {error && <ErrorState title="Reports could not be loaded" onRetry={load} />}
                  {!error && reports === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>}
                  {reports?.length === 0 && (
                    <EmptyState icon={ShieldCheck} title={current === "open" ? "No open reports" : "No resolved reports"} />
                  )}
                  <ul className="space-y-4">
                    {cases.map((c) => <li key={c.key}><Case item={c} readOnly={current !== "open"} onDone={() => done(c.key)} /></li>)}
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
      } else if (kind === "graphic") {
        await setPostGraphic(item.targetId, true);
        await resolveReports(item.reports, "actioned", "graphic warning");
        toast({ title: "Graphic warning added" });
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
        {reasons.map(([id, n]) => <Badge key={id} tone={id === "hate" || id === "violence" || id === "child_safety" ? "danger" : "neutral"}>{REPORT_LABEL[id] || id}{n > 1 ? ` × ${n}` : ""}</Badge>)}
        <span className="ml-auto text-caption text-fg-subtle" title={fullTime(first.createdAt)}>{shortTime(first.createdAt)}</span>
      </div>
      {reasons.some(([id]) => id === "child_safety") && (
        <div role="alert" className="mt-3 rounded-control border border-danger-text/40 bg-danger/10 p-3 text-callout text-danger-text">
          <p className="font-semibold">Child safety: deal with this first.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-caption">
            <li>Don&apos;t download, screenshot, forward or share it, even to report it.</li>
            <li>If it is sexual content involving a child, remove it and suspend the account permanently.</li>
            <li>Report it to the ACCCE at accce.gov.au/report, with the account&apos;s handle and when it was posted. If a child is in danger now, call 000.</li>
          </ul>
        </div>
      )}

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
          {item.type === "post" && target && !target.graphic && (
            <Button size="sm" icon={EyeOff} loading={busy === "graphic"} disabled={!!busy} onClick={() => act("graphic")}>
              Add graphic warning
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
  if (!list.length) return <EmptyState icon={Scale} title="No appeals waiting" />;
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
// Admins only: who's on staff and which teams they're on.
function Moderators() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [handle, setHandle] = useState("");
  const [teams, setTeams] = useState(["content"]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetchModerators().then((l) => setList(l.sort((a, b) => a.username.localeCompare(b.username)))).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const toggle = (list, id) => (list.includes(id) ? list.filter((t) => t !== id) : [...list, id]);
  const add = async (e) => {
    e.preventDefault();
    const username = handle.trim().replace(/^@/, "").toLowerCase();
    setBusy(true);
    setError("");
    try {
      const uid = await uidForUsername(username);
      if (!uid) throw new Error(`There's no account called @${username}.`);
      await addModerator({ uid, username, teams });
      toast({ title: `@${username} is on staff` });
      setHandle("");
      load();
    } catch (err) { setError(err?.code === "permission-denied" ? "Only admins can add staff." : err.message); }
    finally { setBusy(false); }
  };
  const changeTeams = async (m, next) => {
    if (!next.length) return;
    setList((l) => l.map((x) => (x.id === m.id ? { ...x, teams: next } : x)));
    try { await setModeratorTeams(m.id, next); }
    catch { toast({ tone: "error", title: "Couldn't change that" }); load(); }
  };
  const TeamChips = ({ value, onChange }) => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Teams">
      {TEAMS.map((t) => {
        const onIt = value.includes(t.id);
        return (
          <button key={t.id} type="button" aria-pressed={onIt} title={t.body} onClick={() => onChange(toggle(value, t.id))}
            className={`press min-h-8 rounded-full px-3 text-caption font-semibold ${onIt ? "bg-accent text-white" : "bg-surface-2 text-fg-muted"}`}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
  return (
    <section className="space-y-4">
      <ul className="space-y-1.5 text-caption text-fg-muted">
        {TEAMS.map((t) => <li key={t.id}><strong className="font-semibold text-fg">{t.label}:</strong> {t.body}</li>)}
      </ul>
      <form onSubmit={add} className="space-y-2 rounded-card border border-line bg-surface p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="mod-handle" className="sr-only">Handle</label>
            <input id="mod-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle"
              className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
            <InlineMessage>{error}</InlineMessage>
          </div>
          <Button type="submit" variant="primary" loading={busy} disabled={handle.trim().length < 3 || !teams.length}>Add</Button>
        </div>
        <TeamChips value={teams} onChange={setTeams} />
      </form>
      {list === null ? <Skeleton className="h-24 !rounded-card" /> : list.length === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="No staff yet" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((m) => (
            <li key={m.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openUserProfile(m.id)} className="min-w-0 flex-1 truncate text-left text-callout font-medium hover:underline">@{m.username}</button>
                <span className="text-caption text-fg-subtle">since {shortTime(m.addedAt)}</span>
                <Button size="sm" variant="ghost" onClick={async () => {
                  try { await removeModerator(m.id); setList((l) => l.filter((x) => x.id !== m.id)); toast({ title: `@${m.username} is off staff` }); }
                  catch { toast({ tone: "error", title: "Couldn't remove them" }); }
                }}>Remove</Button>
              </div>
              <TeamChips value={m.teams || TEAMS.map((t) => t.id)} onChange={(next) => changeTeams(m, next)} />
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
  const [method, setMethod] = useState("video call");
  const [evidence, setEvidence] = useState("");
  const [outlet, setOutlet] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetchWriters().then((l) => setList(l.sort((a, b) => a.username.localeCompare(b.username)))).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const ready = handle.trim().length >= 3 && evidence.trim().length >= 5 && confirmed;
  const add = async (e) => {
    e.preventDefault();
    if (!ready) return setError("Fill in how you checked them, and confirm you've seen their ID.");
    setBusy(true);
    setError("");
    try {
      const w = await addWriter(handle.trim().replace(/^@/, "").toLowerCase(), { method, evidence, outlet });
      setEvidence(""); setOutlet(""); setConfirmed(false);
      toast({ title: `@${w.username} has been added as a journalist`, body: "They can publish once they've accepted the journalist agreement." });
      setHandle("");
      load();
    } catch (err) { setError(err?.code === "permission-denied" ? "Only admins and moderators can add journalists." : err.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4">
      <div className="space-y-2 text-caption text-fg-muted">
        <p>Journalists publish their own stories on Mesh under their name, without review, and answer for them. Before adding someone, check two things:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><span className="font-semibold text-fg">Who they are:</span> see photo ID matching their name, in person or on a video call. Don't keep a copy of the ID.</li>
          <li><span className="font-semibold text-fg">That they're a journalist:</span> published work under that name, an editor at their outlet confirming them, or a press or union card.</li>
        </ol>
        <p>They'll accept the journalist agreement themselves before their first story. The record below is private to staff.</p>
      </div>
      <form onSubmit={add} className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div>
          <label htmlFor="writer-handle" className="mb-1 block text-callout font-medium">Their handle</label>
          <input id="writer-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle"
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
        </div>
        <div>
          <label htmlFor="writer-method" className="mb-1 block text-callout font-medium">How you saw their ID</label>
          <select id="writer-method" value={method} onChange={(e) => setMethod(e.target.value)}
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg">
            <option value="video call">On a video call</option>
            <option value="in person">In person</option>
            <option value="id document">A copy they sent, since deleted</option>
          </select>
        </div>
        <div>
          <label htmlFor="writer-evidence" className="mb-1 block text-callout font-medium">Proof they're a journalist</label>
          <input id="writer-evidence" value={evidence} maxLength={500} onChange={(e) => setEvidence(e.target.value)}
            placeholder="A link to their published work, or who confirmed them"
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
        </div>
        <div>
          <label htmlFor="writer-outlet" className="mb-1 block text-callout font-medium">Outlet <span className="font-normal text-fg-subtle">(blank if independent)</span></label>
          <input id="writer-outlet" value={outlet} maxLength={80} onChange={(e) => setOutlet(e.target.value)}
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
        </div>
        <label className="flex items-start gap-2 text-callout">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-violet-600" />
          I've seen photo ID matching their name, and checked they work as a journalist.
        </label>
        <InlineMessage>{error}</InlineMessage>
        <Button type="submit" variant="primary" loading={busy} disabled={!ready}>Add journalist</Button>
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
