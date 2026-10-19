import { useEffect, useState } from "react";
import { Check, ExternalLink, FileCheck2, ImageIcon, Newspaper, X } from "lucide-react";
import { decideApplication, fetchApplicationProof, fetchApplications, fetchProfile, openUserProfile } from "../lib/db";
import { followLink } from "../lib/links";
import { shortTime } from "../lib/format";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import { Field, Select, Textarea } from "./ui/Field";
import { EmptyState, ErrorState, Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";

const METHODS = [
  { id: "id document", label: "ID document" },
  { id: "video call", label: "Video call" },
  { id: "in person", label: "In person" },
];

/** The news team's queue of journalist applications, oldest first. */
export default function JournalistApplications() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [deciding, setDeciding] = useState(null); // { app, approve }

  const load = async () => {
    setError(false);
    try {
      const apps = await fetchApplications();
      const people = await Promise.all(apps.map((a) => fetchProfile(a.id).catch(() => null)));
      setList(apps.map((a, i) => ({ ...a, username: people[i]?.username || "" })));
    } catch {
      setError(true);
    }
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  if (error) return <ErrorState title="Applications couldn't be loaded" onRetry={load} />;
  if (list === null) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 !rounded-card" />)}</div>;
  if (!list.length) return <EmptyState icon={Newspaper} title="No applications waiting" />;

  return (
    <>
      <ul className="space-y-4">
        {list.map((app) => (
          <li key={app.id}>
            <Application app={app} onDecide={(approve) => setDeciding({ app, approve })} />
          </li>
        ))}
      </ul>
      {deciding && (
        <DecideDialog {...deciding} onClose={() => setDeciding(null)}
          onDone={(approve) => {
            setList((l) => l.filter((a) => a.id !== deciding.app.id));
            setDeciding(null);
            toast({ title: approve ? `@${deciding.app.username} is a journalist` : "Application declined" });
          }} />
      )}
    </>
  );
}

function Application({ app, onDecide }) {
  const [proof, setProof] = useState(null); // null: not loaded; [] once loaded
  const [loading, setLoading] = useState(false);
  const showProof = async () => {
    setLoading(true);
    setProof(await fetchApplicationProof(app.id).catch(() => []));
    setLoading(false);
  };
  return (
    <article className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-callout font-semibold">{app.name}</h3>
        {app.username && (
          <button type="button" onClick={() => openUserProfile(app.id)} className="text-caption text-accent-text hover:underline">@{app.username}</button>
        )}
        <span className="ml-auto text-caption text-fg-subtle">{shortTime(app.submittedAt)}</span>
      </div>
      <p className="text-caption text-fg-muted">{[app.outlet || "Independent", app.region].filter(Boolean).join(" · ")}</p>

      <dl className="mt-3 space-y-3 text-callout">
        <div>
          <dt className="text-label font-semibold uppercase tracking-wider text-fg-subtle">Experience</dt>
          <dd className="mt-0.5 whitespace-pre-wrap">{app.experience}</dd>
        </div>
        {app.skills && (
          <div>
            <dt className="text-label font-semibold uppercase tracking-wider text-fg-subtle">Skills</dt>
            <dd className="mt-0.5 whitespace-pre-wrap">{app.skills}</dd>
          </div>
        )}
        {app.qualification && (
          <div>
            <dt className="text-label font-semibold uppercase tracking-wider text-fg-subtle">Qualification</dt>
            <dd className="mt-0.5">{app.qualification}</dd>
          </div>
        )}
        {app.links?.length > 0 && (
          <div>
            <dt className="text-label font-semibold uppercase tracking-wider text-fg-subtle">Work</dt>
            <dd className="mt-1 space-y-1">
              {app.links.map((l) => (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => followLink(l, e)}
                  className="flex min-w-0 items-center gap-1.5 text-accent-text hover:underline">
                  <ExternalLink size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{l.replace(/^https:\/\//, "")}</span>
                </a>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {app.proofCount > 0 && (
        proof === null ? (
          <Button size="sm" className="mt-3" icon={ImageIcon} loading={loading} onClick={showProof}>Show proof ({app.proofCount})</Button>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {proof.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-control border border-line">
                <img src={src} alt={`Proof ${i + 1}`} className="aspect-square w-full object-cover" />
              </a>
            ))}
          </div>
        )
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="primary" icon={Check} onClick={() => onDecide(true)}>Approve</Button>
        <Button icon={X} onClick={() => onDecide(false)}>Decline</Button>
      </div>
    </article>
  );
}

function DecideDialog({ app, approve, onClose, onDone }) {
  const [method, setMethod] = useState("id document");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await decideApplication(app, { approve, method, evidence, note });
      onDone(approve);
    } catch (err) {
      setError(err?.code === "permission-denied" ? "Only the news team can decide, and not on their own application." : "That didn't go through. Try again.");
      setBusy(false);
    }
  };
  return (
    <Dialog title={approve ? `Approve ${app.name}?` : `Decline ${app.name}?`} onClose={busy ? undefined : onClose} size="sm"
      footer={(
        <div className="flex w-full gap-2">
          <Button full onClick={onClose} disabled={busy}>Cancel</Button>
          <Button full variant={approve ? "primary" : "danger"} icon={approve ? FileCheck2 : X} loading={busy}
            disabled={approve && evidence.trim().length < 5} onClick={submit}>{approve ? "Approve" : "Decline"}</Button>
        </div>
      )}>
      {approve ? (
        <div className="space-y-4">
          <Field label="How you checked who they are">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="What you checked" count={evidence.length} max={500}>
            <Textarea value={evidence} maxLength={500} rows={3} onChange={(e) => setEvidence(e.target.value)}
              placeholder="Licence matched their name; degree from UQ; three published bylines" />
          </Field>
        </div>
      ) : (
        <Field label="Reason" optional count={note.length} max={300}>
          <Textarea value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="They'll see this" />
        </Field>
      )}
      {error && <p className="mt-3 text-callout text-danger-text">{error}</p>}
    </Dialog>
  );
}
