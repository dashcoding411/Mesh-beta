import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, MapPin, Ticket, ExternalLink, Globe, Lock, Users, Check, Heart, Trash2, UserPlus, Pencil,
  CalendarX2, Megaphone, MessageSquare, X, Search as SearchIcon, Blend,
} from "lucide-react";
import {
  fetchEvent, fetchMyRsvps, setRsvp, RSVP_OPTIONS, fetchGuestList, fetchEventPosts, addEventPost,
  deleteEventPost, toggleEventPostLike, fetchAnnouncements, updateEvent, deleteEvent, inviteToEvent,
  uninviteFromEvent, searchUsers, canPostInEvent, isEventFull, fetchGroupById, openUserProfile, me,
} from "../lib/db";
import { validateText } from "../lib/validate";
import { checkContent } from "../lib/moderation";
import { goBack, navigate } from "../lib/router";
import { shortTime, fullTime, isoTime, plural } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Badge from "./ui/Badge";
import Avatar from "./ui/Avatar";
import RichText from "./ui/RichText";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { Input, Textarea } from "./ui/Field";
import { EmptyState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";
import { usePageTitle } from "../lib/usePageTitle";
import { DateBlock, GatheringForm } from "./Events";

const STATUS_LABEL = { going: "Going", interested: "Interested", maybe: "Maybe", cant: "Can't go" };

/* One gathering: when and where, your reply, the discussion, and who's
   coming. What you can see and do here is exactly what the rules allow:
   private gatherings are for the host, invited people and (in a circle)
   members; a full gathering closes Going; the host decides who posts. */
export default function GatheringPage({ eventId }) {
  const toast = useToast();
  const [event, setEvent] = useState(undefined);
  usePageTitle(event?.title || null, 1);
  const [circle, setCircle] = useState(null);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("discussion");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // edit | invite | delete

  const load = useCallback(async () => {
    const ev = await fetchEvent(eventId).catch(() => null);
    setEvent(ev);
    if (!ev) return;
    fetchMyRsvps([ev.id]).then((m) => setStatus(m.get(ev.id) || null)).catch(() => {});
    if (ev.groupId) fetchGroupById(ev.groupId).then(setCircle).catch(() => {});
  }, [eventId]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (event === undefined) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto" role="status" aria-label="Loading gathering">
        <div className="mx-auto max-w-3xl space-y-4 px-4 pt-6 md:px-6">
          <Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-40 !rounded-card" />
        </div>
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState icon={CalendarX2} title="This gathering isn't available"
          body="It may have been cancelled, or it's private and you haven't been invited."
          action={<Button onClick={() => goBack("/circles?view=gatherings")}>Back to gatherings</Button>} />
      </div>
    );
  }

  const date = event.startsAt?.toDate ? event.startsAt.toDate() : null;
  const past = date && date < new Date();
  const isHost = event.hostId === me();
  const full = isEventFull(event);
  const options = RSVP_OPTIONS[event.privacy === "private" ? "private" : "public"];

  const reply = async (next) => {
    if (busy) return;
    if (next === "going" && full && status !== "going") {
      return toast({ tone: "info", title: "This gathering is full", body: "Going is closed. You can still reply Interested or Maybe." });
    }
    setBusy(true);
    const prev = status;
    try {
      const result = await setRsvp(event, prev, next);
      setStatus(result);
      const change = (s, d) => (s === "going" ? { goingCount: (event.goingCount || 0) + d } : s === "interested" ? { interestedCount: (event.interestedCount || 0) + d } : {});
      setEvent((e) => ({ ...e, ...(prev ? change(prev, -1) : {}), ...(result ? change(result, 1) : {}) }));
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: err?.code === "permission-denied" ? "That reply wasn't accepted" : "Couldn't save your reply",
        body: err?.code === "permission-denied" ? "The gathering may have just filled up." : "Check your connection and try again." });
      load();
    } finally { setBusy(false); }
  };

  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack(event.groupId ? `/circles/${event.groupId}` : "/circles?view=gatherings")} />
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{event.title}</p>
        {isHost && <IconButton icon={Pencil} label="Edit gathering" onClick={() => setDialog("edit")} />}
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 md:px-6">
        <div className="flex gap-4">
          <DateBlock date={date} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-callout font-semibold text-accent-text">
              {date ? date.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "Date to be confirmed"}
            </p>
            <h1 className="mt-1 font-display text-title-1">{event.title}</h1>
            {event.location && <p className="mt-1 flex items-center gap-1.5 text-callout text-fg-muted"><MapPin size={15} aria-hidden="true" />{event.location}</p>}
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          <li><Badge tone={event.privacy === "private" ? "warning" : "neutral"} icon={event.privacy === "private" ? Lock : Globe}>{event.privacy === "private" ? "Private" : "Public"}</Badge></li>
          <li><Badge icon={Users}>{event.capacity ? `${event.goingCount || 0} of ${event.capacity} going` : `${event.goingCount || 0} going`}</Badge></li>
          {event.privacy !== "private" && (event.interestedCount || 0) > 0 && <li><Badge>{event.interestedCount} interested</Badge></li>}
          {full && !past && <li><Badge tone="danger">Full</Badge></li>}
          {past && <li><Badge>Past</Badge></li>}
          {event.guestPosting === "host" && <li><Badge icon={Megaphone}>Host posts only</Badge></li>}
        </ul>

        <p className="mt-3 text-caption text-fg-subtle">
          Hosted by{" "}
          <button type="button" onClick={() => openUserProfile(event.hostId)} className="font-semibold text-fg-muted hover:underline">
            {isHost ? "you" : `@${event.hostName}`}
          </button>
          {circle && <> in <button type="button" onClick={() => navigate(`/circles/${circle.id}`)} className="inline-flex items-center gap-1 font-semibold text-fg-muted hover:underline"><Blend size={12} aria-hidden="true" />{circle.name}</button></>}
        </p>

        {event.description && <RichText text={event.description} className="mt-4 text-body text-fg" />}

        {!past && (
          <div className="mt-5 rounded-card border border-line bg-surface p-4">
            <p className="mb-3 text-callout font-semibold">{isHost ? "You're hosting" : status ? `You replied ${STATUS_LABEL[status]}` : "Are you going?"}</p>
            {!isHost && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Your reply">
                {options.map((o) => {
                  const closed = o.id === "going" && full && status !== "going";
                  return (
                    <Button key={o.id} size="sm" variant={status === o.id ? "primary" : "secondary"} disabled={busy}
                      icon={status === o.id ? Check : undefined} aria-pressed={status === o.id}
                      aria-disabled={closed || undefined} className={closed ? "opacity-50" : ""}
                      onClick={() => reply(o.id)}>
                      {closed ? "Going (full)" : o.label}
                    </Button>
                  );
                })}
              </div>
            )}
            {status && !isHost && <p className="mt-2 text-caption text-fg-subtle">Tap your reply again to take it back.</p>}
            {isHost && (
              <div className="flex flex-wrap gap-2">
                {event.privacy === "private" && <Button size="sm" icon={UserPlus} onClick={() => setDialog("invite")}>Invite people</Button>}
                <Button size="sm" icon={Pencil} onClick={() => setDialog("edit")}>Edit</Button>
                <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDialog("delete")}>Cancel gathering</Button>
              </div>
            )}
          </div>
        )}

        {event.ticketUrl && (
          <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer nofollow ugc"
            className="press mt-4 inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong px-4 text-callout font-semibold text-accent-text hover:bg-surface-2">
            <Ticket size={16} aria-hidden="true" /> Get tickets <ExternalLink size={13} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}

        <Tabs variant="underline" label="Gathering" value={tab} onChange={setTab} className="mt-6"
          tabs={[{ id: "discussion", label: "Discussion" }, { id: "guests", label: "Guests" }]} />
        <div role="tabpanel" className="pt-5">
          {tab === "discussion"
            ? <Discussion event={event} status={status} />
            : <Guests event={event} isHost={isHost} status={status} />}
        </div>
      </div>

      {dialog === "edit" && (
        <GatheringForm title="Edit gathering" submitLabel="Save changes" initial={event} groupId={event.groupId} onClose={() => setDialog(null)}
          onSubmit={async (fields) => {
            await updateEvent(event.id, fields);
            setEvent((e) => ({ ...e, ...fields }));
            setDialog(null);
            toast({ title: "Gathering updated" });
          }} />
      )}
      {dialog === "invite" && <InviteDialog event={event} onClose={() => setDialog(null)} onChange={(invitees) => setEvent((e) => ({ ...e, invitees }))} />}
      {dialog === "delete" && (
        <ConfirmDialog title="Cancel this gathering?" confirmLabel="Cancel gathering"
          body="It'll disappear for everyone, along with its discussion. This can't be undone."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try {
              await deleteEvent(event.id);
              toast({ title: "Gathering cancelled" });
              navigate(event.groupId ? `/circles/${event.groupId}` : "/circles?view=gatherings", { replace: true });
            } catch { toast({ tone: "error", title: "Couldn't cancel the gathering" }); }
          }} />
      )}
    </div>
  );
}

