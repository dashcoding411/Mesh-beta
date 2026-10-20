import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowDown, ArrowUp, Trash2, Plus, ImagePlus, History, Eye, Send, Scale, Radio, Users, X, Check, Info,
  Heading2, Heading3, Pilcrow, Quote, List, Image as ImageIcon, Minus, BookmarkPlus, Pencil, Timer, RefreshCw, TriangleAlert, Clapperboard,
} from "lucide-react";
import {
  listenStory, saveStory, publishStory, publishUpdate, reopenStory, saveRevision, fetchRevisions, listenStoryPresence, setStoryPresence,
  clearStoryPresence, coAuthorFor, uploadMedia, deleteNews, me, MAX_CLOUD_BYTES,
  fetchJournalist, acceptJournalistAgreement, JOURNALIST_AGREEMENT, AGREEMENT_VERSION,
} from "../../lib/db";
import { mergeStory, newBlock, storyStats, reviewProblems, same, MAX_BLOCKS, legalRisks, STORY_LABELS } from "../../lib/storyDoc";
import { NEWS_TOPICS } from "../../lib/interests";
import { checkContent } from "../../lib/moderation";
import { goBack, navigate } from "../../lib/router";
import { relativeTime } from "../../lib/format";
import { useShell } from "../shell/ShellContext";
import { StoryBody } from "./StoryBody";
import { KindBadge, TopicLabel } from "./parts";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import Badge from "../ui/Badge";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import Segmented from "../ui/Segmented";
import Switch from "../ui/Switch";
import MediaImg from "../ui/MediaImg";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/Field";
import { EmptyState, InlineMessage, Skeleton, Spinner } from "../ui/States";
import { useToast } from "../ui/toast-context";
import { usePageTitle } from "../../lib/usePageTitle";
import { uploadProblem } from "../../lib/imageCheck";
import { readDuration, uploadPoster } from "../../lib/videoFile";

const TYPE_ICONS = { p: Pilcrow, h2: Heading2, h3: Heading3, quote: Quote, list: List, image: ImageIcon, divider: Minus };
const TEXT_TYPES = [["p", "Paragraph"], ["h2", "Heading"], ["h3", "Subheading"], ["quote", "Quote"], ["list", "List"]];
const ADDABLE = [["p", "Paragraph"], ["h2", "Heading"], ["quote", "Quote"], ["list", "List"], ["image", "Image"], ["divider", "Divider"]];
const PRESENCE_MS = 2 * 60 * 1000;

