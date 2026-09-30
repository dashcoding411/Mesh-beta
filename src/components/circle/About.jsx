import { Info, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchMembers, ROLES } from "../../lib/db";
import { plural, shortTime } from "../../lib/format";
import { interestById } from "../../lib/interests";
import Avatar from "../ui/Avatar";

export function About({ group, memberCount, limits }) {
  const [admins, setAdmins] = useState([]);
  useEffect(() => {
    fetchMembers(group.id).then((ms) => setAdmins(ms.filter((m) => m.role === "owner" || m.role === "moderator"))).catch(() => {});
  }, [group.id]);

  return (
    <div className="space-y-4">
      <Panel title="About" icon={Info}>
        <p className="text-callout text-fg">{group.description || "No description yet."}</p>
        <p className="mt-2 text-caption text-fg-subtle">{plural(memberCount, "member")} · started {shortTime(group.createdAt)}</p>
        {group.interests?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Interests">
            {group.interests.map((id) => {
              const it = interestById(id);
              return it ? (
                <li key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-caption font-semibold text-fg-muted">
                  <it.icon size={12} aria-hidden="true" />{it.label}
                </li>
              ) : null;
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Limits" icon={ShieldCheck}>
        {limits.length === 0 ? (
          <p className="text-callout text-fg-muted">Open to everyone. Mesh's own hate-speech and spam filters always apply.</p>
        ) : (
          <ul className="space-y-2">
            {limits.map((l) => (
              <li key={l.label} className="flex items-center gap-2 text-callout"><l.icon size={16} className="text-fg-muted" aria-hidden="true" />{l.label}</li>
            ))}
          </ul>
        )}
      </Panel>
      {group.rules && (
        <Panel title="Rules" icon={ShieldCheck}>
          <ol className="list-inside list-decimal space-y-1.5 text-callout text-fg">
            {group.rules.split("\n").filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </Panel>
      )}
      {admins.length > 0 && (
        <Panel title="Admins and moderators" icon={Users}>
          <ul className="space-y-2">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Avatar profile={{ username: a.username || "?" }} size={28} />
                <span className="truncate text-callout">@{a.username || "member"}</span>
                <span className="ml-auto text-label text-fg-subtle">{ROLES[a.role]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-fg-subtle">
        <Icon size={14} aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}
