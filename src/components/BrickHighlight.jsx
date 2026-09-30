import { useEffect, useState } from "react";
import { BrickWall, Flame, Trophy } from "lucide-react";
import { fetchBrickStats, weekKeyFor } from "../lib/db";
import { deviceOffset } from "../lib/brick";
import { durationLabel } from "../lib/format";
import { navigate } from "../lib/router";

// Shown to others only when stats are public; always to the owner.
export default function BrickHighlight({ uid, own = false }) {
  const [stats, setStats] = useState(null);
  const [week] = useState(() => weekKeyFor(Date.now(), deviceOffset()));
  useEffect(() => {
    let live = true;
    fetchBrickStats(uid).then((s) => { if (live) setStats(s); }).catch(() => {});
    return () => { live = false; };
  }, [uid]);
  if (!stats || (!stats.public && !own) || !stats.totalSeconds) return null;
  const thisWeek = stats.weekKey === week ? stats.weekSeconds : 0;

  return (
    <section aria-label="Bricked time" className="mx-4 mb-4 flex items-center gap-3 rounded-card border border-line bg-surface p-3 md:mx-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
        <BrickWall size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-callout font-semibold text-fg">
          {thisWeek ? `Bricked ${durationLabel(thisWeek)} this week` : `Bricked ${durationLabel(stats.totalSeconds)} in total`}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
          {thisWeek > 0 && <span>{durationLabel(stats.totalSeconds)} in total</span>}
          {stats.streakDays > 1 && <span className="inline-flex items-center gap-1"><Flame size={12} aria-hidden="true" />{stats.streakDays}-day streak</span>}
          {own && !stats.public && <span>Only you can see this</span>}
        </p>
      </div>
      <button type="button" onClick={() => navigate(own && !stats.public ? "/account/brick" : "/leaderboard")}
        className="press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-callout font-semibold text-fg hover:bg-surface-3">
        <Trophy size={14} aria-hidden="true" /> {own && !stats.public ? "Show it" : "Leaderboard"}
      </button>
    </section>
  );
}
