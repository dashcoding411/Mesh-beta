import { useEffect, useState } from "react";
import { searchUsers, fetchFeed, fetchGroups, fetchEvents, fetchNews, openUserProfile, timeAgo, toggleFollow } from "../lib/db";
import { suggestedAccounts } from "../lib/suggest";
import { Avatar } from "./Nav";
import PostCard from "./PostCard";

const SCOPES = [
  ["all", "All"], ["people", "People"], ["posts", "Posts"],
  ["groups", "Circles"], ["events", "Gatherings"], ["news", "Sourced"],
];

export default function Discover({ goTo, following, setFollowing }) {
  const [term, setTerm] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(run, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, scope]);

  const run = async () => {
    const q = term.trim().toLowerCase();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const wantAll = scope === "all";
      const [people, posts, groups, events, news] = await Promise.all([
        wantAll || scope === "people" ? searchUsers(q).catch(() => []) : [],
        wantAll || scope === "posts" ? fetchFeed().catch(() => []) : [],
        wantAll || scope === "groups" ? fetchGroups().catch(() => []) : [],
        wantAll || scope === "events" ? fetchEvents().catch(() => []) : [],
        wantAll || scope === "news" ? fetchNews("approved").catch(() => []) : [],
      ]);
      const match = (s) => String(s || "").toLowerCase().includes(q);
      setResults({
        people,
        posts: posts.filter((p) => match(p.text) || match(p.title) || match(p.authorName)).slice(0, 20),
        groups: groups.filter((g) => match(g.name) || match(g.description)).slice(0, 10),
        events: events.filter((ev) => match(ev.title) || match(ev.location) || match(ev.description)).slice(0, 10),
        news: news.filter((n) => match(n.title) || match(n.script)).slice(0, 10),
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-xl mx-auto px-4 py-6">
        <input
          className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-3.5 text-base placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
          placeholder="Search Mesh — people, posts, circles, gatherings…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
        />

        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
          {SCOPES.map(([id, label]) => (
            <button key={id} onClick={() => setScope(id)}
              className={`min-h-[36px] rounded-full px-4 text-xs font-medium shrink-0 transition ${
                scope === id ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {results === null && !searching && (
          <SuggestedPeople following={following} setFollowing={setFollowing} />
        )}
        {searching && <p className="text-center text-zinc-500 text-sm mt-8 animate-pulse">Searching…</p>}

        {results && (
          <div className="mt-6 space-y-8 anim-fade">
            {results.people.length > 0 && (
              <Section title="People">
                {results.people.map((u) => (
                  <button key={u.id} onClick={() => openUserProfile(u.id)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-900 text-left transition">
                    <Avatar profile={u} size={9} />
                    <div>
                      <p className="text-sm font-semibold">@{u.username}</p>
                      {u.bio && <p className="text-xs text-zinc-500 line-clamp-1">{u.bio}</p>}
                    </div>
                  </button>
                ))}
              </Section>
            )}

            {results.groups.length > 0 && (
              <Section title="Circles">
                {results.groups.map((g) => (
                  <button key={g.id} onClick={() => goTo("circles")}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left hover:border-violet-600/50 transition">
                    <p className="text-sm font-semibold">{g.name}</p>
                    <p className="text-xs text-zinc-500">{g.memberCount || 0} member{g.memberCount === 1 ? "" : "s"}</p>
                  </button>
                ))}
              </Section>
            )}

            {results.events.length > 0 && (
              <Section title="Gatherings">
                {results.events.map((ev) => (
                  <button key={ev.id} onClick={() => goTo("circles")}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left hover:border-violet-600/50 transition">
                    <p className="text-sm font-semibold">{ev.title}</p>
                    <p className="text-xs text-zinc-500">
                      {ev.startsAt?.toDate ? ev.startsAt.toDate().toLocaleDateString() : ""} {ev.location && `· ${ev.location}`}
                    </p>
                  </button>
                ))}
              </Section>
            )}

            {results.news.length > 0 && (
              <Section title="Sourced">
                {results.news.map((n) => (
                  <button key={n.id} onClick={() => goTo("sourced")}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left hover:border-violet-600/50 transition">
                    <p className="text-sm font-semibold">✓ {n.title}</p>
                    <p className="text-xs text-zinc-500">@{n.authorName} · {timeAgo(n.createdAt)}</p>
                  </button>
                ))}
              </Section>
            )}

            {results.posts.length > 0 && (
              <Section title="Posts">
                <div className="space-y-5">
                  {results.posts.map((p) => (
                    <PostCard key={p.id} post={p} liked={false} onLikedChange={() => {}} />
                  ))}
                </div>
              </Section>
            )}

            {Object.values(results).every((r) => r.length === 0) && (
              <p className="text-center text-zinc-500 text-sm mt-8">Nothing found for “{term}”.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestedPeople({ following, setFollowing }) {
  const [people, setPeople] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    suggestedAccounts(following)
      .then((list) => { if (!cancelled) setPeople(list); })
      .catch((err) => { console.error(err); if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, [following]);

  const follow = async (person) => {
    setBusy(person.id);
    try {
      await toggleFollow(person, false);
      setFollowing((prev) => new Set(prev).add(person.id));
      setPeople((prev) => prev.filter((p) => p.id !== person.id));
    } catch (err) {
      console.error(err);
    } finally { setBusy(""); }
  };

  return (
    <section className="mt-8">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">People to follow</h3>
      <p className="text-xs text-zinc-600 mb-3">
        Built from who you already follow and what you engage with — never from your contacts or location.
      </p>
      {people === null && <p className="text-sm text-zinc-500">Finding people…</p>}
      {people?.length === 0 && (
        <p className="text-sm text-zinc-600">Nobody to suggest yet. Search for someone by handle.</p>
      )}
      <div className="space-y-2 stagger">
        {people?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <button onClick={() => openUserProfile(p.id)} className="shrink-0">
              <Avatar profile={p} size={9} />
            </button>
            <button onClick={() => openUserProfile(p.id)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold truncate">{p.name || p.username}</p>
              <p className="text-xs text-zinc-500 truncate">@{p.username}</p>
              <p className="text-[11px] text-violet-400/80 truncate">{p.reason}</p>
            </button>
            <button onClick={() => follow(p)} disabled={busy === p.id}
              className="shrink-0 min-h-[40px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 text-sm font-semibold">
              Follow
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
