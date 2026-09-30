// Circle guides (multi-step units) with per-member progress.
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Check, ListChecks, Plus, Trash2 } from "lucide-react";
import {
  deleteGuide, fetchGuideCompletions, fetchGuideProgress, fetchGuides, isCircleMod, saveGuide, setGuideProgress,
} from "../../lib/db";
import { plural } from "../../lib/format";
import { checkContent } from "../../lib/moderation";
import RichText from "../ui/RichText";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import { Field, Input, Textarea } from "../ui/Field";
import { EmptyState, ErrorState, InlineMessage, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

export function Guides({ group, membership }) {
  const moderator = isCircleMod(membership);
  const [guides, setGuides] = useState(null);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null); // guide | "new"

  const load = useCallback(async () => {
    try {
      const list = await fetchGuides(group.id);
      setGuides(list);
      setError(false);
      if (membership) {
        const entries = await Promise.all(list.map(async (g) => [g.id, await fetchGuideProgress(group.id, g.id)]));
        setProgress(Object.fromEntries(entries));
      }
    } catch { setError(true); }
  }, [group.id, membership]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (error) return <ErrorState compact title="Couldn't load the guides" onRetry={load} />;
  if (guides === null) return <Skeleton className="h-28 !rounded-card" />;

  return (
    <div className="space-y-3">
      {moderator && <Button icon={Plus} onClick={() => setEditing("new")}>New guide</Button>}
      {guides.length === 0 && (
        <EmptyState compact icon={BookOpen} title="No guides yet"
          body={moderator ? "A guide walks members through something step by step: a welcome, a how-to, a short course." : "When the admins write one, it'll be here."} />
      )}
      <ul className="space-y-3">
        {guides.map((g) => {
          const done = (progress[g.id] || []).length;
          const total = g.unitTitles.length;
          const pct = Math.round((done / total) * 100);
          return (
            <li key={g.id}>
              <button type="button" onClick={() => setOpen(g)}
                className="press w-full rounded-card border border-line bg-surface p-4 text-left hover:border-line-strong">
                <span className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                    {done >= total ? <Check size={20} aria-hidden="true" /> : <ListChecks size={20} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-callout font-semibold">{g.title}</span>
                    <span className="block text-caption text-fg-subtle">
                      {plural(total, "step")}{membership ? ` · ${done >= total ? "Finished" : done ? `${done} done` : "Not started"}` : ""}
                    </span>
                  </span>
                </span>
                {membership && (
                  <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar"
                    aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                    <span className="block h-full bg-accent transition-[width] duration-standard" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <GuideView group={group} guide={open} canTrack={!!membership} moderator={moderator}
          done={progress[open.id] || []}
          onProgress={(list) => setProgress((p) => ({ ...p, [open.id]: list }))}
          onEdit={() => { setEditing(open); setOpen(null); }}
          onClose={() => setOpen(null)} />
      )}
      {editing && (
        <GuideEditor group={group} guide={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function GuideView({ group, guide, done, canTrack, moderator, onProgress, onEdit, onClose }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  // Resume at the first incomplete step.
  const [current, setCurrent] = useState(() => Math.max(0, guide.unitTitles.findIndex((_, i) => !done.includes(i))));
  useEffect(() => { if (moderator) fetchGuideCompletions(group.id, guide).then(setStats).catch(() => {}); }, [moderator, group.id, guide]);

  const toggle = async (i) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    onProgress(next);
    try { await setGuideProgress(group.id, guide.id, next); }
    catch { onProgress(done); toast({ tone: "error", title: "Couldn't save your progress" }); }
    if (!done.includes(i) && i + 1 < guide.unitTitles.length) setCurrent(i + 1);
  };

  return (
    <Dialog title={guide.title} onClose={onClose} size="lg">
      {moderator && (
        <div className="mb-4 flex items-center gap-2">
          <p className="flex-1 text-caption text-fg-subtle">{stats ? `${plural(stats.started, "member")} started, ${stats.finished} finished` : ""}</p>
          <Button size="sm" onClick={onEdit}>Edit</Button>
        </div>
      )}
      <ol className="space-y-2">
        {guide.unitTitles.map((t, i) => {
          const isDone = done.includes(i);
          const expanded = current === i;
          return (
            <li key={i} className={`rounded-card border ${expanded ? "border-accent-text/40 bg-surface" : "border-line"}`}>
              <div className="flex items-center gap-3 p-3">
                {canTrack ? (
                  <button type="button" onClick={() => toggle(i)} aria-pressed={isDone} aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${t}`}
                    className={`press flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${
                      isDone ? "bg-success-text text-canvas ring-success-text" : "text-fg-subtle ring-line-strong hover:text-fg"
                    }`}>
                    {isDone ? <Check size={16} aria-hidden="true" /> : <span className="text-label font-bold">{i + 1}</span>}
                  </button>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label font-bold text-fg-subtle ring-1 ring-line">{i + 1}</span>
                )}
                <button type="button" onClick={() => setCurrent(expanded ? -1 : i)} aria-expanded={expanded}
                  className={`min-w-0 flex-1 text-left text-callout font-semibold ${isDone ? "text-fg-muted line-through decoration-fg-subtle" : "text-fg"}`}>
                  {t}
                </button>
              </div>
              {expanded && guide.unitBodies[i] && (
                <div className="px-3 pb-4 pl-14">
                  <RichText text={guide.unitBodies[i]} className="text-callout text-fg" />
                  {canTrack && !isDone && (
                    <Button size="sm" variant="primary" icon={Check} className="mt-3" onClick={() => toggle(i)}>Done</Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canTrack && done.length >= guide.unitTitles.length && (
        <p role="status" className="mt-4 rounded-control bg-success-text/10 p-3 text-center text-callout font-semibold text-success-text">Finished. Nice work.</p>
      )}
    </Dialog>
  );
}

function GuideEditor({ group, guide, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(guide?.title || "");
  const [units, setUnits] = useState(guide ? guide.unitTitles.map((t, i) => ({ title: t, body: guide.unitBodies[i] || "" })) : [{ title: "", body: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (i, k, v) => setUnits((u) => u.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i, d) => setUnits((u) => { const n = [...u]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  const save = async () => {
    const clean = units.filter((u) => u.title.trim());
    if (title.trim().length < 2) return setError("Give the guide a title.");
    if (!clean.length) return setError("Add at least one step with a title.");
    const mod = checkContent(`${title}\n${clean.map((u) => `${u.title}\n${u.body}`).join("\n")}`, { key: "guide", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    try {
      await saveGuide(group.id, { ...guide, title, units: clean });
      toast({ title: guide ? "Guide saved" : "Guide published" });
      onSaved();
    } catch {
      setBusy(false);
      setError("Couldn't save the guide. Check your connection and try again.");
    }
  };

  return (
    <Dialog title={guide ? "Edit guide" : "New guide"} onClose={busy ? undefined : onClose} size="lg"
      footer={
        <div className="space-y-2">
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <div className="flex items-center gap-2">
            {guide && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <span className="flex-1" />
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{guide ? "Save" : "Publish"}</Button>
          </div>
        </div>
      }>
      <Field label="Title" count={title.length} max={100}>
        <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Welcome to the circle" />
      </Field>
      <ol className="mt-5 space-y-4">
        {units.map((u, i) => (
          <li key={i} className="rounded-card border border-line p-3">
            <div className="mb-2 flex items-center gap-1">
              <span className="flex-1 text-label font-semibold uppercase tracking-wider text-fg-subtle">Step {i + 1}</span>
              <IconButton icon={ArrowUp} label={`Move step ${i + 1} up`} size={16} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label={`Move step ${i + 1} down`} size={16} disabled={i === units.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon={Trash2} label={`Remove step ${i + 1}`} size={16} disabled={units.length === 1}
                onClick={() => setUnits((list) => list.filter((_, j) => j !== i))} />
            </div>
            <Input aria-label={`Step ${i + 1} title`} value={u.title} maxLength={100} placeholder="Say hello in the discussion"
              onChange={(e) => update(i, "title", e.target.value)} />
            <Textarea aria-label={`Step ${i + 1} details`} className="mt-2" autoGrow rows={2} maxRows={8} value={u.body} maxLength={2000}
              placeholder="What to do, and why it helps." onChange={(e) => update(i, "body", e.target.value)} />
          </li>
        ))}
      </ol>
      <Button className="mt-3" icon={Plus} disabled={units.length >= 20} onClick={() => setUnits((u) => [...u, { title: "", body: "" }])}>Add a step</Button>
      {confirmDelete && (
        <ConfirmDialog title="Delete this guide?" confirmLabel="Delete guide" body="Members' progress goes with it."
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => { await deleteGuide(group.id, guide.id).catch(() => {}); onSaved(); }} />
      )}
    </Dialog>
  );
}
