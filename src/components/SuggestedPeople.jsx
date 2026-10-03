import { useEffect, useId, useState } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { toggleFollow, openUserProfile, me } from "../lib/db";
import { suggestedAccounts } from "../lib/suggest";
import { tickOf } from "../lib/badges";
import { useShell } from "./shell/ShellContext";
import Avatar from "./ui/Avatar";
import { VerifiedTick } from "./ui/Badges";
import Button from "./ui/Button";
import { Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";

// Computed once per visit and shared, so Home and Search agree and following
// someone from the row doesn't reshuffle it.
let cached = null;
function suggestions(following) {
  cached ||= suggestedAccounts(following, { max: 10 }).catch(() => { cached = null; return []; });
  return cached;
}

/** A row of follow suggestions; `title` lets Home call it "People you may know". */
export default function SuggestedPeople({ title = "People you might like", className = "border-b border-line py-4" }) {
  const { following, setFollowing } = useShell();
  const [people, setPeople] = useState(null);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    suggestions(following).then((list) => { if (!cancelled) setPeople(list.filter((p) => p.id !== me())); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (people?.length === 0) return null;

  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-3 px-4 md:px-6">
        <h2 id={id} className="text-title-3">{title}</h2>
        <p className="text-caption text-fg-subtle">Based on who you follow and what you engage with. Never your contacts or location.</p>
      </div>
      <ul className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-6">
        {people === null && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-44 w-36 !rounded-card" /></li>)}
        {people?.map((p) => (
          <li key={p.id} className="flex w-36 shrink-0 flex-col items-center rounded-card border border-line bg-surface p-3 text-center">
            <button type="button" onClick={() => openUserProfile(p.id)} className="press flex flex-col items-center" aria-label={`${p.name || p.username}'s profile`}>
              <Avatar profile={p} size={56} />
              <span className="mt-2 flex w-full items-center justify-center gap-1 text-callout font-semibold">
                <span className="truncate">{p.name || p.username}</span>
                {tickOf(p.badges) && <VerifiedTick size={14} pink={tickOf(p.badges) === "pink"} />}
              </span>
              <span className="w-full truncate text-caption text-fg-subtle">@{p.username}</span>
            </button>
            <span className="mt-1 line-clamp-2 min-h-8 text-label text-fg-subtle">{p.reason}</span>
            <FollowButton person={p} following={following} setFollowing={setFollowing} className="mt-2 w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FollowButton({ person, following, setFollowing, className = "" }) {
  const toast = useToast();
  const { needsAccount } = useShell();
  const [busy, setBusy] = useState(false);
  const on = following.has(person.id);
  if (person.id === me()) return null;
  const toggle = async (e) => {
    e.stopPropagation();
    if (needsAccount("follow people")) return;
    setBusy(true);
    try {
      await toggleFollow(person, on);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (on) next.delete(person.id); else next.add(person.id);
        return next;
      });
    } catch {
      toast({ tone: "error", title: "Couldn't update follow" });
    } finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant={on ? "secondary" : "primary"} icon={on ? UserCheck : UserPlus} loading={busy}
      onClick={toggle} className={className} aria-label={`${on ? "Unfollow" : "Follow"} @${person.username}`}>
      {on ? "Following" : "Follow"}
    </Button>
  );
}