// Collaborative block editor: debounced versioned saves with three-way
// merge (storyDoc.mergeStory) and per-block presence locks.
export default function StoryEditor({ id }) {
  const toast = useToast();
  const { profile } = useShell();
  const [base, setBase] = useState(null); // last saved
  const [local, setLocal] = useState(null); // working copy
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [presence, setPresenceList] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [dialog, setDialog] = useState(null); // "publish" | "update" | "history" | "preview"
  // Editing a published story; nothing reaches readers until "Publish update".
  const [updating, setUpdating] = useState(() => new URLSearchParams(window.location.search).has("update"));
  const baseRef = useRef(null);
  const localRef = useRef(null);
  useEffect(() => { baseRef.current = base; }, [base]);
  useEffect(() => { localRef.current = local; }, [local]);
  usePageTitle(local?.title ? `Editing: ${local.title}` : "New story", 2);

  // Merge co-authors' saves into the working copy.
  useEffect(() => listenStory(id, (server) => {
    if (!server) { setMissing(true); return; }
    const b = baseRef.current;
    if (!b) { setBase(server); setLocal(server); return; }
    if (server.version <= b.version) return;
    setLocal((cur) => (cur && !same(cur, b) ? mergeStory(b, server, cur) : server));
    setBase(server);
  }, () => setMissing(true)), [id]);

  useEffect(() => listenStoryPresence(id, setPresenceList), [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(t); clearStoryPresence(id); };
  }, [id]);

  const published = local?.status === "approved";
  const editable = local && (["draft", "rejected", "pending"].includes(local.status) || (published && updating));
  const dirty = !!local && !!base && !same(local, base);
  const lead = local?.authorId === me();

  // Debounced save; edits made during a save are rebased onto its result.
  const save = useCallback(async () => {
    const b = baseRef.current;
    const mine = localRef.current;
    if (!b || !mine || same(b, mine) || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const { story, merged } = await saveStory(id, b, mine);
      setBase(story);
      setLocal((cur) => (same(cur, mine) ? story : mergeStory(mine, story, cur)));
      setSavedAt(Date.now());
      if (merged) toast({ title: "Merged with a co-author's changes" });
    } catch (err) {
      console.error(err);
      setSaveError(err?.code === "permission-denied"
        ? "Couldn't save: something in the story isn't allowed (check the sources and images), or you're no longer a writer."
        : "Couldn't save. Check your connection. Your changes are still here.");
    } finally { setSaving(false); }
  }, [id, saving, toast]);

  useEffect(() => {
    // Published stories only change when the update is published.
    if (!dirty || !editable || published) return undefined;
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [local, dirty, editable, published, save]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const lockedBy = useMemo(() => {
    const map = {};
    for (const p of presence) {
      const at = p.at?.toMillis?.() || 0;
      if (p.uid !== me() && now - at < PRESENCE_MS) map[p.blockId] = p.username;
    }
    return map;
  }, [presence, now]);
  const lastPing = useRef({ block: "", at: 0 });
  const focusBlock = (blockId) => {
    const t = Date.now();
    if (lastPing.current.block === blockId && t - lastPing.current.at < 45000) return;
    lastPing.current = { block: blockId, at: t };
    setStoryPresence(id, blockId, profile.username).catch(() => {});
  };

  const update = (patch) => setLocal((s) => ({ ...s, ...patch }));
  const updateBlock = (blockId, patch) => setLocal((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }));
  const insertBlock = (index, type) => setLocal((s) => {
    if (s.blocks.length >= MAX_BLOCKS) return s;
    const blocks = [...s.blocks];
    blocks.splice(index, 0, newBlock(type));
    return { ...s, blocks };
  });
  const moveBlock = (i, d) => setLocal((s) => {
    const blocks = [...s.blocks];
    [blocks[i], blocks[i + d]] = [blocks[i + d], blocks[i]];
    return { ...s, blocks };
  });
  const removeBlock = (blockId) => setLocal((s) => ({ ...s, blocks: s.blocks.length > 1 ? s.blocks.filter((b) => b.id !== blockId) : s.blocks }));
  // Pasting a draft from Docs or Word: each paragraph becomes its own block,
  // and lines starting with # or ## become headings.
  const pasteBlocks = (blockId, before, chunks, after) => setLocal((s) => {
    const i = s.blocks.findIndex((b) => b.id === blockId);
    if (i === -1) return s;
    const typed = chunks.map((c) => {
      const m = c.match(/^(#{1,3})\s+(.*)$/);
      return m ? newBlock(m[1].length === 1 ? "h2" : "h3", m[2]) : newBlock("p", c);
    });
    const first = { ...s.blocks[i], text: before + (typed[0].type === "p" ? typed[0].text : "") };
    const rest = typed[0].type === "p" ? typed.slice(1) : typed;
    if (after) rest.push(newBlock("p", after));
    const blocks = [...s.blocks.slice(0, i), first, ...rest, ...s.blocks.slice(i + 1)].slice(0, MAX_BLOCKS);
    return { ...s, blocks };
  });

  if (missing) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState icon={Info} title="This story isn't available" body="It may have been deleted, or you're not one of its authors."
          action={<Button onClick={() => navigate("/news/desk")}>Back to the newsroom</Button>} />
      </div>
    );
  }
  if (!local) {
    return <div className="mx-auto w-full max-w-5xl space-y-3 p-6" role="status" aria-label="Loading story"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40" /></div>;
  }

  const stats = storyStats(local);
  const status = saving ? "Saving…" : saveError ? "Not saved" : dirty ? "Unsaved changes" : savedAt ? `Saved ${relativeTime(savedAt)}` : `Version ${local.version}`;

  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto scroll-pt-20">
      <header className="sticky top-0 z-nav flex min-h-14 flex-wrap items-center gap-2 border-b border-line bg-canvas/90 px-2 py-2 pt-safe backdrop-blur glass-solid md:px-4">
        <IconButton icon={ArrowLeft} label="Back to the newsroom" onClick={() => goBack("/news/desk")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-callout font-semibold">{local.title || "Untitled story"}</p>
          <p className="flex items-center gap-1.5 text-caption text-fg-subtle" aria-live="polite">
            {saving && <Spinner size={12} />} {status}
            {local.format === "live" && <Badge tone="danger" icon={Radio}>Live blog</Badge>}
          </p>
        </div>
        <AuthorsStrip names={local.authorNames} uids={local.authors} presence={presence} now={now} />
        <Button size="sm" variant="ghost" icon={History} onClick={() => setDialog("history")}>History</Button>
        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setDialog("preview")}>Preview</Button>
        {editable && !published && local.authorId === me() && (
          <IconButton icon={Trash2} label="Delete draft" onClick={() => setDialog("delete")} />
        )}
        {editable && !published && <Button size="sm" variant="primary" icon={Send} onClick={() => setDialog("publish")}>Publish</Button>}
        {published && !updating && local.authors.includes(me()) && (
          <Button size="sm" variant="primary" icon={Pencil} onClick={() => setUpdating(true)}>Update story</Button>
        )}
        {published && updating && (
          <>
            <Button size="sm" variant="ghost" onClick={() => { setLocal(base); setUpdating(false); }}>Discard changes</Button>
            <Button size="sm" variant="primary" icon={RefreshCw} disabled={!dirty} onClick={() => setDialog("update")}>Publish update</Button>
          </>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 pt-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0">
          {published && !updating && (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-card border border-line bg-surface-2 p-3 text-callout text-fg-muted">
              <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Published{local.readCount ? `, read by ${local.readCount.toLocaleString()} ${local.readCount === 1 ? "person" : "people"}` : ""}.
                For new information, choose <strong>Update story</strong>: it stays up and readers see what changed. To fix a mistake, add a correction from the story page.
              </span>
            </p>
          )}
          {published && updating && (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-card border border-accent-text/30 bg-accent-soft/40 p-3 text-callout">
              <RefreshCw size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
              Updating a published story. Readers keep seeing the current version until you publish the update.
            </p>
          )}
          {local.status === "draft" && local.reviewNote && (
            <p role="status" className="mb-4 rounded-card border border-warning-text/30 bg-warning-text/10 p-3 text-callout text-warning-text">
              <strong>Note from Mesh:</strong> {local.reviewNote}
            </p>
          )}
          {local.status === "rejected" && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-danger-text/30 bg-danger/10 p-3">
              <p className="min-w-0 flex-1 text-callout text-danger-text">Not published.{local.reviewNote ? ` ${local.reviewNote}` : ""}</p>
              <Button size="sm" onClick={async () => {
                try { const { story } = await reopenStory(id, base, local); setBase(story); setLocal(story); } catch { toast({ tone: "error", title: "Couldn't reopen it" }); }
              }}>Work on it again</Button>
            </div>
          )}
          {saveError && <InlineMessage>{saveError}</InlineMessage>}

          <LockNote who={lockedBy.title} />
          <label htmlFor="story-title" className="sr-only">Headline</label>
          <Textarea id="story-title" autoGrow rows={1} maxRows={4} value={local.title} maxLength={200} readOnly={!editable || !!lockedBy.title}
            placeholder="Headline" onFocus={() => focusBlock("title")} onChange={(e) => update({ title: e.target.value.replace(/\n/g, " ") })}
            className="!border-transparent !bg-transparent !px-0 font-display !text-[2rem] !font-extrabold !leading-tight hover:!border-transparent focus:!ring-0" />
          <LockNote who={lockedBy.standfirst} />
          <label htmlFor="story-standfirst" className="sr-only">Standfirst</label>
          <Textarea id="story-standfirst" autoGrow rows={1} maxRows={5} value={local.standfirst} maxLength={300} readOnly={!editable || !!lockedBy.standfirst}
            placeholder="Standfirst: the story in a sentence or two" onFocus={() => focusBlock("standfirst")}
            onChange={(e) => update({ standfirst: e.target.value })}
            className="!border-transparent !bg-transparent !px-0 !text-title-3 !font-normal !text-fg-muted hover:!border-transparent focus:!ring-0" />

          <div className="mt-4 space-y-1">
            {local.blocks.map((b, i) => (
              <div key={b.id}>
                <BlockEditor block={b} index={i} count={local.blocks.length} editable={editable} lockedBy={lockedBy[b.id]}
                  onFocus={() => focusBlock(b.id)} onChange={(patch) => updateBlock(b.id, patch)}
                  onPasteBlocks={(before, chunks, after) => pasteBlocks(b.id, before, chunks, after)}
                  onMove={(d) => moveBlock(i, d)} onRemove={() => removeBlock(b.id)} />
                {editable && <AddBlock onAdd={(type) => insertBlock(i + 1, type)} />}
              </div>
            ))}
          </div>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <DetailsPanel story={local} editable={editable} lead={lead} update={update} stats={stats} onSaveVersion={async () => {
            try { await saveRevision(id, local, "Saved by hand"); toast({ title: "Version saved", body: "Find it in History." }); }
            catch { toast({ tone: "error", title: "Couldn't save that version" }); }
          }} />
        </aside>
      </div>

      {dialog === "publish" && (
        <PublishDialog story={local} onClose={() => setDialog(null)} onPublish={async () => {
          await save();
          const { story } = await publishStory(id, baseRef.current, localRef.current);
          setBase(story); setLocal(story);
          setDialog(null);
          toast({ title: "Published", body: "Your story is now live on Mesh, under your name." });
          navigate(`/news/${id}`);
        }} />
      )}
      {dialog === "history" && (
        <HistoryDialog id={id} onClose={() => setDialog(null)} canRestore={editable}
          onRestore={(rev) => { update({ title: rev.title, standfirst: rev.standfirst, blocks: rev.blocks, sources: rev.sources }); setDialog(null); toast({ title: "Restored", body: "It saves in a moment, as the next version." }); }} />
      )}
      {dialog === "preview" && <PreviewDialog story={local} onClose={() => setDialog(null)} />}
      {dialog === "update" && (
        <UpdateDialog story={local} onClose={() => setDialog(null)} onPublish={async (note) => {
          const { story } = await publishUpdate(id, baseRef.current, localRef.current, note);
          setBase(story); setLocal(story);
          setUpdating(false);
          setDialog(null);
          toast({ title: "Update published", body: "Readers now see the new version, marked as updated." });
        }} />
      )}
      {dialog === "delete" && (
        <ConfirmDialog title="Delete this draft?" confirmLabel="Delete draft"
          body="The draft and its history will be permanently deleted for you and any co-authors. This can't be undone."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try { await deleteNews(id); toast({ title: "Draft deleted" }); navigate("/news/desk", { replace: true }); }
            catch { toast({ tone: "error", title: "The draft could not be deleted" }); setDialog(null); }
          }} />
      )}
    </div>
  );
}

