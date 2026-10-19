import { useEffect, useRef, useState } from "react";
import { ImagePlus, Link2, Newspaper, Plus, X } from "lucide-react";
import {
  fetchMyApplication, isNewsWriter, MAX_LINKS, MAX_PROOF, reapplyAt, submitApplication, tsMillis, withdrawApplication,
} from "../lib/db";
import { navigate } from "../lib/router";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import { Checkbox, Field, Input, Textarea } from "./ui/Field";
import { Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";

const day = (ms) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** Settings > Become a journalist: apply, see where it's up to, or edit while it waits. */
export default function JournalistApply({ onClose }) {
  const toast = useToast();
  const [state, setState] = useState(null); // { app, writer }
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([fetchMyApplication(), isNewsWriter()])
      .then(([app, writer]) => { if (live) setState({ app, writer }); })
      .catch(() => { if (live) setState({ app: null, writer: false }); });
    return () => { live = false; };
  }, []);

  const app = state?.app;
  const again = reapplyAt(app);
  const showForm = state && !state.writer && (editing || !app || (app.status === "declined" && !again));

  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawApplication();
      setState((s) => ({ ...s, app: null }));
      toast({ title: "Application withdrawn" });
    } catch {
      toast({ tone: "error", title: "Couldn't withdraw it" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="Become a journalist" onClose={busy ? undefined : onClose} size="md" variant="full">
      {!state && <Skeleton className="h-40 !rounded-card" />}

      {state?.writer && (
        <div className="text-center">
          <Newspaper size={32} className="mx-auto text-accent-text" aria-hidden="true" />
          <p className="mt-3 text-title-3">You&apos;re a journalist on Mesh</p>
          <Button variant="primary" className="mt-5" onClick={() => { onClose(); navigate("/news/desk"); }}>Open the newsroom</Button>
        </div>
      )}

      {state && !state.writer && !showForm && app?.status === "pending" && (
        <div>
          <p className="text-title-3">Application sent</p>
          <p className="mt-1 text-callout text-fg-muted">Sent {day(tsMillis(app.submittedAt))}. You&apos;ll get a notification when the news team decides.</p>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="ghost" loading={busy} onClick={withdraw}>Withdraw</Button>
          </div>
        </div>
      )}

      {state && !state.writer && !showForm && app?.status === "declined" && (
        <div>
          <p className="text-title-3">Not approved this time</p>
          {app.note && <p className="mt-2 rounded-control bg-surface-2 p-3 text-callout">{app.note}</p>}
          <p className="mt-3 text-callout text-fg-muted">You can apply again on {day(again)}.</p>
        </div>
      )}

      {showForm && (
        <ApplicationForm app={editing ? app : null}
          onSent={(sent) => { setState((s) => ({ ...s, app: sent })); setEditing(false); toast({ title: "Application sent" }); }} />
      )}
    </Dialog>
  );
}

function ApplicationForm({ app, onSent }) {
  const [name, setName] = useState(app?.name || "");
  const [outlet, setOutlet] = useState(app?.outlet || "");
  const [region, setRegion] = useState(app?.region || "");
  const [experience, setExperience] = useState(app?.experience || "");
  const [skills, setSkills] = useState(app?.skills || "");
  const [qualification, setQualification] = useState(app?.qualification || "");
  const [links, setLinks] = useState(app?.links?.length ? app.links : [""]);
  const [files, setFiles] = useState([]); // { file, url }
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);
  const shown = useRef([]);
  useEffect(() => { shown.current = files; }, [files]);
  useEffect(() => () => shown.current.forEach((f) => URL.revokeObjectURL(f.url)), []);
  const removeFile = (i) => setFiles((fs) => {
    URL.revokeObjectURL(fs[i].url);
    return fs.filter((_, j) => j !== i);
  });

  const ready = name.trim().length >= 2 && experience.trim().length >= 50 && agree;
  const send = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    const fields = { name, outlet, region, experience, skills, qualification, links };
    try {
      await submitApplication(fields, files.map((f) => f.file), { keepProof: app?.proofCount || 0 });
      onSent({ ...fields, status: "pending", submittedAt: { toMillis: () => Date.now() }, proofCount: files.length || app?.proofCount || 0 });
    } catch (err) {
      setError(err?.code === "permission-denied" ? "That didn't go through. Check the links start with https://." : err?.message || "That didn't go through. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-5">
      <Field label="Full name" hint="As it appears on your ID.">
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Outlet" optional hint="Leave empty if you're independent.">
          <Input value={outlet} maxLength={80} onChange={(e) => setOutlet(e.target.value)} />
        </Field>
        <Field label="Where you're based" optional>
          <Input value={region} maxLength={60} onChange={(e) => setRegion(e.target.value)} placeholder="Brisbane" />
        </Field>
      </div>
      <Field label="Experience" count={experience.length} max={3000}
        error={experience && experience.trim().length < 50 ? "A little more, please (at least 50 characters)." : ""}>
        <Textarea value={experience} maxLength={3000} rows={6} autoGrow maxRows={14} onChange={(e) => setExperience(e.target.value)}
          placeholder="Where you've reported, what you've covered and for how long" />
      </Field>
      <Field label="Skills" optional count={skills.length} max={600}>
        <Textarea value={skills} maxLength={600} rows={3} onChange={(e) => setSkills(e.target.value)} placeholder="Court reporting, data, video, shorthand…" />
      </Field>
      <Field label="Degree or training" optional>
        <Input value={qualification} maxLength={200} onChange={(e) => setQualification(e.target.value)} placeholder="Bachelor of Journalism, UQ, 2024" />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-callout font-medium">Links to your work <span className="font-normal text-fg-subtle">Optional</span></legend>
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="relative min-w-0 flex-1">
                <Link2 size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
                <Input value={l} aria-label={`Link ${i + 1}`} inputMode="url" placeholder="Portfolio, published story or LinkedIn" className="!pl-9"
                  onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))} />
              </span>
              {links.length > 1 && (
                <Button type="button" variant="ghost" icon={X} aria-label={`Remove link ${i + 1}`}
                  onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} />
              )}
            </div>
          ))}
        </div>
        {links.length < MAX_LINKS && (
          <Button type="button" size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setLinks((ls) => [...ls, ""])}>Add a link</Button>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-callout font-medium">Proof <span className="font-normal text-fg-subtle">Up to {MAX_PROOF} photos</span></legend>
        <p className="mb-2 text-caption text-fg-subtle">
          Like a press card, your degree or ID. Only the news team sees them, and they&apos;re deleted once they decide.
          {app?.proofCount > 0 && !files.length && ` You sent ${app.proofCount} before; add new ones to replace them.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="relative">
              <img src={f.url} alt="" className="h-20 w-20 rounded-control object-cover" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removeFile(i)}
                className="press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-canvas">
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
          {files.length < MAX_PROOF && (
            <button type="button" onClick={() => fileInput.current?.click()}
              className="press flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-caption text-fg-muted hover:bg-surface-2">
              <ImagePlus size={20} aria-hidden="true" /> Add
            </button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden="true"
          onChange={(e) => {
            const picked = [...e.target.files].map((file) => ({ file, url: URL.createObjectURL(file) }));
            e.target.value = "";
            setFiles((fs) => {
              const next = [...fs, ...picked];
              next.slice(MAX_PROOF).forEach((f) => URL.revokeObjectURL(f.url));
              return next.slice(0, MAX_PROOF);
            });
          }} />
      </fieldset>

      <Checkbox checked={agree} onChange={setAgree}>This is true, and the work and documents are mine.</Checkbox>
      {error && <p className="text-callout text-danger-text">{error}</p>}
      <Button type="submit" variant="primary" full loading={busy} disabled={!ready}>{app ? "Update application" : "Send application"}</Button>
    </form>
  );
}