function Discussion({ event, status }) {
  const { profile } = useShell();
  const toast = useToast();
  const [posts, setPosts] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isHost = event.hostId === me();
  const allowed = canPostInEvent(event, status);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchEventPosts(event.id).catch(() => []),
      fetchAnnouncements(event.id).catch(() => []),
    ]).then(([list, legacy]) => {
      if (cancelled) return;
      const old = legacy.map((a) => ({ ...a, legacy: true, likedBy: [], authorDisplayName: a.authorName }));
      const at = (p) => p.createdAt?.toMillis?.() || 0;
      setPosts([...list, ...old].sort((a, b) => at(b) - at(a)));
    });
    return () => { cancelled = true; };
  }, [event.id]);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, 1000, "Post");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "gathering-post", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    setError("");
    try {
      const post = await addEventPost(event.id, v.text);
      setPosts((prev) => [post, ...(prev || [])]);
      setText("");
    } catch (err) {
      setError(err?.code === "permission-denied"
        ? "You can't post here right now. Reply to the gathering first, or the host may have made it host-only."
        : "Couldn't post. Check your connection. Your words are still here.");
    } finally { setBusy(false); }
  };

  const like = async (p) => {
    const liked = (p.likedBy || []).includes(me());
    const next = liked ? p.likedBy.filter((u) => u !== me()) : [...(p.likedBy || []), me()];
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, likedBy: next } : x)));
    try { await toggleEventPostLike(event.id, p, liked); }
    catch {
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, likedBy: p.likedBy } : x)));
      toast({ tone: "error", title: "Couldn't update your like" });
    }
  };

  const remove = async (p) => {
    const before = posts;
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
    try { await deleteEventPost(event.id, p.id); toast({ title: "Post deleted" }); }
    catch { setPosts(before); toast({ tone: "error", title: "Couldn't delete that post" }); }
  };

  const reason = event.guestPosting === "host" && !isHost
    ? "Only the host posts here. You can still like posts."
    : "Reply Going, Interested or Maybe to join the discussion.";

  return (
    <div className="space-y-4">
      {allowed ? (
        <form onSubmit={submit} className="group rounded-card border border-line bg-surface p-4">
          <div className="flex gap-3">
            <Avatar profile={profile} size={36} />
            <div className="min-w-0 flex-1">
              <label htmlFor="gathering-post" className="sr-only">Post to the gathering</label>
              <Textarea id="gathering-post" autoGrow rows={1} maxRows={6} value={text} maxLength={1000}
                onChange={(e) => { setText(e.target.value); if (error) setError(""); }}
                placeholder={isHost ? "Post an update for your guests…" : "Say something to everyone coming…"}
                aria-describedby="gathering-post-error"
                className="!border-transparent !bg-transparent !px-0 !py-1.5 hover:!border-transparent focus:!ring-0" />
              <div aria-live="polite" className="mt-1"><InlineMessage id="gathering-post-error">{error}</InlineMessage></div>
              <div className="mt-2 flex justify-end border-t border-line pt-2 transition-colors group-focus-within:border-accent-text">
                <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!text.trim()}>Post</Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <p className="flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-callout text-fg-muted">
          <MessageSquare size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> {reason}
        </p>
      )}

      {posts === null && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 !rounded-card" />)}</div>}
      {posts?.length === 0 && (
        <EmptyState compact icon={MessageSquare} title="No posts yet"
          body={allowed ? "Kick things off: plans, questions, who's bringing what." : "When people post, it shows here."} />
      )}
      {posts?.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {posts.map((p) => {
            const liked = (p.likedBy || []).includes(me());
            const fromHost = p.authorId === event.hostId;
            return (
              <li key={p.id} className="flex gap-3 p-4">
                <button type="button" onClick={() => openUserProfile(p.authorId)} className="h-fit shrink-0" aria-label={`@${p.authorName}'s profile`}>
                  <Avatar profile={{ username: p.authorName, name: p.authorDisplayName, photoURL: p.authorPhoto }} size={36} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-callout font-semibold">{p.authorDisplayName || `@${p.authorName}`}</span>
                    {fromHost && <Badge tone="accent">Host</Badge>}
                    <time dateTime={isoTime(p.createdAt)} title={fullTime(p.createdAt)} className="text-caption text-fg-subtle">{shortTime(p.createdAt)}</time>
                  </p>
                  <RichText text={p.text} className="mt-1 text-callout text-fg" />
                  {!p.legacy && (
                    <div className="-ml-2.5 mt-1 flex items-center">
                      <IconButton icon={Heart} label={liked ? "Unlike" : "Like"} pressed={liked} activeClass="text-fuchsia-400"
                        count={(p.likedBy || []).length} countNoun="like" size={17} onClick={() => like(p)} />
                      {(p.authorId === me() || event.hostId === me()) && (
                        <IconButton icon={Trash2} label="Delete post" size={16} className="ml-auto" onClick={() => remove(p)} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Guests({ event, isHost, status }) {
  const [guests, setGuests] = useState(null);
  const visible = event.showGuestList || isHost;

  useEffect(() => {
    if (!visible) return;
    fetchGuestList(event.id).then(setGuests).catch(() => setGuests([]));
  }, [event.id, visible]);

  if (!visible) {
    return (
      <EmptyState compact icon={Lock} title="The guest list is private"
        body={status ? `The host keeps it to themselves. You replied ${STATUS_LABEL[status]}.` : "The host keeps it to themselves."} />
    );
  }
  if (guests === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!guests.length) return <EmptyState compact icon={Users} title="Nobody has replied yet" />;

  const groups = ["going", "interested", "maybe", "cant"]
    .map((s) => ({ s, people: guests.filter((g) => g.status === s) }))
    .filter((g) => g.people.length);

  return (
    <div className="space-y-5">
      {groups.map(({ s, people }) => (
        <section key={s} aria-label={STATUS_LABEL[s]}>
          <h2 className="mb-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">{STATUS_LABEL[s]} · {people.length}</h2>
          <ul className="flex flex-wrap gap-2">
            {people.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => openUserProfile(g.id)}
                  className="press inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-caption font-medium hover:bg-surface-3">
                  <Avatar profile={{ username: g.username || "?" }} size={28} />
                  {g.id === me() ? "You" : `@${g.username || "guest"}`}
                  {g.id === event.hostId && <span className="text-accent-text">· host</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* Private gatherings are invite-only, so the host needs a way to invite.
   Invited people see it under Gatherings → Invited. */
function InviteDialog({ event, onClose, onChange }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [invitees, setInvitees] = useState(event.invitees || []);
  const [names, setNames] = useState({});

  useEffect(() => {
    const t = setTimeout(async () => {
      if (term.trim().length >= 1) {
        const users = await searchUsers(term).catch(() => []);
        setResults(users.filter((u) => u.id !== me()));
      } else setResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  const invite = async (u) => {
    try {
      await inviteToEvent(event.id, [u]);
      const next = [...new Set([...invitees, u.id])];
      setInvitees(next);
      setNames((n) => ({ ...n, [u.id]: u.username }));
      onChange(next);
      toast({ title: `Invited @${u.username}` });
    } catch { toast({ tone: "error", title: "Couldn't send that invite" }); }
  };

  const uninvite = async (uid) => {
    try {
      await uninviteFromEvent(event.id, uid);
      const next = invitees.filter((x) => x !== uid);
      setInvitees(next);
      onChange(next);
    } catch { toast({ tone: "error", title: "Couldn't remove that invite" }); }
  };

  return (
    <Dialog title="Invite people" onClose={onClose}>
      <p className="mb-3 text-callout text-fg-muted">Invited people can see this gathering, reply and join the discussion.</p>
      <label htmlFor="invite-search" className="sr-only">Search by handle</label>
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <Input id="invite-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by handle" autoCapitalize="none" className="!pl-10" />
      </div>
      <ul className="mt-3 space-y-1">
        {results.map((u) => {
          const already = invitees.includes(u.id);
          return (
            <li key={u.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
              <Avatar profile={u} size={36} />
              <span className="min-w-0 flex-1 truncate text-callout">@{u.username}</span>
              <Button size="sm" variant={already ? "ghost" : "primary"} disabled={already} icon={already ? Check : UserPlus} onClick={() => invite(u)}>
                {already ? "Invited" : "Invite"}
              </Button>
            </li>
          );
        })}
      </ul>
      {invitees.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-label font-semibold uppercase tracking-wider text-fg-subtle">Invited · {plural(invitees.length, "person", "people")}</p>
          <ul className="flex flex-wrap gap-2">
            {invitees.map((uid) => (
              <li key={uid}>
                <button type="button" onClick={() => uninvite(uid)} aria-label={`Remove invite for ${names[uid] ? `@${names[uid]}` : "this person"}`}
                  className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-caption hover:bg-surface-3">
                  {names[uid] ? `@${names[uid]}` : "Invited guest"} <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
