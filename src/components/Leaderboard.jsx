import { useEffect, useMemo, useState } from "react";
import { Trophy, Flame, BrickWall } from "lucide-react";
import { fetchLeaderboard, fetchBrickStats, openUserProfile, me, weekKeyFor } from "../lib/db";
import { deviceOffset } from "../lib/brick";
import { durationLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import Tabs from "./ui/Tabs";
import Segmented from "./ui/Segmented";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { EmptyState, Skeleton, Loading } from "./ui/States";

const MEDALS = ["bg-amber-400 text-amber-950", "bg-zinc-300 text-zinc-900", "bg-orange-400 text-orange-950"];

export default function Leaderboard() {
  const { following, guest } = useShell();
  const [scope, setScope] = useState("week");
  const [who, setWho] = useState("everyone");
  const [list, setList] = useState(null);
  const [mine, setMine] = useState(undefined);
  const [week] = useState(() => weekKeyFor(Date.now(), deviceOffset()));

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
      <HomeHeader section="leaderboard">
        <Tabs variant="underline" label="Period" value={scope} onChange={(v) => { setScope(v); setList(null); }} className="px-2 md:px-4"
          tabs={[{ id: "week", label: "This week" }, { id: "all", label: "All time" }]} />
      </HomeHeader>
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-4 pb-16 pt-4 md:border-x md:border-line md:min-h-full">
          {!guest && (
            <Segmented label="Whose time" value={who} onChange={setWho} className="mb-4"
              options={[{ id: "everyone", label: "Everyone" }, { id: "following", label: "People you follow" }]} />
          )}

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
              body={scope === "week" ? "Bricked time counted this week shows up here." : "Be the first: brick Mesh for a while and show your time."} />
          )}
          {rows.length > 0 && (
            <ol className="space-y-1.5">
              {rows.map((s, i) => (
                <li key={s.id}>
                  <button type="button" onClick={() => openUserProfile(s.id)}
                    className={`press flex w-full items-center gap-3 rounded-card border p-3 text-left transition-colors hover:bg-surface ${
                      s.id === me() ? "border-accent-text/40 bg-accent-soft" : "border-line bg-surface"
                    }`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-callout font-bold tabular ${MEDALS[i] || "bg-surface-2 text-fg-muted"}`}>
                      {i + 1}
                    </span>
                    <Avatar profile={s} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-semibold text-fg">{s.name || s.username}{s.id === me() ? " (you)" : ""}</span>
                      <span className="flex items-center gap-2 text-caption text-fg-subtle">
                        <span className="truncate">@{s.username}</span>
                        {s.streakDays > 1 && <span className="inline-flex shrink-0 items-center gap-0.5"><Flame size={12} aria-hidden="true" />{s.streakDays}d</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-callout font-bold tabular text-fg">{durationLabel(valueOf(s))}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-6 text-center text-caption text-fg-subtle">
            Only time the server enforced counts: finished instant bricks and whole days of scheduled time. People appear here only if they choose to.
          </p>
        </div>
      </div>
    </>
  );
}
