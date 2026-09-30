import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Trash2, Check, UserX, FileText, MessageCircle, Mail, UserRound, ExternalLink, Undo2, Gavel,
} from "lucide-react";
import {
  isAdmin, fetchReports, resolveReports, clearPost, removeComment, removeMessage, deletePost, fetchPost, fetchProfile,
  suspendUser, liftSuspension, fetchSuspensions, openPost, openUserProfile, REPORT_LABEL, SUSPENSION_LENGTHS, tsMillis,
  fetchWriters, addWriter, removeWriter,
} from "../lib/db";
import { assessText } from "../lib/moderation";
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
  const [admin, setAdmin] = useState(null);
  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => { isAdmin().then(setAdmin).catch(() => setAdmin(false)); }, []);

  const load = useCallback(async () => {
    setError(false);
    setReports(null);
    try {
      setReports(tab === "suspended" || tab === "writers" ? [] : await fetchReports(tab === "open" ? "open" : "actioned")
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
            <EmptyState icon={ShieldCheck} title="Moderators only"
              body="This page is for Mesh's moderators. To report something, use Report on the post, comment, message or profile." />
          )}

          {admin && (
            <>
              <p className="flex gap-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
                <Gavel size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Decide by the <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => navigate("/legal/guidelines")}>Community Guidelines</button>,
                  the same way whichever group is targeted and whichever side is speaking. Criticism of ideas, religions, countries and
                  governments stays up. Attacks on people for who they are come down.
                </span>
              </p>
              <Tabs label="Reports" value={tab} onChange={setTab} variant="underline"
                tabs={[{ id: "open", label: "Open" }, { id: "closed", label: "Decided" }, { id: "suspended", label: "Suspended accounts" }, { id: "writers", label: "News writers" }]} />

              {tab === "writers" ? <Writers /> : tab === "suspended" ? <Suspensions /> : (
                <>
                  {error && <ErrorState title="Couldn't load reports" onRetry={load} />}
                  {!error && reports === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>}
                  {reports?.length === 0 && (
                    <EmptyState icon={ShieldCheck} title={tab === "open" ? "Nothing waiting" : "No decisions yet"}
                      body={tab === "open" ? "New reports appear here." : "Decided reports appear here, with who decided and what was done."} />
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
        toast({ title: `${T.label} removed` });
      } else {
        if (item.type === "post" && target) await clearPost(item.targetId);
        await resolveReports(item.reports, "dismissed", "kept");
        toast({ title: "Kept up", body: item.type === "post" ? "Reports won't hold it back again." : undefined });
      }
      onDone();
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: "Couldn't do that", body: "Check that your account is in the admins collection." });
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
        {target === null && <p className="text-callout text-fg-muted">It's already gone (deleted by its author or another moderator).</p>}
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
              : <p className="text-callout italic text-fg-muted">{item.type === "message" ? "A voice message, GIF or shared post (moderators can't open these)" : "No text"}</p>}
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
          <span>The automatic filter rates this <strong className="text-warning-text">{filter.level}</strong> ({filter.category})</span>
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
          {first.action === "removed" ? "Removed" : first.action === "suspended" ? "Author suspended" : "Kept up"}
          {first.reviewedBy ? ` by @${first.reviewedBy}` : ""}{first.reviewedAt ? `, ${shortTime(first.reviewedAt)}` : ""}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {item.type !== "user" && target && (
            <Button size="sm" variant="danger" icon={Trash2} loading={busy === "remove"} disabled={!!busy} onClick={() => act("remove")}>
              Remove {T.label.toLowerCase()}
            </Button>
          )}
          <Button size="sm" icon={Check} loading={busy === "keep"} disabled={!!busy} onClick={() => act("keep")}>
            {target === null ? "Close" : "Keep it up"}
          </Button>
          {authorId && (
            <Button size="sm" icon={UserX} disabled={!!busy} onClick={() => setSuspending(true)}>Suspend the author</Button>
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
    if (reason.trim().length < 5) return setError("Say why, in a sentence. The person sees this.");
    setBusy(true);
    try {
      const l = SUSPENSION_LENGTHS.find((x) => x.id === length);
      await suspendUser(uid, l.days, reason.trim());
      toast({ title: `Suspended ${l.days ? `for ${l.label}` : "permanently"}` });
      onDone();
    } catch (err) {
      console.error(err);
      setError("Couldn't suspend the account.");
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
        <legend className="mb-2 text-callout font-medium">For how long?</legend>
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
      <Field label="Reason (they'll see this)" error={error} count={reason.length} max={500}>
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
      .catch(() => setError("Couldn't load suspensions."));
  }, []);

  const lift = async (s) => {
    try {
      await liftSuspension(s.id);
      setList((l) => l.filter((x) => x.id !== s.id));
      toast({ title: `Lifted @${s.profile?.username || "account"}'s suspension` });
    } catch { toast({ tone: "error", title: "Couldn't lift it" }); }
  };

  if (error) return <InlineMessage>{error}</InlineMessage>;
  if (list === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!list.length) return <EmptyState icon={UserX} title="No one is suspended" />;
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
          <Button size="sm" icon={Undo2} onClick={() => lift(s)}>Lift</Button>
        </li>
      ))}
    </ul>
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
      toast({ title: `@${w.username} can now write for Mesh News` });
      setHandle("");
      load();
    } catch (err) { setError(err?.code === "permission-denied" ? "Only admins can add writers." : err.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4">
      <p className="text-caption text-fg-muted">
        Writers can start, co-write and send stories for review. Every story still needs a reviewer to check it against its sources before it's published.
      </p>
      <form onSubmit={add} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="writer-handle" className="sr-only">Handle</label>
          <input id="writer-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle"
            className="field min-h-11 w-full rounded-control border border-field bg-surface-2 px-3 text-callout text-fg placeholder:text-fg-subtle" />
          <InlineMessage>{error}</InlineMessage>
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={handle.trim().length < 3}>Add writer</Button>
      </form>
      {list === null ? <Skeleton className="h-24 !rounded-card" /> : list.length === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="No writers yet" body="Add someone by their handle." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((w) => (
            <li key={w.id} className="flex min-h-12 items-center gap-3 px-4">
              <span className="min-w-0 flex-1 truncate text-callout">@{w.username}</span>
              <span className="text-caption text-fg-subtle">since {shortTime(w.addedAt)}</span>
              <Button size="sm" variant="ghost" onClick={async () => {
                try { await removeWriter(w.id); setList((l) => l.filter((x) => x.id !== w.id)); toast({ title: `@${w.username} is no longer a writer` }); }
                catch { toast({ tone: "error", title: "Couldn't remove them" }); }
              }}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
