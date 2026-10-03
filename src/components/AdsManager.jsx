import { useEffect, useState } from "react";
import { ImagePlus, Megaphone, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import {
  fetchAllAds, createAd, updateAd, setAdActive, deleteAd, staffRole, uploadMedia, adRunning, tsMillis, AD_LIMITS, CTA_CHOICES,
} from "../lib/db";
import { INTERESTS } from "../lib/interests";
import { uploadProblem } from "../lib/imageCheck";
import { plural } from "../lib/format";
import TopBar from "./shell/TopBar";
import AdCard from "./AdCard";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Switch from "./ui/Switch";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { EmptyState, InlineMessage, Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";

const DAY = 86400000;
const dateInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fromDate = (s, endOfDay = false) => new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();
const dayLabel = (t) => new Date(tsMillis(t)).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function statusOf(ad, now = Date.now()) {
  if (!ad.active) return { label: "Paused", tone: "neutral" };
  if (now < tsMillis(ad.startsAt)) return { label: "Scheduled", tone: "accent" };
  if (now >= tsMillis(ad.endsAt)) return { label: "Ended", tone: "neutral" };
  return { label: "Running", tone: "success" };
}

/** Staff: sell, schedule and track ads. Totals only; nothing about who saw them. */
export default function AdsManager() {
  const toast = useToast();
  const [allowed, setAllowed] = useState(null);
  const [ads, setAds] = useState(null);
  const [editing, setEditing] = useState(null); // ad, or {} for a new one
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    let live = true;
    staffRole().then((r) => {
      if (!live) return;
      setAllowed(!!r);
      if (r) fetchAllAds().then((l) => { if (live) setAds(l); }).catch(() => { if (live) setAds([]); });
    }).catch(() => { if (live) setAllowed(false); });
    return () => { live = false; };
  }, []);

  const replace = (ad) => setAds((l) => [ad, ...(l || []).filter((x) => x.id !== ad.id)]);

  return (
    <>
      <TopBar title="Ads" back backTo="/account/settings" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-5 px-4 pb-16 pt-5 md:px-6">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="hidden flex-1 text-title-1 md:block">Ads</h1>
            {allowed && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New ad</Button>}
          </header>
          {allowed === null && <Skeleton className="h-24 !rounded-card" />}
          {allowed === false && <EmptyState icon={Megaphone} title="For Mesh staff" body="Ads are run by Mesh admins and moderators." />}
          {allowed && (
            <>
              <p className="rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
                Ads show in Home after the 6th post and every 10 after, labelled &ldquo;Ad&rdquo;, never in Messages. Target by town,
                interests people picked, and 18+ only. Advertisers get totals: views (once per person per visit) and taps.
              </p>
              {ads === null && <Skeleton className="h-32 !rounded-card" />}
              {ads?.length === 0 && <EmptyState icon={Megaphone} title="No ads yet" body="Create one for a local business, club or event." />}
              <ul className="space-y-3">
                {ads?.map((ad) => {
                  const st = statusOf(ad);
                  const rate = ad.impressions ? `${((ad.clicks / ad.impressions) * 100).toFixed(1)}% tap rate` : "";
                  return (
                    <li key={ad.id} className="rounded-card border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="text-callout font-semibold">{ad.advertiser}</span>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </p>
                          <p className="mt-0.5 truncate text-callout text-fg">{ad.headline}</p>
                          <p className="mt-1 text-caption text-fg-subtle">
                            {dayLabel(ad.startsAt)} to {dayLabel(ad.endsAt)}
                            {ad.towns?.length ? ` · ${ad.towns.join(", ")}` : " · Everywhere"}
                            {ad.adultsOnly ? " · 18+" : ""}
                          </p>
                          <p className="mt-1 text-caption font-semibold text-fg-muted">
                            {plural(ad.impressions || 0, "view")} · {plural(ad.clicks || 0, "tap")}{rate ? ` · ${rate}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" icon={ad.active ? Pause : Play} onClick={async () => {
                            try { await setAdActive(ad.id, !ad.active); replace({ ...ad, active: !ad.active }); }
                            catch { toast({ tone: "error", title: "Couldn't change that ad" }); }
                          }}>{ad.active ? "Pause" : "Resume"}</Button>
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(ad)} aria-label={`Edit ${ad.advertiser}'s ad`} />
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(ad)} aria-label={`Delete ${ad.advertiser}'s ad`} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      {editing && <AdEditor ad={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(a) => { replace(a); setEditing(null); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.advertiser}'s ad?`} body="Its totals go with it. Pause it instead to keep them." confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try { await deleteAd(deleting.id); setAds((l) => l.filter((x) => x.id !== deleting.id)); setDeleting(null); toast({ title: "Ad deleted" }); }
            catch { toast({ tone: "error", title: "Couldn't delete it" }); }
          }} />
      )}
    </>
  );
}

function AdEditor({ ad, onClose, onSaved }) {
  const toast = useToast();
  const now = Date.now();
  const [form, setForm] = useState(() => ({
    advertiser: ad?.advertiser || "",
    headline: ad?.headline || "",
    body: ad?.body || "",
    imageUrl: ad?.imageUrl || "",
    linkUrl: ad?.linkUrl || "https://",
    cta: ad?.cta || CTA_CHOICES[0],
    start: dateInput(ad ? tsMillis(ad.startsAt) : now),
    end: dateInput(ad ? tsMillis(ad.endsAt) - 1000 : now + 7 * DAY),
    towns: (ad?.towns || []).join(", "),
    interests: ad?.interests || [],
    adultsOnly: !!ad?.adultsOnly,
    active: ad ? !!ad.active : true,
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(""); };

  const startsAt = fromDate(form.start);
  const endsAt = fromDate(form.end, true) + 1000;
  const preview = {
    id: "preview", advertiser: form.advertiser || "Advertiser", headline: form.headline || "Your headline", body: form.body,
    imageUrl: form.imageUrl, linkUrl: /^https:\/\/[^ ]+\.[^ ]+/.test(form.linkUrl) ? form.linkUrl : "https://example.com",
    cta: form.cta, towns: form.towns.split(",").map((t) => t.trim()).filter(Boolean), interests: form.interests, adultsOnly: form.adultsOnly,
  };

  const save = async () => {
    if (!form.advertiser.trim() || !form.headline.trim()) return setError("Add the advertiser and a headline.");
    if (!/^https:\/\/[^ ]+\.[^ ]+/.test(form.linkUrl.trim())) return setError("The link must start with https://.");
    if (!(endsAt > startsAt)) return setError("The end date must be after the start.");
    setBusy(true);
    const data = {
      ...form, towns: preview.towns, startsAt: Timestamp.fromMillis(startsAt), endsAt: Timestamp.fromMillis(endsAt),
    };
    try {
      let id = ad?.id;
      if (id) await updateAd(id, data); else id = await createAd(data);
      toast({ title: ad ? "Ad saved" : "Ad created", body: adRunning({ ...data, active: form.active }) ? "It's running in Home now." : undefined });
      onSaved({ ...(ad || { impressions: 0, clicks: 0 }), ...data, id });
    } catch (err) {
      setError(err?.code === "permission-denied" ? "That isn't allowed. Check the link and wording." : "Couldn't save the ad. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={ad ? "Edit ad" : "New ad"} onClose={onClose} size="xl"
      footer={(
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-callout">
            <Switch checked={form.active} onChange={(v) => set({ active: v })} label="Running" /> {form.active ? "On" : "Paused"}
          </span>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{ad ? "Save" : "Create ad"}</Button>
        </div>
      )}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <Field label="Advertiser" count={form.advertiser.length} max={AD_LIMITS.advertiser}>
            <Input value={form.advertiser} maxLength={AD_LIMITS.advertiser} placeholder="Campus Coffee Co." onChange={(e) => set({ advertiser: e.target.value })} />
          </Field>
          <Field label="Headline" count={form.headline.length} max={AD_LIMITS.headline}>
            <Input value={form.headline} maxLength={AD_LIMITS.headline} placeholder="Student coffee deal before 9am" onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <Field label="Text" optional count={form.body.length} max={AD_LIMITS.body}>
            <Textarea autoGrow rows={2} maxRows={5} value={form.body} maxLength={AD_LIMITS.body} onChange={(e) => set({ body: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1.5 text-callout font-medium">Image <span className="font-normal text-fg-subtle">Optional</span></p>
            <p className="mb-2 text-caption text-fg-subtle">Shown like a post's photo, cropped to 4:5 portrait. 1080 × 1350 works best.</p>
            <div className="flex gap-2">
              <label className="press inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border border-line-strong bg-surface-2 px-3 text-callout font-semibold">
                <ImagePlus size={16} aria-hidden="true" /> {uploading ? "Uploading…" : form.imageUrl ? "Change" : "Add an image"}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                  const f = e.target.files[0]; e.target.value = "";
                  if (!f) return;
                  setUploading(true);
                  try { const { url } = await uploadMedia(f, undefined, "ads"); set({ imageUrl: url }); }
                  catch (err) { toast({ tone: "error", title: uploadProblem(err, "Couldn't upload that image") }); }
                  finally { setUploading(false); }
                }} />
              </label>
              {form.imageUrl && <Button size="sm" variant="ghost" onClick={() => set({ imageUrl: "" })}>Remove</Button>}
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Field label="Link">
              <Input value={form.linkUrl} inputMode="url" maxLength={500} onChange={(e) => set({ linkUrl: e.target.value.trim() })} />
            </Field>
            <Field label="Button">
              <Select value={form.cta} onChange={(e) => set({ cta: e.target.value })}>
                {CTA_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts"><Input type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} /></Field>
            <Field label="Ends"><Input type="date" value={form.end} onChange={(e) => set({ end: e.target.value })} /></Field>
          </div>
          <Field label="Towns or suburbs" optional hint="Comma-separated. Matched against the town people put on their profile. Leave empty for everywhere.">
            <Input value={form.towns} placeholder="Brisbane, St Lucia" onChange={(e) => set({ towns: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-callout font-medium">Interests <span className="font-normal text-fg-subtle">Optional, up to {AD_LIMITS.interests}</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.map((i) => {
                const on = form.interests.includes(i.id);
                return (
                  <button key={i.id} type="button" aria-pressed={on} disabled={!on && form.interests.length >= AD_LIMITS.interests}
                    onClick={() => set({ interests: on ? form.interests.filter((x) => x !== i.id) : [...form.interests, i.id] })}
                    className={`press min-h-8 rounded-full px-3 text-caption font-semibold disabled:opacity-40 ${on ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted"}`}>
                    {i.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-callout">
            <Switch checked={form.adultsOnly} onChange={(v) => set({ adultsOnly: v })} label="18 and over only" />
            18 and over only <span className="text-caption text-fg-subtle">(required for alcohol and gambling)</span>
          </label>
          <InlineMessage>{error}</InlineMessage>
        </div>
        <div>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-fg-subtle">Preview</p>
          <div className="overflow-hidden rounded-card border border-line"><AdCard ad={preview} preview /></div>
        </div>
      </div>
    </Dialog>
  );
}
