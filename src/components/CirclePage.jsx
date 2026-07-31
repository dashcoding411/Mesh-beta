import { useEffect, useState } from "react";
import {
  fetchGroupPosts, fetchMembership, fetchMembers, joinGroup, leaveGroup,
  fetchMyLikes, setMemberRole, removeMember, canModerate, ROLES,
  fetchEvents, fetchMyRsvps, me, fetchGroupById,
  requestToJoin, myJoinRequest, fetchJoinRequests, approveJoinRequest, declineJoinRequest,
  setCircleRules, setScreeningQuestions, setAutomod, AUTOMOD_DEFAULTS,
  setPinnedPost, setPostLocked, penaliseMember, isMuted, contributorBadge,
  countPostsByAuthorInGroup, timeAgo,
} from "../lib/db";
import PostCard from "./PostCard";
import Composer from "./Composer";
import { PrivacyPill } from "./Circles";
import { GatheringCard, NewGatheringForm } from "./Events";
import { Avatar } from "./Nav";

const FIELD =
  "w-full min-h-[44px] rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-base " +
  "focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30";

const TABS = [
  ["featured", "Featured"],
  ["discussion", "Discussion"],
  ["gatherings", "Gatherings"],
  ["members", "Members"],
];

export default function CirclePage({ group: initial, profile, onBack }) {
  const [group, setGroup] = useState(initial);
  const [tab, setTab] = useState("featured");
  const [membership, setMembership] = useState(undefined);
  const [memberCount, setMemberCount] = useState(initial.memberCount || 0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);

  const isOwner = group.ownerId === me();
  const moderator = canModerate(membership, group);
  const canPost = !!membership && !isMuted(membership);
  const canRead = group.privacy === "public" || !!membership;

  useEffect(() => {
    fetchMembership(group.id).then(setMembership).catch(() => setMembership(null));
    myJoinRequest(group.id).then(setPendingRequest).catch(() => {});
  }, [group.id]);

  const refresh = async () => {
    const fresh = await fetchGroupById(group.id).catch(() => null);
    if (fresh) setGroup(fresh);
  };

  const join = async () => {
    // Private circles screen applicants; public ones let you straight in.
    if (group.privacy !== "public" || group.requireApproval || (group.screeningQuestions || []).length) {
      setShowJoin(true);
      return;
    }
    await joinGroup(group.id);
    setMembership({ role: "member" });
    setMemberCount((c) => c + 1);
  };

  const leave = async () => {
    await leaveGroup(group.id);
    setMembership(null);
    setMemberCount((c) => c - 1);
  };

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      {/* Hero banner — identity first, the way a group page should open */}
      <div className={`relative h-32 sm:h-44 bg-gradient-to-br ${group.coverColor || "from-violet-600 via-fuchsia-600 to-rose-500"}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
        <button onClick={onBack}
          className="absolute top-3 left-3 min-h-[40px] rounded-full bg-black/40 px-3 text-sm text-white backdrop-blur hover:bg-black/60">
          ← Circles
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-10 relative">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold truncate">{group.name}</h1>
              <PrivacyPill privacy={group.privacy} />
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {memberCount} member{memberCount === 1 ? "" : "s"}
              {membership && ` · you're ${(ROLES[membership.role] || "member").toLowerCase()}`}
              {isMuted(membership) && <span className="text-amber-400"> · muted</span>}
            </p>
          </div>

          <div className="flex gap-2">
            {moderator && (
              <button onClick={() => setShowAdmin(true)}
                className="min-h-[40px] rounded-xl border border-zinc-700 hover:border-violet-500 px-4 text-sm font-semibold">
                Admin
              </button>
            )}
            {membership !== undefined && !isOwner && (
              membership ? (
                <button onClick={leave}
                  className="min-h-[40px] rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 text-sm font-semibold">
                  Joined
                </button>
              ) : pendingRequest ? (
                <span className="min-h-[40px] flex items-center rounded-xl bg-zinc-900 border border-zinc-800 px-4 text-sm text-zinc-400">
                  Request pending
                </span>
              ) : (
                <button onClick={join}
                  className="min-h-[40px] rounded-xl bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold">
                  Join
                </button>
              )
            )}
            {canPost && (
              <button onClick={() => setComposerOpen(true)}
                className="min-h-[40px] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold">
                Post
              </button>
            )}
          </div>
        </div>

        {/* Tabbed sub-navigation */}
        <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto no-scrollbar border-b border-zinc-800">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`shrink-0 min-h-[44px] px-4 text-sm font-medium border-b-2 -mb-px transition ${
                tab === id
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {!canRead ? (
          <div className="text-center text-zinc-500 mt-16">
            <p className="text-lg font-semibold text-zinc-300">This circle is private</p>
            <p className="text-sm mt-1">Join to see what's being posted.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_260px] items-start">
            <div className="min-w-0">
              {tab === "featured" && (
                <Featured group={group} moderator={moderator}
                  onCompose={() => setComposerOpen(true)} canPost={canPost} onSeeAll={() => setTab("discussion")} />
              )}
              {tab === "discussion" && (
                <Discussion group={group} moderator={moderator}
                  onPinned={refresh} />
              )}
              {tab === "gatherings" && <CircleGatherings group={group} canPost={canPost} />}
              {tab === "members" && (
                <Members group={group} isOwner={isOwner}
                  moderator={moderator} onCountChange={setMemberCount} />
              )}
            </div>

            {/* Sticky side panel */}
            <aside className="hidden lg:block space-y-4 sticky top-4">
              <SidePanel group={group} memberCount={memberCount} />
            </aside>
          </div>
        )}

        {/* On narrow screens the panel becomes a footer card instead of a column */}
        {canRead && (
          <div className="lg:hidden mt-6">
            <SidePanel group={group} memberCount={memberCount} />
          </div>
        )}
      </div>

      {composerOpen && (
        <Composer groupId={group.id} group={group} profile={profile}
          onClose={() => setComposerOpen(false)}
          onPosted={() => { setComposerOpen(false); setTab("discussion"); }} />
      )}
      {showAdmin && (
        <AdminAssist group={group} onClose={() => setShowAdmin(false)} onSaved={refresh}
          onCountChange={setMemberCount} isOwner={isOwner} />
      )}
      {showJoin && (
        <JoinFlow group={group} onClose={() => setShowJoin(false)}
          onRequested={(r) => { setPendingRequest(r); setShowJoin(false); }}
          onJoined={() => { setMembership({ role: "member" }); setMemberCount((c) => c + 1); setShowJoin(false); }} />
      )}
    </div>
  );
}

