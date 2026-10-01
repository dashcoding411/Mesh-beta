import { lazy, Suspense, useRef, useState } from "react";
import { ImagePlus, Landmark, MapPin, Newspaper, PenLine, Trash2 } from "lucide-react";
import { newsTopicById } from "../../lib/interests";
import { forgetJournalist, useJournalist } from "../../lib/journalists";
import { useLiveCard } from "../../lib/profileCache";
import { openUserProfile, saveJournalist, uploadMedia, me } from "../../lib/db";
import { navigate } from "../../lib/router";
import { Meta, TopicLabel } from "./parts";
import LiveAvatar from "../ui/LiveAvatar";
import MediaImg from "../ui/MediaImg";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import { EmptyState, InlineMessage, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";

const PhotoCropper = lazy(() => import("../ui/PhotoCropper"));

const outletOf = (j) => j?.outlet || "Independent journalist";

/** The outlet's logo, or the journalist's photo when they have none. */
function Mark({ uid, journalist, username, size }) {
  if (journalist?.logoUrl) {
    return (
      <span className="shrink-0 overflow-hidden rounded-[22%] bg-surface-2" style={{ width: size, height: size }}>
        <MediaImg src={journalist.logoUrl} alt="" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
      </span>
    );
  }
  return <LiveAvatar uid={uid} profile={{ username }} size={size} />;
}

function Affiliation({ value }) {
  if (!value) return null;
  return <Badge tone="warning" icon={Landmark}>Political affiliation: {value}</Badge>;
}

/** One author on a story: logo, name, outlet, region and any affiliation. */
export function Byline({ uid, username }) {
  const journalist = useJournalist(uid);
  const card = useLiveCard(uid, { username });
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => openUserProfile(uid)} className="press shrink-0" aria-label={`${card.name || username}'s profile`}>
        <Mark uid={uid} journalist={journalist} username={username} size={40} />
      </button>
      <div className="min-w-0">
        <button type="button" onClick={() => openUserProfile(uid)} className="block truncate text-left text-callout font-semibold text-fg hover:underline">
          {card.name || `@${username}`}
        </button>
        <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-fg-subtle">
          <span>{outletOf(journalist)}</span>
          {journalist?.region && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-0.5"><MapPin size={11} aria-hidden="true" />{journalist.region}</span></>}
        </p>
        {journalist?.affiliation && <div className="mt-1"><Affiliation value={journalist.affiliation} /></div>}
      </div>
    </div>
  );
}

/** Compact byline for story cards: the lead author and their outlet. */
export function AuthorLine({ item }) {
  const uid = item.authorId;
  const username = (item.authorNames || [item.authorName])[0];
  const journalist = useJournalist(uid);
  const card = useLiveCard(uid, { username });
  const more = (item.authors || [uid]).length - 1;
  return (
    <span className="flex min-w-0 items-center gap-2 text-caption text-fg-muted">
      <Mark uid={uid} journalist={journalist} username={username} size={20} />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-fg">{card.name || `@${username}`}</span>
        {more > 0 && ` and ${more} more`}
        <span className="text-fg-subtle"> · {outletOf(journalist)}</span>
        {journalist?.affiliation && <span className="text-warning-text"> · {journalist.affiliation}</span>}
      </span>
    </span>
  );
}