function LockNote({ who }) {
  if (!who) return null;
  return <p className="mb-1 flex items-center gap-1.5 text-label font-semibold text-warning-text"><span className="h-2 w-2 animate-pulse rounded-full bg-warning-text" aria-hidden="true" />@{who} is editing this</p>;
}

function AuthorsStrip({ names, uids, presence, now }) {
  const active = new Set(presence.filter((p) => now - (p.at?.toMillis?.() || 0) < PRESENCE_MS).map((p) => p.uid));
  return (
    <ul className="hidden items-center -space-x-1.5 sm:flex" aria-label="Authors">
      {uids.map((u, i) => (
        <li key={u} title={`@${names[i]}${active.has(u) ? " (here now)" : ""}`}
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-label font-bold text-white ${active.has(u) ? "border-success-text" : "border-canvas"} bg-violet-700`}>
          {(names[i] || "?").slice(0, 2).toUpperCase()}
        </li>
      ))}
    </ul>
  );
}

function BlockEditor({ block, index, count, editable, lockedBy, onFocus, onChange, onMove, onRemove, onPasteBlocks }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const readOnly = !editable || !!lockedBy;
  const Icon = TYPE_ICONS[block.type] || Pilcrow;
  const textClass = {
    p: "!text-body", h2: "!text-title-2 !font-bold", h3: "!text-title-3 !font-semibold",
    quote: "!text-title-3 !font-semibold font-display border-l-4 border-accent-text !pl-4", list: "!text-body",
  }[block.type] || "";

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ tone: "error", title: "Choose an image" });
    setUploading(true);
    try { const { url } = await uploadMedia(file, undefined, "news"); onChange({ media: url }); }
    catch (err) { toast({ tone: "error", title: uploadProblem(err, "Couldn't upload that image") }); }
    finally { setUploading(false); }
  };

  return (
    <div className={`group relative rounded-control px-2 py-1 transition-colors ${lockedBy ? "bg-warning-text/5 ring-1 ring-warning-text/40" : "focus-within:bg-surface"}`}
      onFocusCapture={onFocus}>
      <LockNote who={lockedBy} />
      {editable && !lockedBy && (
        <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-full border border-line bg-surface-2 px-1 py-0.5 shadow-raised group-focus-within:flex group-hover:flex">
          {block.type !== "image" && block.type !== "divider" && (
            <Select aria-label="Block type" value={block.type} onChange={(e) => onChange({ type: e.target.value })}
              className="!min-h-7 !w-auto !rounded-full !border-0 !bg-transparent !py-0 !text-label">
              {TEXT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          )}
          <IconButton icon={ArrowUp} label="Move up" size={14} disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} label="Move down" size={14} disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton icon={Trash2} label="Remove block" size={14} disabled={count === 1} onClick={onRemove} />
        </div>
      )}
      <span className="sr-only">{TEXT_TYPES.find(([v]) => v === block.type)?.[1] || block.type}</span>
      {block.type === "divider" ? (
        <hr className="my-4 border-line" aria-label="Divider" />
      ) : block.type === "image" ? (
        <div className="space-y-2 py-2">
          {block.media ? (
            <MediaImg src={block.media} alt={block.alt || ""} className="w-full rounded-card object-cover" placeholderClass="aspect-[16/9] w-full rounded-card" />
          ) : (
            <button type="button" disabled={readOnly || uploading} onClick={() => fileRef.current?.click()}
              className="press flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-field text-callout font-semibold text-fg-muted hover:text-fg">
              {uploading ? <Spinner /> : <ImagePlus size={28} aria-hidden="true" />} Add an image
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
          {block.media && editable && !lockedBy && <Button size="sm" variant="ghost" icon={ImagePlus} onClick={() => fileRef.current?.click()}>Replace image</Button>}
          <Input aria-label="Caption" value={block.text} readOnly={readOnly} maxLength={400} placeholder="Caption, with its credit or source [1]"
            onChange={(e) => onChange({ text: e.target.value })} />
          <Input aria-label="Image description (alt text)" value={block.alt} readOnly={readOnly} maxLength={400}
            placeholder="Describe the image for people who can't see it" onChange={(e) => onChange({ alt: e.target.value })} />
        </div>
      ) : (
        <div className="flex gap-2">
          <Icon size={14} className="mt-3 shrink-0 text-fg-subtle opacity-0 group-focus-within:opacity-100" aria-hidden="true" />
          <Textarea aria-label={TEXT_TYPES.find(([v]) => v === block.type)?.[1]} autoGrow rows={1} maxRows={40} value={block.text} readOnly={readOnly}
            maxLength={8000} onChange={(e) => onChange({ text: e.target.value })}
            onPaste={(e) => {
              if (block.type === "list" || readOnly) return;
              const pasted = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
              const chunks = pasted.split(/\n\s*\n|\n/).map((c) => c.trim()).filter(Boolean);
              if (chunks.length < 2) return;
              e.preventDefault();
              const el = e.currentTarget;
              onPasteBlocks(block.text.slice(0, el.selectionStart), chunks, block.text.slice(el.selectionEnd));
            }}
            placeholder={{ p: "Write, and cite sources by number like [1]", h2: "Heading", h3: "Subheading", quote: "A quote worth pulling out", list: "One item per line" }[block.type]}
            className={`!border-transparent !bg-transparent !px-0 !py-1 hover:!border-transparent focus:!ring-0 ${textClass}`} />
        </div>
      )}
    </div>
  );
}

function AddBlock({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex h-6 items-center justify-center opacity-40 transition-opacity focus-within:opacity-100 hover:opacity-100">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Add a block here"
        className="press mx-2 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-muted hover:text-fg">
        <Plus size={14} aria-hidden="true" />
      </button>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      {open && (
        <div className="absolute top-7 z-sheet flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
          {ADDABLE.map(([type, label]) => {
            const I = TYPE_ICONS[type];
            return (
              <button key={type} type="button" onClick={() => { onAdd(type); setOpen(false); }}
                className="press flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-callout text-fg hover:bg-surface-2">
                <I size={15} aria-hidden="true" /> {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailsPanel({ story, editable, lead, update, stats, onSaveVersion }) {
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const coverRef = useRef(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const videoRef = useRef(null);
  const [videoProgress, setVideoProgress] = useState(null); // null when idle
  const sourcesText = story.sources.join("\n");
  const cls = "rounded-card border border-line bg-surface p-4";

  const addAuthor = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const a = await coAuthorFor(handle.trim().replace(/^@/, "").toLowerCase());
      if (story.authors.includes(a.id)) throw new Error("Already an author.");
      if (story.authors.length >= 4) throw new Error("A story can have up to three co-authors.");
      update({ authors: [...story.authors, a.id], authorNames: [...story.authorNames, a.username] });
      setHandle("");
    } catch (err) { toast({ tone: "error", title: err.message }); }
    finally { setAdding(false); }
  };

  return (
    <>
      <section className={cls} aria-label="Story details">
        <Segmented label="Format" value={story.format} onChange={(v) => editable && story.status !== "approved" && update({ format: v })} className="mb-4"
          options={[{ id: "story", label: "Story" }, { id: "live", label: "Live blog" }]} />
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-callout font-medium">What kind of piece</legend>
          <div role="radiogroup" aria-label="What kind of piece" className="grid grid-cols-2 gap-1.5">
            {STORY_LABELS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={story.label === l.id} disabled={!editable}
                onClick={() => update({ label: l.id })} title={l.blurb}
                className={`press min-h-10 rounded-control border px-2 text-callout font-semibold disabled:opacity-60 ${story.label === l.id ? "border-accent bg-accent-soft text-fg" : "border-field bg-surface-2 text-fg-muted"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-caption text-fg-subtle">{STORY_LABELS.find((l) => l.id === story.label)?.blurb}. Shown to readers on the story and in News.</p>
        </fieldset>
        <div className="space-y-3">
          <Field label="Topic">
            <Select value={story.topic} disabled={!editable} onChange={(e) => update({ topic: e.target.value })}>
              {NEWS_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Where" optional>
            <Input value={story.location} readOnly={!editable} maxLength={80} placeholder="Melbourne" onChange={(e) => update({ location: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1.5 text-callout font-medium">Cover</p>
            {story.coverUrl ? (
              <MediaImg src={story.coverUrl} alt="Cover" className="aspect-[16/9] w-full rounded-control object-cover" placeholderClass="aspect-[16/9] w-full rounded-control" />
            ) : null}
            {editable && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" icon={ImagePlus} loading={coverBusy} onClick={() => coverRef.current?.click()}>{story.coverUrl ? "Change" : "Add a cover"}</Button>
                {story.coverUrl && <Button size="sm" variant="ghost" onClick={() => update({ coverUrl: "" })}>Remove</Button>}
              </div>
            )}
            <input ref={coverRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true" onChange={async (e) => {
              const f = e.target.files[0]; e.target.value = "";
              if (!f) return;
              setCoverBusy(true);
              try { const { url } = await uploadMedia(f, undefined, "news"); update({ coverUrl: url }); }
              catch (err) { toast({ tone: "error", title: uploadProblem(err, "Couldn't upload the cover") }); }
              finally { setCoverBusy(false); }
            }} />
          </div>
          <div>
            <p className="mb-1.5 text-callout font-medium">Flick <span className="font-normal text-fg-subtle">Optional</span></p>
            {story.videoUrl && (
              <video src={story.videoUrl} poster={story.videoPoster || undefined} controls playsInline preload="metadata"
                className="aspect-[9/16] max-h-96 w-full rounded-control bg-black object-contain" />
            )}
            {videoProgress !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Uploading the Flick" aria-valuenow={videoProgress}>
                <div className="h-full bg-accent transition-[width] duration-standard" style={{ width: `${videoProgress}%` }} />
              </div>
            )}
            {editable && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" icon={Clapperboard} loading={videoProgress !== null} onClick={() => videoRef.current?.click()}>{story.videoUrl ? "Change" : "Add a Flick"}</Button>
                {story.videoUrl && <Button size="sm" variant="ghost" onClick={() => update({ videoUrl: "", videoPoster: "", videoSeconds: 0 })}>Remove</Button>}
              </div>
            )}
            <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" tabIndex={-1} aria-hidden="true" onChange={async (e) => {
              const f = e.target.files[0]; e.target.value = "";
              if (!f) return;
              if (f.size > MAX_CLOUD_BYTES) { toast({ tone: "error", title: "That video is over 100 MB" }); return; }
              setVideoProgress(0);
              try {
                const seconds = await readDuration(f);
                const { url } = await uploadMedia(f, setVideoProgress);
                const poster = await uploadPoster(f, 0.5);
                update({ videoUrl: url, videoPoster: poster, videoSeconds: Math.round(seconds) });
              } catch (err) { toast({ tone: "error", title: uploadProblem(err, "Couldn't upload the Flick") }); }
              finally { setVideoProgress(null); }
            }} />
            {story.videoUrl && (
              <div className="mt-2">
                <Checkbox checked={!!story.graphic} onChange={(v) => editable && update({ graphic: v })}
                  description="Violence or injury, like war footage. It shows behind a warning.">
                  Graphic content
                </Checkbox>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={cls} aria-label="The 60-second version and sources">
        <p className="flex items-center gap-1.5 text-callout font-semibold"><Timer size={16} aria-hidden="true" /> The 60-second version <span className="font-normal text-fg-subtle">Required, 3 points</span></p>
        <p className="mb-2 mt-0.5 text-caption text-fg-subtle">
          It sits at the top of your story and in Quick read. Someone who reads only this should still know what happened, why it matters and what happens next. Write it yourself: Mesh never uses AI summaries.
        </p>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Input key={i} aria-label={`60-second version, point ${i + 1}`} value={story.keyPoints[i]} readOnly={!editable} maxLength={200}
              placeholder={["What happened", "Why it matters", "What happens next"][i]}
              onChange={(e) => { const k = [...story.keyPoints]; k[i] = e.target.value; update({ keyPoints: k }); }} />
          ))}
        </div>
        <Field label="Sources" className="mt-4" hint="One link per line. Cite them in the text as [1], [2]…">
          <Textarea autoGrow rows={3} maxRows={10} value={sourcesText} readOnly={!editable} placeholder={"https://…\nhttps://…"}
            onChange={(e) => update({ sources: e.target.value.split("\n") })} />
        </Field>
        <p className="mt-2 text-caption text-fg-subtle">
          {story.sources.filter((s) => s.trim()).length} listed · cited: {stats.cited.length ? stats.cited.map((n) => `[${n}]`).join(" ") : "none yet"}
        </p>
      </section>

      <section className={cls} aria-label="Authors">
        <p className="mb-2 flex items-center gap-1.5 text-callout font-semibold"><Users size={16} aria-hidden="true" /> Authors</p>
        <ul className="space-y-1">
          {story.authors.map((u, i) => (
            <li key={u} className="flex min-h-9 items-center gap-2 text-callout">
              <span className="min-w-0 flex-1 truncate">@{story.authorNames[i]}</span>
              {i === 0 ? <Badge>Lead</Badge> : lead && editable && (
                <IconButton icon={X} label={`Remove @${story.authorNames[i]}`} size={14}
                  onClick={() => update({ authors: story.authors.filter((x) => x !== u), authorNames: story.authorNames.filter((_, j) => j !== i) })} />
              )}
            </li>
          ))}
        </ul>
        {lead && editable && story.authors.length < 4 && (
          <form onSubmit={addAuthor} className="mt-2 flex gap-2">
            <Input aria-label="Co-author's handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@writer" />
            <Button type="submit" size="sm" loading={adding} disabled={handle.trim().length < 3}>Add</Button>
          </form>
        )}
        <p className="mt-2 text-caption text-fg-subtle">Co-authors must be journalists on Mesh. They see and edit the draft with you.</p>
      </section>

      <section className={cls} aria-label="Legal">
        <div className="flex items-start gap-3">
          <Scale size={18} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <label htmlFor="legal-hold" className="block text-callout font-medium">Requires legal review</label>
            <span className="block text-caption text-fg-subtle">Publishing is blocked while this is on. Turn it off once the legal review is complete.</span>
          </span>
          <Switch id="legal-hold" checked={story.legalHold} disabled={!editable} onChange={(v) => update({ legalHold: v })} />
        </div>
        {story.legalHold && (
          <Textarea className="mt-3" aria-label="What needs checking" autoGrow rows={2} value={story.legalNote} readOnly={!editable} maxLength={300}
            placeholder="What requires review, and why" onChange={(e) => update({ legalNote: e.target.value })} />
        )}
      </section>

      <section className={cls} aria-label="At a glance">
        <p className="text-caption text-fg-subtle">{stats.words} words · {stats.minutes} min read · {story.blocks.length} blocks</p>
        <div className="mt-3 rounded-control border border-line bg-surface-2 p-3" aria-label="How it looks when shared">
          <p className="text-label font-semibold uppercase tracking-wider text-fg-subtle">When shared</p>
          <p className="mt-1 line-clamp-2 text-callout font-semibold text-fg">{story.title || "Your headline"}</p>
          <p className="line-clamp-2 text-caption text-fg-muted">{story.standfirst || "Your standfirst appears here."}</p>
          {story.title.length > 70 && <p className="mt-1 text-label text-warning-text">Long headlines get cut off in link previews ({story.title.length}/70).</p>}
        </div>
        <Button size="sm" variant="ghost" icon={BookmarkPlus} className="mt-3" onClick={onSaveVersion}>Save this version</Button>
      </section>
    </>
  );
}

/**
 * Sentences naming someone beside an allegation. The journalist confirms
 * each is attributed or has been checked before it goes out.
 */
function LegalCheck({ story, checked, onChange }) {
  const risks = legalRisks(story);
  if (!risks.length) return null;
  return (
    <div className="mt-4 rounded-card border border-warning-text/40 bg-warning-text/10 p-3">
      <p className="flex items-center gap-2 text-callout font-semibold text-warning-text">
        <TriangleAlert size={16} aria-hidden="true" /> Check these for defamation
      </p>
      <p className="mt-1 text-caption text-fg-muted">
        They name someone next to an allegation without saying who makes it. Attribute each one (a court, police, a document you cite),
        or have an editor or lawyer check it. Turn on legal review if you're unsure.
      </p>
      <ul className="mt-2 space-y-1.5">
        {risks.map((s) => <li key={s} className="rounded-control bg-surface p-2 text-caption text-fg">“{s}”</li>)}
      </ul>
      <div className="mt-3">
        <Checkbox checked={checked} onChange={onChange}>Each of these is attributed, true and provable, or has been legally checked.</Checkbox>
      </div>
    </div>
  );
}

/** Publishing an update to a live story: what changed, in a note readers see. */
function UpdateDialog({ story, onClose, onPublish }) {
  const [note, setNote] = useState("");
  const [legalOk, setLegalOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const problems = reviewProblems(story);
  const words = checkContent(`${story.title}\n${story.standfirst}\n${story.blocks.map((b) => b.text).join("\n")}\n${note}`, { key: "news", skipCooldown: true, allowQuoted: true });
  const all = words.error ? [...problems, words.error] : problems;
  const risky = legalRisks(story).length > 0;
  const ready = !all.length && note.trim().length >= 3 && !story.legalHold && (!risky || legalOk);
  return (
    <Dialog title="Publish an update" onClose={busy ? undefined : onClose} size="md"
      footer={
        <div className="space-y-2">
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} disabled={busy}>Keep editing</Button>
            <Button variant="primary" icon={RefreshCw} loading={busy} disabled={!ready} onClick={async () => {
              setBusy(true); setError("");
              try { await onPublish(note); } catch (err) { console.error(err); setBusy(false); setError("The update couldn't be published. Check your connection and try again."); }
            }}>Publish update</Button>
          </div>
        </div>
      }>
      <p className="text-callout text-fg-muted">The story stays up. Readers see it marked as updated, with your note, and the change is kept in History.</p>
      <Field label="What's new" className="mt-3" count={note.length} max={200} hint="For example: Adds a statement from the council. Fixing a mistake? Add a correction instead.">
        <Input value={note} maxLength={200} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="Adds police statement" />
      </Field>
      {all.length > 0 && (
        <ul className="mt-3 space-y-1.5">{all.map((p) => <li key={p} className="flex gap-2 text-callout"><X size={16} className="mt-0.5 shrink-0 text-danger-text" aria-hidden="true" />{p}</li>)}</ul>
      )}
      {story.legalHold && <p className="mt-3 rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">This story is marked as requiring legal review, so the update can't go out yet.</p>}
      <LegalCheck story={story} checked={legalOk} onChange={setLegalOk} />
    </Dialog>
  );
}

// The journalist agreement, shown before your first story (and when it changes).
function AgreementCard({ onAccepted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-4 rounded-card border border-accent-text/40 bg-accent-soft p-4">
      <p className="text-callout font-semibold">Before your first story: the journalist agreement</p>
      <dl className="mt-3 space-y-2.5">
        {JOURNALIST_AGREEMENT.map(([term, text]) => (
          <div key={term}>
            <dt className="text-callout font-medium text-fg">{term}</dt>
            <dd className="text-caption text-fg-muted">{text}</dd>
          </div>
        ))}
      </dl>
      <div aria-live="polite" className="mt-2"><InlineMessage>{error}</InlineMessage></div>
      <Button size="sm" variant="primary" className="mt-3" loading={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await acceptJournalistAgreement(); onAccepted(); }
        catch { setError("Couldn't save that. Check your connection and try again."); setBusy(false); }
      }}>I agree</Button>
    </div>
  );
}

