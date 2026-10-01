import { useEffect, useState } from "react";
import { MapPin, Heart, CalendarDays, Users, Grid3x3, Lock } from "lucide-react";
import {
  fetchFollowList, updateProfileFields, changeUsername, usernameCooldown, USERNAME_COOLDOWN_DAYS,
  searchUsers, sendSpouseRequest, openUserProfile, me, tsMillis,
  fetchProfileByUsername,
} from "../lib/db";
import { LIMITS, validateText, validateUsername } from "../lib/validate";
import { compact } from "../lib/format";
import { checkContent } from "../lib/moderation";
import Avatar from "./ui/Avatar";
import { PhotoField } from "./ProfilePhoto";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import RichText from "./ui/RichText";
import { Field, Input, Textarea } from "./ui/Field";
import { EmptyState, Skeleton, InlineMessage } from "./ui/States";
import { useToast } from "./ui/toast-context";
import { ProfileBadges, VerifiedTick } from "./ui/Badges";
import { useJournalist } from "../lib/journalists";
import { badgesOf, tickOf, hasPinkCheck } from "../lib/badges";
import { Tile } from "./Search";

// Only shown when both profiles name each other.
function useVerifiedSpouse(profile) {
  const claimed = profile.spouseUsername && !profile.spouseUsername.includes("pending") ? profile.spouseUsername : "";
  const [verified, setVerified] = useState({ for: "", ok: false });
  useEffect(() => {
    if (!claimed) return;
    let alive = true;
    fetchProfileByUsername(claimed)
      .then((other) => { if (alive) setVerified({ for: claimed, ok: other?.spouseUsername === profile.username }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [claimed, profile.username]);
  return claimed && verified.for === claimed && verified.ok ? claimed : "";
}

// Girlfriend privilege's banner behind the profile photo.
const HEARTS = [[8, 22, 18], [22, 62, 12], [44, 18, 14], [63, 58, 20], [80, 26, 13], [92, 66, 16]];
function PinkBanner() {
  return (
    <div aria-hidden="true" className="profile-pink-banner relative -mx-4 h-28 overflow-hidden md:-mx-6 md:h-36 md:rounded-b-card">
      {HEARTS.map(([x, y, s], i) => (
        <Heart key={i} size={s} fill="currentColor" strokeWidth={0} className="absolute text-white/30"
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${(i % 2 ? 1 : -1) * 14}deg)` }} />
      ))}
    </div>
  );
}

// Same layout for own and other profiles; only the actions differ.
export function ProfileHeader({ profile, postCount, actions, onShowFollows, avatar }) {
  const joined = tsMillis(profile.createdAt);
  const spouse = useVerifiedSpouse(profile);
  const journalist = useJournalist(profile.id);
  const pink = hasPinkCheck(profile.badges);

  return (
    <section aria-label="Profile" className={`px-4 pb-4 md:px-6 ${pink ? "" : "pt-5"}`}>
      {pink && <PinkBanner />}
      <div className="flex items-start gap-4 md:gap-6">
        {pink ? (
          <div className="relative z-[1] -mt-11 shrink-0 rounded-full bg-canvas p-1 ring-2 ring-pink-400">{avatar || <Avatar profile={profile} size={88} />}</div>
        ) : avatar || <Avatar profile={profile} size={88} />}
        <div className={`min-w-0 flex-1 ${pink ? "pt-3" : "pt-1"}`}>
          <h1 className="flex min-w-0 items-center gap-2 text-title-1">
            <span className="truncate">{profile.name || profile.username}</span>
            {tickOf(profile.badges) === "pink" ? <VerifiedTick size={22} pink />
              : (journalist || tickOf(profile.badges)) && <VerifiedTick size={22} label={journalist ? "Verified journalist" : "Verified"} />}
            {profile.isPrivate && (
              <span title="Private account" className="shrink-0 text-fg-muted">
                <Lock size={18} aria-hidden="true" /><span className="sr-only">Private account</span>
              </span>
            )}
          </h1>
          <p className="truncate text-callout text-fg-subtle">
            @{profile.username}
            {profile.pronouns && <span> · {profile.pronouns}</span>}
          </p>
          {badgesOf(profile).length > 0 && <div className="mt-1.5"><ProfileBadges badges={badgesOf(profile)} /></div>}
          <dl className="mt-3 flex gap-5">
            <Stat label="Posts" value={postCount} />
            <Stat label="Followers" value={profile.followerCount || 0} onClick={onShowFollows ? () => onShowFollows("followers") : undefined} />
            <Stat label="Following" value={profile.followingCount || 0} onClick={onShowFollows ? () => onShowFollows("following") : undefined} />
          </dl>
        </div>
      </div>

      {profile.bio && <RichText text={profile.bio} className="mt-4 text-body text-fg" />}

      {(profile.town || spouse || joined > 0) && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-fg-muted">
          {profile.town && <li className="flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{profile.town}</li>}
          {spouse && <li className="flex items-center gap-1.5"><Heart size={14} aria-hidden="true" />Married to @{spouse}</li>}
          {joined > 0 && (
            <li className="flex items-center gap-1.5">
              <CalendarDays size={14} aria-hidden="true" />
              Joined {new Date(joined).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </li>
          )}
        </ul>
      )}

      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </section>
  );
}

function Stat({ label, value, onClick }) {
  const inner = (
    <>
      <dd className="text-title-3 tabular">{value === null || value === undefined ? "–" : compact(value)}</dd>
      <dt className="text-caption text-fg-subtle">{label}</dt>
    </>
  );
  if (!onClick) return <div className="flex flex-col-reverse">{inner}</div>;
  return (
    <button type="button" onClick={onClick} className="press -m-1 flex flex-col-reverse rounded-control p-1 text-left hover:bg-surface-2">
      {inner}
    </button>
  );
}

export function FollowListDialog({ uid, kind, onClose }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    fetchFollowList(uid, kind).then(setItems).catch(() => setItems([]));
  }, [uid, kind]);

  return (
    <Dialog title={kind === "followers" ? "Followers" : "Following"} onClose={onClose}>
      {items === null && <div className="space-y-3 py-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>}
      {items?.length === 0 && (
        <EmptyState compact icon={Users} title={kind === "followers" ? "No followers yet" : "Not following anyone yet"} />
      )}
      <ul className="space-y-1">
        {items?.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => { onClose(); openUserProfile(f.id); }}
              className="press flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2">
              <Avatar profile={{ username: f.username || "?" }} size={36} />
              <span className="truncate text-callout font-medium">@{f.username || "unknown"}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function PostGrid({ posts, emptyTitle, emptyBody, emptyIcon = Grid3x3, emptyAction }) {
  if (posts === null) {
    return (
      <div className="grid grid-cols-3 gap-0.5" role="status" aria-label="Loading posts">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square !rounded-none" />)}
      </div>
    );
  }
  if (!posts.length) return <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} action={emptyAction} />;
  return (
    <ul className="grid grid-cols-3 gap-0.5">
      {posts.map((p) => <Tile key={p.id} post={p} />)}
    </ul>
  );
}

export function EditProfileDialog({ profile, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(profile.name || profile.username || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [pronouns, setPronouns] = useState(profile.pronouns || "");
  const [town, setTown] = useState(profile.town || "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const [handle, setHandle] = useState(profile.username || "");
  const [handleMsg, setHandleMsg] = useState({ tone: "info", text: "" });
  const [handleBusy, setHandleBusy] = useState(false);
  const cooldown = usernameCooldown(profile);

  const [spouseTerm, setSpouseTerm] = useState("");
  const [spouseResults, setSpouseResults] = useState([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (spouseTerm.trim().length >= 2) {
        setSpouseResults((await searchUsers(spouseTerm).catch(() => [])).filter((u) => u.id !== me()));
      } else setSpouseResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [spouseTerm]);

  const save = async (e) => {
    e.preventDefault();
    const next = {};
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 50) next.name = "Your name needs 1–50 characters.";
    const vBio = validateText(bio, LIMITS.bio, "Bio");
    if (vBio.error) next.bio = vBio.error;
    const vPro = validateText(pronouns, LIMITS.pronouns, "Pronouns");
    if (vPro.error) next.pronouns = vPro.error;
    const vTown = validateText(town, LIMITS.town, "Town");
    if (vTown.error) next.town = vTown.error;
    if (!Object.keys(next).length) {
      const mod = checkContent(`${trimmed}\n${vBio.text}\n${vPro.text}\n${vTown.text}`, { skipCooldown: true });
      if (mod.error) next.bio = mod.error;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const fields = { name: trimmed, bio: vBio.text, pronouns: vPro.text, town: vTown.text };
      await updateProfileFields(me(), fields);
      onSaved({ ...profile, ...fields });
      toast({ title: "Profile updated" });
    } catch {
      setErrors({ submit: "Couldn't save your changes. Check your connection and try again." });
      setBusy(false);
    }
  };

  const saveHandle = async () => {
    const v = validateUsername(handle);
    if (v.error) return setHandleMsg({ tone: "error", text: v.error });
    setHandleBusy(true);
    try {
      await changeUsername(profile, v.username);
      onSaved({ ...profile, username: v.username, usernameChangedAt: { toMillis: () => Date.now() } }, { keepOpen: true });
      setHandleMsg({ tone: "success", text: `You're now @${v.username}.` });
    } catch (err) {
      setHandleMsg({ tone: "error", text: err.message });
    } finally { setHandleBusy(false); }
  };

  const inviteSpouse = async (u) => {
    try {
      await sendSpouseRequest(u);
      onSaved({ ...profile, spouseUsername: `${u.username} (pending)` }, { keepOpen: true });
      setSpouseTerm("");
      toast({ title: `Invite sent to @${u.username}`, body: "It shows on both profiles once they accept." });
    } catch {
      toast({ tone: "error", title: "Couldn't send the invite" });
    }
  };

  return (
    <Dialog title="Edit profile" onClose={onClose} variant="full" size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0"><InlineMessage>{errors.submit}</InlineMessage></div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form="edit-profile" variant="primary" loading={busy}>Save profile</Button>
          </div>
        </div>
      }>
      <form id="edit-profile" onSubmit={save} className="space-y-5" noValidate>
        <div>
          <p className="mb-2 text-callout font-medium text-fg">Profile photo</p>
          <PhotoField />
        </div>
        <Field label="Name" hint="Shown on everything you post. Names can repeat." error={errors.name} count={name.length} max={50}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoComplete="name" />
        </Field>

        <div>
          <Field label="Handle" error={handleMsg.tone === "error" ? handleMsg.text : ""}
            hint={handleMsg.tone === "success" ? "" : cooldown.canChange
              ? `Unique to you. After changing it you'll wait ${USERNAME_COOLDOWN_DAYS} days to change it again.`
              : `You can change your handle again in ${cooldown.daysLeft} day${cooldown.daysLeft === 1 ? "" : "s"}.`}>
            <Input value={handle} disabled={!cooldown.canChange} maxLength={30} autoCapitalize="none" spellCheck={false}
              onChange={(e) => { setHandle(e.target.value.toLowerCase()); setHandleMsg({ tone: "info", text: "" }); }} />
          </Field>
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" onClick={saveHandle} loading={handleBusy}
              disabled={!cooldown.canChange || handle === profile.username}>
              Change handle
            </Button>
            <div aria-live="polite">{handleMsg.tone === "success" && <InlineMessage tone="success">{handleMsg.text}</InlineMessage>}</div>
          </div>
        </div>

        <Field label="Bio" optional error={errors.bio} count={bio.length} max={LIMITS.bio}>
          <Textarea autoGrow rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={LIMITS.bio}
            placeholder="Tell people your story" />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Pronouns" optional error={errors.pronouns}>
            <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={LIMITS.pronouns}
              placeholder="e.g. she/her" list="pronoun-options" />
          </Field>
          <Field label="Town" optional error={errors.town}>
            <Input value={town} onChange={(e) => setTown(e.target.value)} maxLength={LIMITS.town} placeholder="e.g. Melbourne" />
          </Field>
        </div>
        <datalist id="pronoun-options">
          <option value="she/her" /><option value="he/him" /><option value="they/them" />
          <option value="she/they" /><option value="he/they" />
        </datalist>

        <div>
          <Field label="Spouse" optional
            hint={profile.spouseUsername
              ? (profile.spouseUsername.includes("pending") ? `Invite pending: @${profile.spouseUsername.replace(" (pending)", "")}` : `Married to @${profile.spouseUsername}`)
              : "Invite them by handle. It only shows once they accept."}>
            <Input value={spouseTerm} onChange={(e) => setSpouseTerm(e.target.value)} placeholder="Search a handle" autoCapitalize="none" />
          </Field>
          {spouseResults.length > 0 && (
            <ul className="mt-2 space-y-1">
              {spouseResults.map((u) => (
                <li key={u.id} className="flex min-h-12 items-center gap-3 rounded-control bg-surface-2 px-3">
                  <Avatar profile={u} size={32} />
                  <span className="min-w-0 flex-1 truncate text-callout">@{u.username}</span>
                  <Button size="sm" onClick={() => inviteSpouse(u)}>Invite</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </Dialog>
  );
}
