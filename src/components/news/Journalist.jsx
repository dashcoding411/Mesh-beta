import { lazy, Suspense, useRef, useState } from "react";
import { ImagePlus, Landmark, MapPin, Newspaper, PenLine, Trash2, UserCheck, UserPlus } from "lucide-react";
import { newsTopicById } from "../../lib/interests";
import { forgetJournalist, outletOf, useJournalist } from "../../lib/journalists";
import { useLiveCard } from "../../lib/profileCache";
import { openUserProfile, saveJournalist, toggleFollow, uploadMedia, me, limitMessage } from "../../lib/db";
import { useShell } from "../shell/ShellContext";
import { navigate } from "../../lib/router";
import { KindBadge, Meta, TopicLabel } from "./parts";
import { Mark } from "./AuthorLine";
import MediaImg from "../ui/MediaImg";
import Badge from "../ui/Badge";
import { VerifiedTick } from "../ui/Badges";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import { EmptyState, InlineMessage, Skeleton } from "../ui/States";
import { useToast } from "../ui/toast-context";
import { uploadProblem } from "../../lib/imageCheck";

const PhotoCropper = lazy(() => import("../ui/PhotoCropper"));

function Affiliation({ value }) {
  if (!value) return null;
  return <Badge tone="warning" icon={Landmark}>Political affiliation: {value}</Badge>;
}

/** Follow from a byline, so their stories show up in Home. */
function FollowJournalist({ uid, username }) {
  const toast = useToast();
  const { following, setFollowing, needsAccount } = useShell();
  const [busy, setBusy] = useState(false);
  if (uid === me()) return null;
  const on = following.has(uid);
  const toggle = async () => {
    if (needsAccount("follow journalists")) return;
    setBusy(true);
    try {
      const result = await toggleFollow({ id: uid, username }, on);
      if (result === "requested") {
        toast({ title: "Request sent", body: `@${username} will decide whether to approve it.` });
        return;
      }
      setFollowing((prev) => {
        const next = new Set(prev);
        if (on) next.delete(uid); else next.add(uid);
        return next;
      });
      if (!on) toast({ title: `Following @${username}`, body: "Their stories will show up in Home." });
    } catch (err) {
      toast({ tone: "error", title: limitMessage(err) || "Couldn't update follow" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant={on ? "secondary" : "primary"} icon={on ? UserCheck : UserPlus} loading={busy}
      onClick={toggle} className="shrink-0" aria-label={`${on ? "Unfollow" : "Follow"} @${username}`}>
      {on ? "Following" : "Follow"}
    </Button>
  );
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
        <button type="button" onClick={() => openUserProfile(uid)} className="flex min-w-0 items-center gap-1 text-left text-callout font-semibold text-fg hover:underline">
          <span className="truncate">{card.name || `@${username}`}</span>
          {journalist && <VerifiedTick size={15} label="Verified journalist" />}
        </button>
        <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-fg-subtle">
          <span>{outletOf(journalist)}</span>
          {journalist?.region && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-0.5"><MapPin size={11} aria-hidden="true" />{journalist.region}</span></>}
        </p>
        {journalist?.affiliation && <div className="mt-1"><Affiliation value={journalist.affiliation} /></div>}
      </div>
      <span className="ml-auto pl-2"><FollowJournalist uid={uid} username={username} /></span>
    </div>
  );
}

/** The journalist section of a profile. `onEdit` on their own. */
export function JournalistCard({ uid, journalist, stories, onEdit, className = "mx-4 mb-4 md:mx-6" }) {
  const topics = Object.entries((stories || []).reduce((acc, s) => {
    const t = s.topic || "world";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => newsTopicById(id)?.label).filter(Boolean);
  return (
    <section aria-label="Journalist" className={`rounded-card border border-line bg-surface p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <Mark uid={uid} journalist={journalist} username={journalist.username} size={48} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-accent-text">
            <VerifiedTick size={14} decorative /> Verified journalist
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
            <span className="flex items-center gap-2 text-label"><KindBadge id={s.label} /><TopicLabel id={s.topic} /></span>
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
        <Field label="Outlet" hint="Leave empty if you're independent.">
          <Input value={outlet} onChange={(e) => setOutlet(e.target.value)} maxLength={80} placeholder="Independent" />
        </Field>
        <Field label="Region" hint="Like Western Sydney or Brisbane.">
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
              } catch (err) {
                toast({ tone: "error", title: uploadProblem(err, "Couldn't upload that logo") });
              }
            }} />
        </Suspense>
      )}
    </Dialog>
  );
}