function PublishDialog({ story, onClose, onPublish }) {
  const [attest, setAttest] = useState(false);
  const [legalOk, setLegalOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // null while checking; true once the current agreement is accepted.
  const [agreed, setAgreed] = useState(null);
  useEffect(() => {
    fetchJournalist(me()).then((j) => setAgreed(!!j?.agreedAt && j.agreementVersion === AGREEMENT_VERSION)).catch(() => setAgreed(false));
  }, []);
  const problems = reviewProblems(story);
  const words = checkContent(`${story.title}\n${story.standfirst}\n${story.blocks.map((b) => b.text).join("\n")}`, { key: "news", skipCooldown: true, allowQuoted: true });
  const all = words.error ? [...problems, words.error] : problems;
  const legalBlocked = legalRisks(story).length > 0 && !legalOk;
  return (
    <Dialog title="Publish this story" onClose={busy ? undefined : onClose} size="md"
      footer={
        <div className="space-y-2">
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} disabled={busy}>Keep editing</Button>
            <Button variant="primary" icon={Send} loading={busy} disabled={all.length > 0 || !attest || !agreed || story.legalHold || legalBlocked} onClick={async () => {
              setBusy(true); setError("");
              try { await onPublish(); } catch (err) { console.error(err); setBusy(false); setError("The story could not be published. Check your connection and that the story has saved, then try again."); }
            }}>Publish</Button>
          </div>
        </div>
      }>
      {all.length > 0 ? (
        <>
          <p className="text-callout text-fg-muted">Before publishing, the following must be resolved:</p>
          <ul className="mt-2 space-y-1.5">{all.map((p) => <li key={p} className="flex gap-2 text-callout"><X size={16} className="mt-0.5 shrink-0 text-danger-text" aria-hidden="true" />{p}</li>)}</ul>
        </>
      ) : (
        <p className="flex items-center gap-2 text-callout text-success-text"><Check size={16} aria-hidden="true" /> The headline, body, sources and citations are complete.</p>
      )}
      {story.legalHold && <p className="mt-3 rounded-control bg-warning-text/10 p-3 text-caption text-warning-text">This story is marked as requiring legal review. Clear that mark in the story details once the review is complete, then publish.</p>}
      <LegalCheck story={story} checked={legalOk} onChange={setLegalOk} />
      {agreed === false && <AgreementCard onAccepted={() => setAgreed(true)} />}
      <div className="mt-4 rounded-card border border-line bg-surface p-3">
        <Checkbox checked={attest} onChange={setAttest} description="Your confirmation is recorded with the story.">
          I confirm this story is accurate to the best of my knowledge, that its sources are cited, and that no image, footage, audio or quotation in it was generated or altered by AI to appear genuine.
        </Checkbox>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ id, onClose, onRestore, canRestore }) {
  const [list, setList] = useState(null);
  const [viewing, setViewing] = useState(null);
  useEffect(() => { fetchRevisions(id).then(setList).catch(() => setList([])); }, [id]);
  if (viewing) return <PreviewDialog story={{ ...viewing, keyPoints: [], coverUrl: "" }} onClose={() => setViewing(null)} title={`Version ${viewing.version}`} />;
  return (
    <Dialog title="History" onClose={onClose}>
      <p className="mb-3 text-caption text-fg-subtle">Saved versions can't be changed or deleted, so this is a true record.</p>
      {list === null ? <Skeleton className="h-20" /> : list.length === 0 ? (
        <p className="text-callout text-fg-subtle">No saved versions yet. One is kept when you publish, and whenever you choose "Save this version".</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-callout font-medium">{r.note || `Version ${r.version}`}</span>
                <span className="block text-caption text-fg-subtle">@{r.byName} · {r.at?.toMillis ? relativeTime(r.at.toMillis()) : "just now"} · version {r.version}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>View</Button>
              {canRestore && <Button size="sm" onClick={() => onRestore(r)}>Restore</Button>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function PreviewDialog({ story, onClose, title = "Preview" }) {
  return (
    <Dialog title={title} onClose={onClose} variant="full" size="xl">
      <article>
        <p className="flex items-center gap-2 text-label"><KindBadge id={story.label} /><TopicLabel id={story.topic} />{story.format === "live" && <Badge tone="danger" icon={Radio}>Live</Badge>}</p>
        <h1 className="mt-2 font-display text-title-1">{story.title || "Untitled story"}</h1>
        {story.standfirst && <p className="mt-2 text-title-3 font-normal text-fg-muted">{story.standfirst}</p>}
        {story.coverUrl && <MediaImg src={story.coverUrl} alt="" className="mt-4 aspect-[16/9] w-full rounded-card object-cover" placeholderClass="mt-4 aspect-[16/9] w-full rounded-card" />}
        <StoryBody story={{ id: story.id || "preview", blocks: story.blocks, sources: story.sources.filter((s) => s.trim()), keyPoints: story.keyPoints }} />
      </article>
    </Dialog>
  );
}
