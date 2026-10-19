// Circle management: requests, approval queue, limits, details, appearance.
import { Check, Hourglass, ImagePlus, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AGE_LIMITS, approveJoinRequest, approvePost, declineJoinRequest, deleteGroup, effectiveAutomod,
  deletePost, fetchJoinRequests, fetchPendingPosts, setCircleInterests, setCircleLimits,
  setCircleRules, setCircleTopics, setScreeningQuestions, setCircleImage, setCircleCover, COVER_COLORS, setCircleCustom,
} from "../../lib/db";
import { coverClass, LATTICE, CIRCLE_ACCENTS } from "../../lib/covers";
import { validateMediaFile } from "../../lib/validate";
import { CircleAvatar, CircleBanner } from "./CircleImages";
import PhotoCropper from "../ui/PhotoCropper";
import { shortTime } from "../../lib/format";
import { navigate } from "../../lib/router";
import { InterestToggles } from "../Interests";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/Field";
import { EmptyState, Skeleton } from "../ui/States";
import Tabs from "../ui/Tabs";
import { useToast } from "../ui/toast-context";

export function ManageDialog({ group, isOwner, section, onSection, onClose, onSaved, onCountChange }) {
  return (
    <Dialog title="Manage circle" onClose={onClose} size="lg">
      <Tabs variant="underline" label="Manage" value={section} onChange={onSection} className="-mx-1 mb-5"
        tabs={[
          { id: "requests", label: "Requests" },
          { id: "posts", label: "Posts" },
          { id: "limits", label: "Limits" },
          { id: "rules", label: "Details" },
          ...(isOwner ? [{ id: "look", label: "Look" }, { id: "custom", label: "Customise" }] : []),
        ]} />
      {section === "requests" && <JoinRequests group={group} onCountChange={onCountChange} />}
      {section === "posts" && <PostQueue group={group} />}
      {section === "limits" && <LimitsEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
      {section === "rules" && <RulesEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
      {section === "look" && isOwner && <LookEditor group={group} onSaved={onSaved} />}
      {section === "custom" && isOwner && <CustomEditor group={group} onSaved={onSaved} />}
    </Dialog>
  );
}

const OPTIONAL_TABS = [
  { id: "guides", label: "Guides", help: "Step-by-step guides members work through" },
  { id: "gatherings", label: "Gatherings", help: "Events for the circle" },
  { id: "members", label: "Members", help: "The member list (admins always see it in Manage)" },
];

/** Accent colour, a welcome note, what members are called, and which tabs show. */
function CustomEditor({ group, onSaved }) {
  const toast = useToast();
  const [accent, setAccent] = useState(group.accent || "violet");
  const [welcome, setWelcome] = useState(group.welcome || "");
  const [memberTitle, setMemberTitle] = useState(group.memberTitle || "");
  const [hidden, setHidden] = useState(new Set(group.hiddenTabs || []));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await setCircleCustom(group.id, { accent, welcome, memberTitle, hiddenTabs: [...hidden] });
      await onSaved();
      toast({ title: "Circle updated" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that", body: "Check the words used and try again." });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-callout font-medium">Accent colour</legend>
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
          {CIRCLE_ACCENTS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={accent === a.id} aria-label={a.label} onClick={() => setAccent(a.id)}
              className={`press flex h-10 w-10 items-center justify-center rounded-full text-white ${accent === a.id ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}
              style={{ background: a.hex }}>
              {accent === a.id && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="What members are called" optional hint={'One word, like "gardener" or "runner". The circle shows "120 gardeners".'}>
        <Input value={memberTitle} onChange={(e) => setMemberTitle(e.target.value.replace(/[^\p{L}\p{N} '-]/gu, ""))} maxLength={24} placeholder="member" />
      </Field>
      <Field label="Welcome note" optional count={welcome.length} max={300}
       >
        <Textarea autoGrow rows={3} maxRows={8} value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={300}
          placeholder="Welcome! Start by introducing yourself in Discussion." />
      </Field>
      <fieldset>
        <legend className="mb-2 text-callout font-medium">Tabs</legend>
        <div className="space-y-2">
          {OPTIONAL_TABS.map((t) => (
            <Checkbox key={t.id} checked={!hidden.has(t.id)} description={t.help}
              onChange={(on) => setHidden((s) => { const n = new Set(s); if (on) n.delete(t.id); else n.add(t.id); return n; })}>
              {t.label}
            </Checkbox>
          ))}
        </div>
        <p className="mt-2 text-caption text-fg-subtle">Discussion and About always show.</p>
      </fieldset>
      <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={save}>Save</Button></div>
    </div>
  );
}

function LookEditor({ group, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null); // "bannerUrl" | "photoUrl" | "cover"
  const [cropping, setCropping] = useState(null);
  const bannerInput = useRef(null);
  const photoInput = useRef(null);

  const saveImage = async (field, file) => {
    if (file) {
      const v = validateMediaFile(file, "image");
      if (v.error) return toast({ tone: "error", title: v.error });
    }
    setBusy(field);
    try {
      await setCircleImage(group, field, file);
      await onSaved();
      toast({ title: file ? (field === "bannerUrl" ? "Banner updated" : "Photo updated") : (field === "bannerUrl" ? "Banner removed" : "Photo removed") });
    } catch (err) {
      toast({ tone: "error", title: "Couldn't save that", body: err?.name === "UnsafeImageError" || err?.message?.includes("quickly") ? err.message : "Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };
  const pick = (field) => (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    // Only the square photo goes through the cropper.
    if (field === "photoUrl") setCropping(f);
    else saveImage(field, f);
  };

  const saveCover = async (id) => {
    setBusy("cover");
    try { await setCircleCover(group.id, id); await onSaved(); }
    catch { toast({ tone: "error", title: "Couldn't change the colour" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="look-banner">
        <h3 id="look-banner" className="text-callout font-semibold">Banner</h3>
        <p className="mb-2 text-caption text-fg-muted">Wide photos work best (3:1)</p>
        <CircleBanner group={group} className="h-28 rounded-card" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" icon={ImagePlus} loading={busy === "bannerUrl"} onClick={() => bannerInput.current?.click()}>
            {group.bannerUrl ? "Change banner" : "Add a banner"}
          </Button>
          {group.bannerUrl && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => saveImage("bannerUrl", null)}>Remove</Button>}
        </div>
        <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={pick("bannerUrl")} aria-hidden="true" tabIndex={-1} />
      </section>

      <section aria-labelledby="look-photo">
        <h3 id="look-photo" className="text-callout font-semibold">Circle photo</h3>
        <div className="flex items-center gap-4">
          <CircleAvatar group={group} size={72} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={ImagePlus} loading={busy === "photoUrl"} onClick={() => photoInput.current?.click()}>
              {group.photoUrl ? "Change photo" : "Add a photo"}
            </Button>
            {group.photoUrl && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => saveImage("photoUrl", null)}>Remove</Button>}
          </div>
        </div>
        <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={pick("photoUrl")} aria-hidden="true" tabIndex={-1} />
        {cropping && (
          <PhotoCropper file={cropping} shape="square" title="Adjust the circle photo"
            onCancel={() => setCropping(null)} onDone={async (f) => { setCropping(null); await saveImage("photoUrl", f); }} />
        )}
      </section>

      <fieldset>
        <legend className="text-callout font-semibold">Colour</legend>
        <div className="flex gap-3" role="radiogroup">
          {COVER_COLORS.map((id, i) => (
            <button key={id} type="button" role="radio" aria-checked={(group.coverColor || COVER_COLORS[0]) === id} aria-label={`Colour ${i + 1}`}
              disabled={busy === "cover"} onClick={() => saveCover(id)} style={LATTICE}
              className={`press h-10 w-10 rounded-full ${coverClass(id)} ${(group.coverColor || COVER_COLORS[0]) === id ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function JoinRequests({ group, onCountChange }) {
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchJoinRequests(group.id).then(setRequests).catch(() => setRequests([]));
  }, [group.id]);

  const decide = async (r, approve) => {
    setBusy(r.id);
    try {
      if (approve) { await approveJoinRequest(group.id, r); onCountChange((c) => c + 1); }
      else await declineJoinRequest(group.id, r.uid);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      toast({ title: approve ? `@${r.username || "Member"} approved` : "Request declined" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that decision" });
    } finally { setBusy(""); }
  };

  if (requests === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!requests.length) return <EmptyState compact icon={Users} title="No one's waiting to join" />;

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li key={r.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-callout font-semibold">@{r.username || "someone"}</p>
          <dl className="mt-2 space-y-2">
            {(r.answers || []).map((a, i) => (
              <div key={i}>
                <dt className="text-caption text-fg-subtle">{a.q}</dt>
                <dd className="text-callout">{a.a}</dd>
              </div>
            ))}
          </dl>
          {group.rules && <p className="mt-2 flex items-center gap-1.5 text-caption text-success-text"><Check size={13} aria-hidden="true" /> Agreed to the rules</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === r.id} onClick={() => decide(r, true)}>Approve</Button>
            <Button size="sm" icon={X} disabled={busy === r.id} onClick={() => decide(r, false)}>Decline</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PostQueue({ group }) {
  const toast = useToast();
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchPendingPosts(group.id).then(setPosts).catch(() => setPosts([]));
  }, [group.id]);

  const decide = async (p, approve) => {
    setBusy(p.id);
    try {
      if (approve) await approvePost(p, group); else await deletePost(p);
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      toast({ title: approve ? "Approved and published" : "Declined and removed" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that decision" });
    } finally { setBusy(""); }
  };

  const am = effectiveAutomod(group);
  const approval = am.requirePostApproval || am.linkAction === "hold" || (am.newAccountDays > 0 && am.newAccountAction === "hold") || am.holdNoPhoto;

  if (posts === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!posts.length) {
    return (
      <EmptyState compact icon={Hourglass} title="Nothing waiting"
        body={approval ? "New posts from members land here before anyone else sees them." : "Turn on a review-first rule in Limits to review members' posts first."} />
    );
  }
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li key={p.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-caption text-fg-subtle">@{p.authorName} · {shortTime(p.createdAt)}</p>
          {p.title && <p className="mt-1 text-callout font-semibold">{p.title}</p>}
          <p className="mt-1 whitespace-pre-wrap break-words text-callout">{p.text || "(photo or video, no caption)"}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === p.id} onClick={() => decide(p, true)}>Approve</Button>
            <Button size="sm" variant="danger-ghost" icon={X} disabled={busy === p.id} onClick={() => decide(p, false)}>Decline</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function LimitsEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [a, setA] = useState(effectiveAutomod(group));
  const [words, setWords] = useState((group.automod?.bannedWords || []).join(", "));
  const [requireApproval, setRequireApproval] = useState(!!group.requireApproval || group.privacy !== "public");
  const [ageLimit, setAgeLimit] = useState(group.ageLimit || 0);
  const [busy, setBusy] = useState(false);
  const locked = !isOwner;
  const set = (k) => (v) => setA((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await setCircleLimits(group.id, {
        requireApproval: group.privacy !== "public" ? true : requireApproval,
        ageLimit,
        automod: { ...a, bannedWords: words.split(",").map((w) => w.trim()).filter(Boolean) },
      });
      onSaved();
      toast({ title: "Limits saved", body: "They apply to everything posted from now on." });
    } catch {
      toast({ tone: "error", title: "Couldn't save the limits" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {locked && <p className="rounded-control bg-surface-2 p-3 text-callout text-fg-muted">Only the circle's admin can change limits.</p>}

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Who can join</h3>
        {group.privacy !== "public" ? (
          <p className="text-caption text-fg-muted">Private and hidden circles always need an admin to approve new members.</p>
        ) : (
          <Choice locked={locked} name="Who can join" value={requireApproval ? "ask" : "open"} onChange={(v) => setRequireApproval(v === "ask")}
            options={[
              { id: "open", label: "Anyone can join", blurb: "Unless you've set screening questions, which always need approval." },
              { id: "ask", label: "Admins approve new members", blurb: "Requests land in the Requests tab." },
            ]} />
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Age limit</h3>
        <Choice locked={locked} name="Age limit" value={ageLimit} onChange={setAgeLimit} options={AGE_LIMITS} />
        <p className="text-caption text-fg-subtle">Applies to new members. Accounts without a birth year can't join age-limited circles.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Who can post</h3>
        <Choice locked={locked} name="Who can post" value={a.postingPermission} onChange={set("postingPermission")}
          options={[
            { id: "members", label: "All members", blurb: "Anyone in the circle can post and plan gatherings." },
            { id: "admins", label: "Only admins and moderators", blurb: "Members can still comment, react and reply to gatherings." },
          ]} />
      </section>

      <section>
        <h3 className="text-callout font-semibold">Admin Assist</h3>
        <p className="mb-2 text-caption text-fg-subtle">Admins and moderators are exempt.</p>
        <div className={`space-y-1 rounded-card border border-line bg-surface-2 px-3 py-1 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <Checkbox checked={!!a.requirePostApproval} onChange={set("requirePostApproval")}
            description="Every member's post waits for an admin or moderator.">
            Review every post first
          </Checkbox>
          <Rule label="Links" value={a.linkAction} onChange={set("linkAction")}
            options={[["allow", "Allow"], ["hold", "Review first"], ["block", "Decline"]]} />
          <Rule label="New accounts" value={String(a.newAccountDays)} onChange={(v) => set("newAccountDays")(Number(v))}
            options={[["0", "No limit"], ["7", "Under 7 days"], ["30", "Under 30 days"], ["90", "Under 90 days"], ["180", "Under 180 days"]]}
            extra={a.newAccountDays > 0 && (
              <Select aria-label="What happens to new accounts' posts" value={a.newAccountAction} onChange={(e) => set("newAccountAction")(e.target.value)} className="!w-auto">
                <option value="hold">Review first</option>
                <option value="decline">Decline</option>
              </Select>
            )} />
          <Rule label="Shortest post" value={String(a.minLength)} onChange={(v) => set("minLength")(Number(v))}
            options={[["0", "Any length"], ["10", "10 characters"], ["20", "20 characters"], ["50", "50 characters"]]} />
          <Rule label="Slow mode" value={String(a.slowModeMinutes)} onChange={(v) => set("slowModeMinutes")(Number(v))}
            options={[["0", "Off"], ["5", "5 minutes between posts"], ["15", "15 minutes"], ["60", "1 hour"]]} />
          <Checkbox checked={!!a.holdNoPhoto} onChange={set("holdNoPhoto")} description="A common sign of a throwaway account.">
            Review posts from accounts with no profile photo
          </Checkbox>
          <Checkbox checked={!!a.blockContactInfo} onChange={set("blockContactInfo")} description="Decline phone numbers, email addresses and card numbers, where scams and doxxing start.">
            Keep contact details out of posts
          </Checkbox>
          <Checkbox checked={!a.mediaAllowed} onChange={(v) => set("mediaAllowed")(!v)} description="Strands only: no photos or videos.">
            Words only
          </Checkbox>
          <Checkbox checked={!!a.declineRecentStrikes} onChange={set("declineRecentStrikes")}
            description="When a moderator removes someone's post, they can't post again for 28 days.">
            Pause posting after a removed post
          </Checkbox>
        </div>
      </section>

      <Field label="Blocked words" hint="Comma separated." count={words.length} max={600}>
        <Input value={words} onChange={(e) => setWords(e.target.value)} placeholder="crypto, referral, giveaway" maxLength={600} disabled={locked} />
      </Field>

      {!locked && <Button variant="primary" full loading={busy} onClick={save}>Save limits</Button>}
    </div>
  );
}

function Rule({ label, value, onChange, options, extra }) {
  const id = `rule-${label.replace(/\s/g, "")}`;
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 py-1.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-callout text-fg">{label}</label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="!w-auto">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      {extra}
    </div>
  );
}

function Choice({ name, value, onChange, options, locked }) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className={`press flex min-h-12 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
          value === o.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
        } ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <input type="radio" name={name} checked={value === o.id} disabled={locked} onChange={() => onChange(o.id)} className="mt-1 h-4 w-4 accent-violet-600" />
          <span>
            <span className="block text-callout font-semibold">{o.label}</span>
            {o.blurb && <span className="block text-caption text-fg-muted">{o.blurb}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function RulesEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [rules, setRules] = useState(group.rules || "");
  const [questions, setQuestions] = useState(group.screeningQuestions || []);
  const [topics, setTopics] = useState(group.interests || []);
  const [postTopics, setPostTopics] = useState((group.topics || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isOwner) return <p className="text-callout text-fg-muted">Only the circle's admin can edit rules and questions.</p>;

  const save = async () => {
    setBusy(true);
    try {
      await setCircleRules(group.id, rules.trim());
      await setScreeningQuestions(group.id, questions.filter((q) => q && q.trim()));
      await setCircleInterests(group.id, topics);
      await setCircleTopics(group.id, postTopics.split(","));
      onSaved();
      toast({ title: "Rules saved" });
    } catch { toast({ tone: "error", title: "Couldn't save the rules" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-callout font-medium">Interests <span className="font-normal text-fg-subtle">Up to 3. People find the circle by these.</span></legend>
        <InterestToggles value={topics} onChange={setTopics} max={3} label="Circle interests" />
      </fieldset>
      <Field label="Post topics" optional hint="Comma separated."
        count={postTopics.length} max={400}>
        <Input value={postTopics} maxLength={400} onChange={(e) => setPostTopics(e.target.value)} placeholder="Questions, Show and tell, Events, For sale" />
      </Field>
      <Field label="Rules" hint="One per line." count={rules.length} max={2000}>
        <Textarea autoGrow rows={4} value={rules} maxLength={2000} onChange={(e) => setRules(e.target.value)}
          placeholder={"Be kind\nNo self-promotion\nStay on topic"} />
      </Field>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-callout font-medium">Screening questions <span className="font-normal text-fg-subtle">Up to 3, optional</span></legend>
        {[0, 1, 2].map((i) => (
          <Input key={i} value={questions[i] || ""} maxLength={200} placeholder={`Question ${i + 1}`}
            aria-label={`Screening question ${i + 1}`}
            onChange={(e) => { const next = [...questions]; next[i] = e.target.value; setQuestions(next); }} />
        ))}
        <p className="text-caption text-fg-subtle">Asking anything means every new member needs approval.</p>
      </fieldset>
      <Button variant="primary" full loading={busy} onClick={save}>Save details</Button>

      <section aria-labelledby="danger-h" className="rounded-card border border-danger/40 p-4">
        <h3 id="danger-h" className="text-callout font-semibold text-danger-text">Delete this circle</h3>
        <p className="mt-1 text-caption text-fg-muted">Removes the circle, every post in it and every membership. This can't be undone.</p>
        <Button variant="danger" size="sm" icon={Trash2} className="mt-3" onClick={() => setConfirmDelete(true)}>Delete circle</Button>
      </section>
      {confirmDelete && (
        <ConfirmDialog title={`Delete ${group.name}?`} confirmLabel="Delete circle" busy={deleting}
          body="Every post, member and join request goes with it, for everyone. This can't be undone."
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await deleteGroup(group);
              toast({ title: "Circle deleted" });
              navigate("/circles", { replace: true });
            } catch {
              toast({ tone: "error", title: "Couldn't delete the circle" });
              setDeleting(false);
            }
          }} />
      )}
    </div>
  );
}
