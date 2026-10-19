import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Flame, BrickWall, Users, Plus, Link2, ArrowLeft, LogOut, Trash2, Pencil, UserMinus } from "lucide-react";
import {
  fetchLeaderboard, fetchBrickStats, openUserProfile, me, weekKeyFor, tsMillis,
  fetchMyBrickGroups, fetchBrickGroup, fetchGroupEntries, createBrickGroup, joinBrickGroup, leaveBrickGroup,
  removeFromBrickGroup, renameBrickGroup, deleteBrickGroup, syncMyGroupEntries, MAX_GROUP_MEMBERS,
} from "../lib/db";
import { deviceOffset } from "../lib/brick";
import { durationLabel, clockTime, plural } from "../lib/format";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import Tabs from "./ui/Tabs";
import Segmented from "./ui/Segmented";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { Field, Input } from "./ui/Field";
import { EmptyState, Skeleton, Loading } from "./ui/States";
import { useToast } from "./ui/toast-context";

const MEDALS = ["bg-amber-400 text-amber-950", "bg-zinc-300 text-zinc-900", "bg-orange-400 text-orange-950"];

export default function Leaderboard({ groupId }) {
  const { guest } = useShell();
  const [scope, setScope] = useState("week");
  const [who, setWho] = useState(guest ? "everyone" : "groups");
  const [week] = useState(() => weekKeyFor(Date.now(), deviceOffset()));

  return (
    <>
      <HomeHeader section="leaderboard">
        <Tabs variant="underline" label="Period" value={scope} onChange={setScope} className="px-2 md:px-4"
          tabs={[{ id: "week", label: "This week" }, { id: "all", label: "All time" }]} />
      </HomeHeader>
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-4 pb-16 pt-4">
          {groupId ? <GroupBoard id={groupId} scope={scope} week={week} /> : (
            <>
              {!guest && (
                <Segmented label="Whose time" value={who} onChange={setWho} className="mb-4"
                  options={[{ id: "groups", label: "My groups" }, { id: "following", label: "Following" }, { id: "everyone", label: "Everyone" }]} />
              )}
              {who === "groups" ? <MyGroups /> : <PublicBoard scope={scope} week={week} who={who} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ rank, person, value, sub, mine, trailing }) {
  return (
    <div className={`flex w-full items-center gap-3 rounded-card border p-3 ${mine ? "border-accent-text/40 bg-accent-soft" : "border-line bg-surface"}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-callout font-bold tabular ${MEDALS[rank] || "bg-surface-2 text-fg-muted"}`}>
        {rank + 1}
      </span>
      <button type="button" onClick={() => openUserProfile(person.id)} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar profile={person} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-semibold text-fg">{person.name || person.username}{mine ? " (you)" : ""}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
            <span className="truncate">@{person.username}</span>
            {person.streakDays > 1 && <span className="inline-flex shrink-0 items-center gap-0.5"><Flame size={12} aria-hidden="true" />{person.streakDays}d</span>}
            {sub}
          </span>
        </span>
      </button>
      <span className="shrink-0 text-callout font-bold tabular text-fg">{durationLabel(value)}</span>
      {trailing}
    </div>
  );
}

function PublicBoard({ scope, week, who }) {
  const { following, guest } = useShell();
  const [list, setList] = useState(null);
  const [mine, setMine] = useState(undefined);

  useEffect(() => {
    let live = true;
    fetchLeaderboard(scope, week).then((l) => { if (live) setList(l); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [scope, week]);
  useEffect(() => { if (!guest) fetchBrickStats().then(setMine).catch(() => setMine(null)); }, [guest]);

  const rows = useMemo(() => (list || []).filter((s) => who === "everyone" || following.has(s.id) || s.id === me()), [list, who, following]);
  const valueOf = (s) => (scope === "week" ? s.weekSeconds : s.totalSeconds);

  return (
    <>
      {mine !== undefined && !mine?.public && (
        <div className="mb-4 flex items-center gap-3 rounded-card border border-accent-text/30 bg-accent-soft p-3">
          <BrickWall size={20} className="shrink-0 text-accent-text" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-caption text-fg-muted">
            {mine?.totalSeconds ? `You've bricked ${durationLabel(mine.totalSeconds)} so far. Show it here and on your profile?` : "Brick Mesh on a schedule or for a while, then show your time here."}
          </p>
          <Button size="sm" onClick={() => navigate("/account/brick")}>{mine?.totalSeconds ? "Show mine" : "Set up"}</Button>
        </div>
      )}
      {list === null && (
        <Loading label="Loading the leaderboard">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="mb-2 h-14 !rounded-card" />)}
        </Loading>
      )}
      {list && rows.length === 0 && (
        <EmptyState icon={Trophy} title={who === "following" ? "Nobody you follow is on it yet" : "Nobody's on it yet"}
          body={null} />
      )}
      {rows.length > 0 && (
        <ol className="space-y-1.5">
          {rows.map((s, i) => <li key={s.id}><Row rank={i} person={s} value={valueOf(s)} mine={s.id === me()} /></li>)}
        </ol>
      )}
    </>
  );
}

/** Your Brick groups: private leaderboards with friends. */
function MyGroups() {
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchMyBrickGroups().then(setGroups).catch(() => setGroups([])); }, []);

  return (
    <section aria-label="Your Brick groups">
      <div className="mb-4 rounded-card border border-line bg-surface p-4">
        <p className="flex items-center gap-2 text-callout font-semibold"><Users size={18} className="text-accent-text" aria-hidden="true" /> Brick with friends</p>
        <p className="mt-1 text-caption text-fg-muted">
          See who's kept Mesh bricked the longest this week. Only the group sees it.
        </p>
        <Button size="sm" variant="primary" icon={Plus} className="mt-3" onClick={() => setCreating(true)}>New group</Button>
      </div>
      {groups === null && <Skeleton className="h-20 !rounded-card" />}
      {groups?.length === 0 && <EmptyState compact icon={Users} title="No groups yet" body="Start one, or open a link a friend sent you." />}
      {groups?.length > 0 && (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => navigate(`/leaderboard/g/${g.id}`)}
                className="press flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left hover:bg-surface-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><BrickWall size={20} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout font-semibold">{g.name}</span>
                  <span className="block text-caption text-fg-subtle">{plural(g.members.length, "member")}{g.ownerId === me() ? " · You made it" : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NameDialog title="New Brick group" action="Create" onClose={() => setCreating(false)}
          onSave={async (name) => {
            try { const id = await createBrickGroup(name); navigate(`/leaderboard/g/${id}`); }
            catch { toast({ tone: "error", title: "Couldn't make the group" }); }
          }} />
      )}
    </section>
  );
}

function NameDialog({ title, action, initial = "", onSave, onClose }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={title} onClose={onClose} variant="center" size="sm">
      <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; setBusy(true); await onSave(name.trim()); setBusy(false); onClose(); }}>
        <Field label="Group name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Exam season" />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>{action}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** One group's board, or an invitation to join it. */
function GroupBoard({ id, scope, week }) {
  const toast = useToast();
  const { guest, needsAccount } = useShell();
  const [group, setGroup] = useState(undefined);
  const [entries, setEntries] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const member = !!group?.members?.includes(me());
  const owner = group?.ownerId === me();

  const load = useCallback(async () => {
    const g = await fetchBrickGroup(id);
    setGroup(g);
    if (g?.members?.includes(me())) {
      await syncMyGroupEntries().catch(() => {});
      setEntries(await fetchGroupEntries(id).catch(() => []));
    }
  }, [id]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const now = Date.now();
  const valueOf = (e) => (scope === "week" ? (e.weekKey === week ? e.weekSeconds : 0) : e.totalSeconds);
  const ranked = useMemo(() => (entries || []).filter((e) => group?.members?.includes(e.id))
    .sort((a, b) => valueOf(b) - valueOf(a)), [entries, group, scope, week]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async () => {
    const url = `${window.location.origin}/leaderboard/g/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: `Join "${group.name}" on Mesh`, text: "Let's see who can brick Mesh the longest.", url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Invite link copied", body: "Send it to friends you want in the group." }); }
    } catch { /* dismissed */ }
  };
  const act = async (fn, message, after) => {
    setBusy(true);
    try { await fn(); if (message) toast({ title: message }); await after?.(); }
    catch { toast({ tone: "error", title: "That didn't work. Try again." }); }
    finally { setBusy(false); setDialog(null); }
  };

  const back = <Button size="sm" variant="ghost" icon={ArrowLeft} className="-ml-2 mb-3" onClick={() => navigate("/leaderboard")}>Brick groups</Button>;
  if (group === undefined) return <>{back}<Skeleton className="h-40 !rounded-card" /></>;
  if (group === null) return <>{back}<EmptyState icon={Users} title="This group isn't available" body="It may have been deleted, or the link is wrong." /></>;

  if (!member) {
    const full = group.members.length >= MAX_GROUP_MEMBERS;
    return (
      <>
        {back}
        <div className="rounded-card border border-line bg-surface p-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-text"><BrickWall size={26} aria-hidden="true" /></span>
          <h2 className="mt-3 text-title-2">{group.name}</h2>
          <p className="mt-1 text-callout text-fg-muted">{plural(group.members.length, "member")} comparing how long they keep Mesh bricked.</p>
          <p className="mt-2 text-caption text-fg-subtle">Joining shares your bricked time and streak with this group only.</p>
          <Button variant="primary" className="mt-4" loading={busy} disabled={full}
            onClick={() => { if (guest) return needsAccount("join Brick groups"); act(() => joinBrickGroup(group), `You joined ${group.name}`, load); }}>
            {full ? "This group is full" : "Join group"}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-2">{group.name}</h2>
          <p className="text-caption text-fg-subtle">{plural(group.members.length, "member")} · {scope === "week" ? "This week" : "All time"}</p>
        </div>
        <Button size="sm" icon={Link2} onClick={invite}>Invite</Button>
        {owner ? (
          <>
            <IconButton icon={Pencil} label="Rename group" onClick={() => setDialog("rename")} />
            <IconButton icon={Trash2} label="Delete group" onClick={() => setDialog("delete")} />
          </>
        ) : <IconButton icon={LogOut} label="Leave group" onClick={() => setDialog("leave")} />}
      </div>
      {entries === null ? <Skeleton className="h-40 !rounded-card" /> : (
        <ol className="space-y-1.5">
          {ranked.map((e, i) => {
            const until = tsMillis(e.brickedUntil);
            return (
              <li key={e.id}>
                <Row rank={i} person={e} value={valueOf(e)} mine={e.id === me()}
                  sub={until > now && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent-text"><BrickWall size={12} aria-hidden="true" />Bricked until {clockTime(until)}</span>}
                  trailing={owner && e.id !== me() && (
                    <IconButton icon={UserMinus} label={`Remove @${e.username}`} size={16}
                      onClick={() => act(() => removeFromBrickGroup(group, e.id), `Removed @${e.username}`, load)} />
                  )} />
              </li>
            );
          })}
        </ol>
      )}
      {group.members.length === 1 && (
        <p className="mt-4 text-center text-caption text-fg-muted">It's just you so far. Tap Invite and send the link to friends.</p>
      )}

      {dialog === "rename" && (
        <NameDialog title="Rename group" action="Save" initial={group.name} onClose={() => setDialog(null)}
          onSave={(name) => act(() => renameBrickGroup(group, name), "Group renamed", load)} />
      )}
      {dialog === "leave" && (
        <ConfirmDialog title={`Leave ${group.name}?`} confirmLabel="Leave" busy={busy}
          body="Your time stops showing in this group. You can rejoin with the link."
          onClose={() => setDialog(null)} onConfirm={() => act(() => leaveBrickGroup(group), "You left the group", () => navigate("/leaderboard"))} />
      )}
      {dialog === "delete" && (
        <ConfirmDialog title={`Delete ${group.name}?`} confirmLabel="Delete" busy={busy}
          body="The group and its leaderboard are deleted for everyone."
          onClose={() => setDialog(null)} onConfirm={() => act(() => deleteBrickGroup(group), "Group deleted", () => navigate("/leaderboard"))} />
      )}
    </>
  );
}