/* ---------- side panel: about, rules, admins ---------- */

function SidePanel({ group, memberCount }) {
  const [admins, setAdmins] = useState([]);

  useEffect(() => {
    fetchMembers(group.id)
      .then((ms) => setAdmins(ms.filter((m) => m.role === "owner" || m.role === "moderator")))
      .catch(() => {});
  }, [group.id]);

  return (
    <>
      <Panel title="About">
        <p className="text-sm text-zinc-300">{group.description || "No description yet."}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {memberCount} member{memberCount === 1 ? "" : "s"} · created {timeAgo(group.createdAt)}
        </p>
      </Panel>

      {group.rules && (
        <Panel title="Rules">
          <ol className="space-y-1.5 text-sm text-zinc-300 list-decimal list-inside">
            {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </Panel>
      )}

      {admins.length > 0 && (
        <Panel title="Admins & moderators">
          <div className="space-y-2">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <Avatar profile={{ username: a.username || a.id }} size={7} />
                <span className="text-sm truncate">@{a.username || a.id.slice(0, 8)}</span>
                <span className="ml-auto text-[10px] text-zinc-500">{ROLES[a.role]}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{title}</h3>
      {children}
    </section>
  );
}

/* ---------- featured: pinned post + a peek at the rest ---------- */

function Featured({ group, moderator, onCompose, canPost, onSeeAll }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    fetchGroupPosts(group.id).then(setPosts).catch(() => setPosts([]));
  }, [group.id]);

  const pinned = posts?.find((p) => p.id === group.pinnedPostId);
  const rest = (posts || []).filter((p) => p.id !== group.pinnedPostId).slice(0, 3);

  return (
    <div className="space-y-5">
      {canPost && (
        <button onClick={onCompose}
          className="w-full min-h-[52px] rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-violet-500 hover:text-zinc-200 transition">
          Share something with the circle…
        </button>
      )}

      {pinned && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-400">📌 Pinned</p>
          <PostCard post={pinned} liked={false} onLikedChange={() => {}} canModerate={moderator} />
        </div>
      )}

      {posts === null && <p className="text-zinc-500 text-sm">Loading…</p>}
      {posts?.length === 0 && (
        <p className="text-center text-zinc-500 text-sm py-8">Nothing posted yet. Be first.</p>
      )}

      {rest.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent</p>
          <div className="space-y-5">
            {rest.map((p) => (
              <PostCard key={p.id} post={p} liked={false} onLikedChange={() => {}} canModerate={moderator} />
            ))}
          </div>
          <button onClick={onSeeAll}
            className="mt-4 w-full min-h-[44px] rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:border-zinc-600">
            See all discussion
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- discussion: the full feed, with mod tools ---------- */

function Discussion({ group, moderator, onPinned }) {
  const [posts, setPosts] = useState(null);
  const [liked, setLiked] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchGroupPosts(group.id);
        if (cancelled) return;
        setPosts(list);
        const likes = await fetchMyLikes(list.map((p) => p.id));
        if (!cancelled) setLiked(likes);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPosts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [group.id]);

  const onLikedChange = (id, on) =>
    setLiked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  if (posts === null) return <p className="text-zinc-500 text-sm">Loading…</p>;
  if (!posts.length) return <p className="text-center text-zinc-500 text-sm py-8">No posts yet.</p>;

  return (
    <div className="space-y-5">
      {posts.map((p) => (
        <div key={p.id}>
          <PostCard post={p} liked={liked.has(p.id)} onLikedChange={onLikedChange}
            canModerate={moderator}
            onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
          {moderator && (
            <div className="flex gap-2 mt-1.5 px-1">
              <button onClick={async () => {
                await setPinnedPost(group.id, group.pinnedPostId === p.id ? "" : p.id);
                onPinned();
              }} className="text-[11px] text-zinc-500 hover:text-violet-300">
                {group.pinnedPostId === p.id ? "Unpin" : "Pin to Featured"}
              </button>
              <button onClick={async () => {
                await setPostLocked(p.id, !p.locked);
                setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, locked: !x.locked } : x)));
              }} className="text-[11px] text-zinc-500 hover:text-amber-300">
                {p.locked ? "Unlock comments" : "Pause comments"}
              </button>
              {p.locked && <span className="text-[11px] text-amber-400">Comments paused</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CircleGatherings({ group, canPost }) {
  const [events, setEvents] = useState(null);
  const [rsvps, setRsvps] = useState(new Map());
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    await Promise.resolve();
    try {
      const list = await fetchEvents(group.id);
      setEvents(list);
      setRsvps(await fetchMyRsvps(list.map((e) => e.id)).catch(() => new Map()));
    } catch (err) { console.error(err); setEvents([]); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { (async () => { await load(); })(); }, [group.id]);

  return (
    <>
      {canPost && (
        <button onClick={() => setShowCreate(true)}
          className="mb-5 w-full min-h-[44px] rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-violet-500 hover:text-zinc-200 transition">
          Plan a gathering for this circle…
        </button>
      )}
      {events === null && <p className="text-zinc-500 text-sm">Loading…</p>}
      {events?.length === 0 && <p className="text-center text-zinc-500 text-sm py-8">Nothing planned yet.</p>}
      <div className="space-y-3">
        {events?.map((ev) => (
          <GatheringCard key={ev.id} event={ev} myStatus={rsvps.get(ev.id) || null}
            onStatusChange={(id, status) => setRsvps((prev) => {
              const next = new Map(prev);
              if (status) next.set(id, status); else next.delete(id);
              return next;
            })} />
        ))}
      </div>
      {showCreate && (
        <NewGatheringForm groupId={group.id} onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </>
  );
}

/* ---------- members, with earned badges and graduated penalties ---------- */

function Members({ group, isOwner, moderator, onCountChange }) {
  const [members, setMembers] = useState(null);
  const [counts, setCounts] = useState(new Map());
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ms = await fetchMembers(group.id).catch(() => []);
      if (cancelled) return;
      setMembers(ms);
      const entries = await Promise.all(
        ms.slice(0, 30).map(async (m) => [m.id, await countPostsByAuthorInGroup(group.id, m.id).catch(() => 0)])
      );
      if (!cancelled) setCounts(new Map(entries));
    })();
    return () => { cancelled = true; };
  }, [group.id]);

  const act = async (uid, fn) => {
    setBusy(uid);
    try { await fn(); } catch (err) { console.error(err); } finally { setBusy(""); }
  };

  if (members === null) return <p className="text-zinc-500 text-sm">Loading members…</p>;

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const badge = contributorBadge(m, counts.get(m.id) || 0);
        const muted = isMuted(m);
        return (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <Avatar profile={{ username: m.username || m.id }} size={9} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium truncate">@{m.username || m.id.slice(0, 8)}</p>
                {badge && <Badge {...badge} />}
                {muted && <Badge label="Muted" tone="amber" />}
              </div>
              <p className="text-xs text-zinc-500">{counts.get(m.id) || 0} posts here</p>
            </div>
            {moderator && m.role !== "owner" && m.id !== me() && (
              <div className="flex gap-1.5 shrink-0">
                {isOwner && (
                  <button disabled={busy === m.id}
                    onClick={() => act(m.id, async () => {
                      const role = m.role === "moderator" ? "member" : "moderator";
                      await setMemberRole(group.id, m.id, role);
                      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
                    })}
                    className="min-h-[36px] rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 text-xs disabled:opacity-50">
                    {m.role === "moderator" ? "Demote" : "Make mod"}
                  </button>
                )}
                <button disabled={busy === m.id}
                  onClick={() => act(m.id, async () => {
                    await penaliseMember(group.id, m.id, muted ? "" : "mute12h");
                    setMembers((prev) => prev.map((x) => (x.id === m.id
                      ? { ...x, mutedUntil: muted ? null : { toMillis: () => Date.now() + 12 * 3600 * 1000 } }
                      : x)));
                  })}
                  className="min-h-[36px] rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2.5 text-xs disabled:opacity-50">
                  {muted ? "Unmute" : "Mute 12h"}
                </button>
                <button disabled={busy === m.id}
                  onClick={() => act(m.id, async () => {
                    if (!confirm("Remove this member from the circle?")) return;
                    await removeMember(group.id, m.id);
                    setMembers((prev) => prev.filter((x) => x.id !== m.id));
                    onCountChange((c) => c - 1);
                  })}
                  className="min-h-[36px] rounded-lg bg-red-600/70 hover:bg-red-600 px-2.5 text-xs disabled:opacity-50">
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ label, tone }) {
  const tones = {
    violet: "bg-violet-500/15 text-violet-300",
    sky: "bg-sky-500/15 text-sky-300",
    amber: "bg-amber-500/15 text-amber-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    zinc: "bg-zinc-700/40 text-zinc-400",
  };
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone] || tones.zinc}`}>{label}</span>;
}

/* ---------- join flow: rule gate + screening questions ---------- */

function JoinFlow({ group, onClose, onRequested, onJoined }) {
  const questions = group.screeningQuestions || [];
  const [answers, setAnswers] = useState(questions.map(() => ""));
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (group.rules && !agreed) return setError("You need to agree to the rules to join.");
    if (questions.some((_, i) => !answers[i].trim())) return setError("Please answer every question.");
    setBusy(true);
    try {
      if (group.requireApproval || questions.length) {
        await requestToJoin(group.id, questions.map((q, i) => ({ q, a: answers[i].trim() })));
        onRequested({ uid: me(), answers });
      } else {
        await joinGroup(group.id);
        onJoined();
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't send your request. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Join ${group.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {group.rules && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Rules</p>
            <ol className="space-y-1 text-sm text-zinc-300 list-decimal list-inside max-h-40 overflow-y-auto">
              {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
            </ol>
            <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-violet-600" />
              <span className="text-sm text-zinc-300">I've read and agree to these rules.</span>
            </label>
          </div>
        )}

        {questions.map((q, i) => (
          <label key={i} className="block">
            <span className="block text-sm text-zinc-300 mb-1.5">{q}</span>
            <input className={FIELD} value={answers[i]} maxLength={200}
              onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
          </label>
        ))}

        <div aria-live="polite">{error && <p className="text-sm text-red-400">{error}</p>}</div>
        <button disabled={busy}
          className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-sm font-semibold">
          {busy ? "Sending…" : group.requireApproval || questions.length ? "Request to join" : "Join circle"}
        </button>
      </form>
    </Modal>
  );
}

/* ---------- admin assist ---------- */

function AdminAssist({ group, onClose, onSaved, onCountChange, isOwner }) {
  const [section, setSection] = useState("requests");
  const SECTIONS = [["requests", "Requests"], ["rules", "Rules"], ["automod", "Auto-moderation"]];

  return (
    <Modal title="Admin Assist" onClose={onClose} wide>
      <div role="tablist" className="flex gap-1 mb-4 border-b border-zinc-800">
        {SECTIONS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} onClick={() => setSection(id)}
            className={`min-h-[40px] px-3 text-sm font-medium border-b-2 -mb-px transition ${
              section === id ? "border-violet-500 text-violet-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {section === "requests" && <JoinRequests group={group} onCountChange={onCountChange} />}
      {section === "rules" && <RulesEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
      {section === "automod" && <AutomodEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
    </Modal>
  );
}

function JoinRequests({ group, onCountChange }) {
  const [requests, setRequests] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchJoinRequests(group.id).then(setRequests).catch(() => setRequests([]));
  }, [group.id]);

  if (requests === null) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (!requests.length) return <p className="text-sm text-zinc-500">No pending requests.</p>;

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-sm font-semibold">@{r.username || r.uid.slice(0, 8)}</p>
          {(r.answers || []).map((a, i) => (
            <div key={i} className="mt-2">
              <p className="text-[11px] text-zinc-500">{a.q}</p>
              <p className="text-sm text-zinc-300">{a.a}</p>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-emerald-400">✓ Agreed to the rules</p>
          <div className="flex gap-2 mt-3">
            <button disabled={busy === r.id} onClick={async () => {
              setBusy(r.id);
              try {
                await approveJoinRequest(group.id, r);
                setRequests((prev) => prev.filter((x) => x.id !== r.id));
                onCountChange((c) => c + 1);
              } finally { setBusy(""); }
            }} className="min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 text-xs font-semibold disabled:opacity-50">
              Approve
            </button>
            <button disabled={busy === r.id} onClick={async () => {
              setBusy(r.id);
              try {
                await declineJoinRequest(group.id, r.uid);
                setRequests((prev) => prev.filter((x) => x.id !== r.id));
              } finally { setBusy(""); }
            }} className="min-h-[40px] rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 text-xs font-semibold disabled:opacity-50">
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RulesEditor({ group, onSaved, isOwner }) {
  const [rules, setRules] = useState(group.rules || "");
  const [questions, setQuestions] = useState(group.screeningQuestions || []);
  const [msg, setMsg] = useState("");

  if (!isOwner) return <p className="text-sm text-zinc-500">Only the circle admin can edit these.</p>;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm text-zinc-300 mb-1.5">Rules — one per line</span>
        <textarea className={`${FIELD} h-32 resize-none`} value={rules} maxLength={2000}
          onChange={(e) => setRules(e.target.value)}
          placeholder={"Be kind\nNo self-promotion\nStay on topic"} />
      </label>

      <div>
        <p className="text-sm text-zinc-300 mb-1.5">Screening questions — up to 3</p>
        {[0, 1, 2].map((i) => (
          <input key={i} className={`${FIELD} mb-2`} value={questions[i] || ""} maxLength={200}
            placeholder={`Question ${i + 1} (optional)`}
            aria-label={`Screening question ${i + 1}`}
            onChange={(e) => {
              const next = [...questions];
              next[i] = e.target.value;
              setQuestions(next);
            }} />
        ))}
        <p className="text-[11px] text-zinc-600">
          Asking anything at all turns on approval — requests land in the Requests tab.
        </p>
      </div>

      <button onClick={async () => {
        await setCircleRules(group.id, rules.trim());
        await setScreeningQuestions(group.id, questions.filter((q) => q && q.trim()));
        setMsg("Saved.");
        onSaved();
      }} className="w-full min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold">
        Save
      </button>
      <p aria-live="polite" className="text-xs text-emerald-400">{msg}</p>
    </div>
  );
}

function AutomodEditor({ group, onSaved, isOwner }) {
  const [automod, setLocal] = useState({ ...AUTOMOD_DEFAULTS, ...(group.automod || {}) });
  const [words, setWords] = useState((group.automod?.bannedWords || []).join(", "));
  const [msg, setMsg] = useState("");

  if (!isOwner) return <p className="text-sm text-zinc-500">Only the circle admin can edit these.</p>;

  const toggle = (key) => setLocal({ ...automod, [key]: !automod[key] });

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Rules run automatically before a post is written. Mesh's platform-wide hate-speech
        and spam filters apply on top of these and can't be switched off.
      </p>

      {[
        ["blockLinks", "Block posts containing links"],
        ["blockNewAccounts", "Block posts from accounts under 7 days old"],
      ].map(([key, label]) => (
        <label key={key} className="flex items-center gap-2.5 cursor-pointer py-1">
          <input type="checkbox" checked={!!automod[key]} onChange={() => toggle(key)}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-violet-600" />
          <span className="text-sm text-zinc-300">{label}</span>
        </label>
      ))}

      <label className="block">
        <span className="block text-sm text-zinc-300 mb-1.5">Blocked words — comma separated</span>
        <input className={FIELD} value={words} onChange={(e) => setWords(e.target.value)}
          placeholder="crypto, referral, dm me" maxLength={500} />
      </label>

      <button onClick={async () => {
        await setAutomod(group.id, {
          ...automod,
          bannedWords: words.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 40),
        });
        setMsg("Saved.");
        onSaved();
      }} className="w-full min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold">
        Save
      </button>
      <p aria-live="polite" className="text-xs text-emerald-400">{msg}</p>
    </div>
  );
}

function Modal({ title, onClose, wide, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 p-0 md:p-4 anim-fade"
      role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 p-5 anim-rise`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close"
            className="min-h-[36px] px-2 text-zinc-500 hover:text-zinc-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