/** The journalist section of a profile. `onEdit` on their own. */
export function JournalistCard({ uid, journalist, stories, onEdit }) {
  const topics = Object.entries((stories || []).reduce((acc, s) => {
    const t = s.topic || "world";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => newsTopicById(id)?.label).filter(Boolean);
  return (
    <section aria-label="Journalist" className="mx-4 mb-4 rounded-card border border-line bg-surface p-4 md:mx-6">
      <div className="flex items-center gap-3">
        <Mark uid={uid} journalist={journalist} username={journalist.username} size={48} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-accent-text">
            <Newspaper size={12} aria-hidden="true" /> Journalist
          </p>
          <p className="truncate text-title-3">{outletOf(journalist)}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-callout text-fg-muted">
        {journalist.region && <li className="flex items-center gap-2"><MapPin size={15} aria-hidden="true" />Based in {journalist.region}</li>}
        {topics.length > 0 && <li className="flex items-center gap-2"><Newspaper size={15} aria-hidden="true" />Writes about {topics.join(", ")}</li>}
      </ul>
      {journalist.affiliation && <div className="mt-3"><Affiliation value={journalist.affiliation} /></div>}
      {onEdit && <Button size="sm" icon={PenLine} className="mt-3" onClick={onEdit}>Edit byline</Button>}
    </section>
  );
}

/** A journalist's published stories, for their profile. */
export function JournalistStories({ stories }) {
  if (stories === null) return <div className="space-y-3 px-4 py-4 md:px-6">{[0, 1].map((i) => <Skeleton key={i} className="h-20 !rounded-card" />)}</div>;
  if (!stories.length) return <EmptyState compact icon={Newspaper} title="No stories yet" body="Published stories show up here." />;
  return (
    <ul className="divide-y divide-line px-4 md:px-6">
      {stories.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => navigate(`/news/${s.id}`)} className="press group block w-full py-4 text-left">
            <span className="block text-label"><TopicLabel id={s.topic} /></span>
            <span className="mt-1 line-clamp-2 block text-title-3 group-hover:underline decoration-fg-subtle underline-offset-2">{s.title}</span>
            <span className="mt-1.5 block"><Meta item={s} /></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Lets a journalist set the byline readers see on their stories. */
export function JournalistSettings({ journalist, onClose, onSaved }) {
  const toast = useToast();
  const [outlet, setOutlet] = useState(journalist.outlet || "");
  const [region, setRegion] = useState(journalist.region || "");
  const [affiliation, setAffiliation] = useState(journalist.affiliation || "");
  const [logoUrl, setLogoUrl] = useState(journalist.logoUrl || "");
  const [cropping, setCropping] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  const save = async () => {
    if (!region.trim()) return setError("Add the region you're based in, so readers know where you report from.");
    setBusy(true);
    try {
      const saved = await saveJournalist({ outlet, region, affiliation, logoUrl });
      forgetJournalist(me());
      onSaved({ ...journalist, ...saved });
      toast({ title: "Byline updated", body: "It shows on all your stories." });
    } catch {
      setError("Couldn't save that. Check the words used and try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title="Your byline" onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>Save</Button>
        </div>
      )}>
      <p className="mb-4 text-callout text-fg-muted">
        Shown on your profile and with every story you write, so readers know who's reporting and from where.
      </p>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {logoUrl
            ? <MediaImg src={logoUrl} alt="Your logo" className="h-14 w-14 rounded-[22%] object-cover" placeholderClass="h-14 w-14 rounded-[22%]" />
            : <span className="flex h-14 w-14 items-center justify-center rounded-[22%] bg-surface-2 text-fg-subtle"><Newspaper size={22} aria-hidden="true" /></span>}
          <Button size="sm" icon={ImagePlus} onClick={() => fileInput.current?.click()}>{logoUrl ? "Change logo" : "Add a logo"}</Button>
          {logoUrl && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLogoUrl("")}>Remove</Button>}
          <input ref={fileInput} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setCropping(f); }} />
        </div>
        <Field label="Outlet" hint="The company you report for. Leave it empty if you're independent.">
          <Input value={outlet} onChange={(e) => setOutlet(e.target.value)} maxLength={80} placeholder="Independent" />
        </Field>
        <Field label="Region" hint="Where you're based, like Western Sydney or Brisbane.">
          <Input value={region} onChange={(e) => { setRegion(e.target.value); setError(""); }} maxLength={80} placeholder="Sydney" />
        </Field>
        <Field label="Political affiliation" hint="If you belong to or work for a party or political group, name it. It shows on every story you write. Leave it empty if you have none.">
          <Input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} maxLength={80} />
        </Field>
        <InlineMessage>{error}</InlineMessage>
      </div>

      {cropping && (
        <Suspense fallback={null}>
          <PhotoCropper file={cropping} shape="square" title="Adjust your logo" onCancel={() => setCropping(null)}
            onDone={async (file) => {
              try {
                const { url } = await uploadMedia(file, null, "logos");
                setLogoUrl(url);
                setCropping(null);
              } catch {
                toast({ tone: "error", title: "Couldn't upload that logo" });
              }
            }} />
        </Suspense>
      )}
    </Dialog>
  );
}
