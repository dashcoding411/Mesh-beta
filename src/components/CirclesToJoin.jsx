import { useEffect, useId, useState } from "react";
import { publicCircles, fetchMembership } from "../lib/db";
import { navigate } from "../lib/router";
import { plural } from "../lib/format";
import { useShell } from "./shell/ShellContext";
import { CircleAvatar } from "./circle/CircleImages";

// Picked once per visit: public circles that share the viewer's interests,
// then the busiest. Only the shortlist is checked for membership.
let cached = null;
async function pickCircles(interests, guest) {
  const mine = new Set(interests || []);
  const overlap = (g) => (g.interests || []).filter((id) => mine.has(id)).length;
  const list = (await publicCircles())
    .slice()
    .sort((a, b) => overlap(b) - overlap(a) || (b.memberCount || 0) - (a.memberCount || 0))
    .slice(0, 10);
  if (guest) return list.slice(0, 8);
  const flags = await Promise.all(list.map((g) => fetchMembership(g.id).then((m) => !m).catch(() => true)));
  return list.filter((_, i) => flags[i]).slice(0, 8);
}

/** A sideways row of circles to explore, shown partway down Home. */
export default function CirclesToJoin() {
  const { interests, guest } = useShell();
  const [circles, setCircles] = useState(null);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    cached ||= pickCircles(interests, guest).catch(() => { cached = null; return []; });
    cached.then((list) => { if (!cancelled) setCircles(list); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!circles?.length) return null;

  return (
    <section aria-labelledby={id} className="py-4 md:rounded-card md:border md:border-line md:bg-surface">
      <div className="mb-3 px-4">
        <h2 id={id} className="text-title-3">Circles to join</h2>
        <p className="text-caption text-fg-subtle">Groups around things you're into. Their public posts show up here too.</p>
      </div>
      <ul className="flex gap-3 overflow-x-auto no-scrollbar px-4">
        {circles.map((g) => (
          <li key={g.id} className="w-40 shrink-0">
            <button type="button" onClick={() => navigate(`/circles/${g.id}`)}
              className="press flex h-full w-full flex-col items-center rounded-card border border-line bg-canvas p-3 text-center hover:border-line-strong">
              <CircleAvatar group={g} size={56} />
              <span className="mt-2 line-clamp-2 text-callout font-semibold text-fg">{g.name}</span>
              <span className="mt-0.5 text-caption font-semibold text-fg-subtle">
                {plural(g.memberCount || 0, g.memberTitle || "member")}
              </span>
              {g.description && <span className="mt-1 line-clamp-2 text-label text-fg-subtle">{g.description}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
