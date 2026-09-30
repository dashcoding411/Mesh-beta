import { VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import {
  contributorBadge, countPostsByMember, fetchMembers, isMuted, me, penaliseMember, removeMember,
  setMemberRole,
} from "../../lib/db";
import { plural } from "../../lib/format";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { ConfirmDialog } from "../ui/Dialog";
import { Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

export function Members({ group, isOwner, moderator, onCountChange }) {
  const toast = useToast();
  const [members, setMembers] = useState(null);
  const [counts, setCounts] = useState(new Map());
  const [busy, setBusy] = useState("");
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ms = await fetchMembers(group.id).catch(() => []);
      if (cancelled) return;
      setMembers(ms);
      const c = await countPostsByMember(group, true).catch(() => new Map());
      if (!cancelled) setCounts(c);
    })();
    return () => { cancelled = true; };
  }, [group]);

  const act = async (uid, fn, done) => {
    setBusy(uid);
    try { await fn(); if (done) toast({ title: done }); }
    catch (err) { console.error(err); toast({ tone: "error", title: "That didn't work", body: "Try again in a moment." }); }
    finally { setBusy(""); }
  };

  if (members === null) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 !rounded-card" />)}</div>;

  const badgeTone = { violet: "accent", sky: "accent", amber: "warning", emerald: "success", zinc: "neutral" };

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {members.map((m) => {
          const badge = contributorBadge(m, counts.get(m.id) || 0);
          const muted = isMuted(m);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar profile={{ username: m.username || "?" }} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-callout font-medium">{m.id === me() ? "You" : `@${m.username || "member"}`}</p>
                  {badge && <Badge tone={badgeTone[badge.tone] || "neutral"}>{badge.label}</Badge>}
                  {muted && <Badge tone="warning" icon={VolumeX}>Muted</Badge>}
                </div>
                <p className="text-caption text-fg-subtle">{plural(counts.get(m.id) || 0, "post")} here</p>
              </div>
              {moderator && m.role !== "owner" && m.id !== me() && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {isOwner && (
                    <Button size="sm" loading={busy === m.id}
                      onClick={() => act(m.id, async () => {
                        const role = m.role === "moderator" ? "member" : "moderator";
                        await setMemberRole(group.id, m.id, role);
                        setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
                      }, m.role === "moderator" ? "No longer a moderator" : "Made a moderator")}>
                      {m.role === "moderator" ? "Remove mod" : "Make mod"}
                    </Button>
                  )}
                  <Button size="sm" disabled={busy === m.id}
                    onClick={() => act(m.id, async () => {
                      await penaliseMember(group.id, m.id, muted ? "" : "mute12h");
                      setMembers((prev) => prev.map((x) => (x.id === m.id
                        ? { ...x, mutedUntil: muted ? null : { toMillis: () => Date.now() + 12 * 3600 * 1000 } }
                        : x)));
                    }, muted ? "Unmuted" : "Muted for 12 hours")}>
                    {muted ? "Unmute" : "Mute 12h"}
                  </Button>
                  <Button size="sm" variant="danger-ghost" disabled={busy === m.id} onClick={() => setRemoving(m)}>Remove</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {removing && (
        <ConfirmDialog title={`Remove @${removing.username || "this member"}?`} confirmLabel="Remove from circle"
          body="They'll lose access to members-only posts. They can ask to join again."
          busy={busy === removing.id}
          onClose={() => setRemoving(null)}
          onConfirm={() => act(removing.id, async () => {
            await removeMember(group.id, removing.id);
            setMembers((prev) => prev.filter((x) => x.id !== removing.id));
            onCountChange((c) => Math.max(0, c - 1));
            setRemoving(null);
          }, "Member removed")} />
      )}
    </>
  );
}
