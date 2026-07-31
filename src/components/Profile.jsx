import { useEffect, useRef, useState } from "react";
import {
  fetchPostsByAuthor, fetchMyLikes, updateProfileFields, uploadAvatar,
  fetchFollowList, fetchIncomingSpouseRequests, respondSpouseRequest,
  sendSpouseRequest, searchUsers, isMinor, me, StorageUnavailableError,
  changeUsername, usernameCooldown, USERNAME_COOLDOWN_DAYS,
  fetchSavedPosts, fetchMySaves,
} from "../lib/db";
import { LIMITS, validateText, validateUsername } from "../lib/validate";
import { checkContent } from "../lib/moderation";
import { Avatar } from "./Nav";
import PostCard from "./PostCard";

export default function Profile({ profile, onProfileChange }) {
  const [posts, setPosts] = useState(null);
  const [liked, setLiked] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [followList, setFollowList] = useState(null); // {kind, items}
  const [spouseRequests, setSpouseRequests] = useState([]);
  const [avatarError, setAvatarError] = useState("");
  const [tab, setTab] = useState("posts");
  const [savedIds, setSavedIds] = useState(new Set());
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPostsByAuthor(me());
        if (cancelled) return;
        setPosts(list);
        const [likes, saves] = await Promise.all([
          fetchMyLikes(list.map((p) => p.id)),
          fetchMySaves(list.map((p) => p.id)).catch(() => new Set()),
        ]);
        if (!cancelled) { setLiked(likes); setSavedIds(saves); }
      } catch (err) {
        console.error(err);
        if (!cancelled) setPosts([]);
      }
    })();
    fetchIncomingSpouseRequests().then(setSpouseRequests).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const changeAvatar = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const url = await uploadAvatar(file);
      onProfileChange({ ...profile, photoURL: url });
      setAvatarError("");
    } catch (err) {
      console.error(err);
      setAvatarError(err instanceof StorageUnavailableError ? err.message : "Couldn't update your picture.");
    }
  };

  const showFollows = async (kind) => {
    const items = await fetchFollowList(me(), kind).catch(() => []);
    setFollowList({ kind, items });
  };

  const respondSpouse = async (r, accept) => {
    await respondSpouseRequest(r, accept);
    setSpouseRequests((prev) => prev.filter((x) => x.id !== r.id));
    if (accept) onProfileChange({ ...profile, spouseUsername: r.fromUsername });
  };

  const onLikedChange = (id, isLiked) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (isLiked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const onSavedChange = (id, isSaved) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.add(id); else next.delete(id);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-xl mx-auto px-4 py-6">
        {spouseRequests.map((r) => (
          <div key={r.id} className="mb-4 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4 anim-rise">
            <p className="text-sm">💍 <strong>@{r.fromUsername}</strong> says you're their spouse.</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => respondSpouse(r, true)} className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-1.5 text-xs font-semibold">Accept</button>
              <button onClick={() => respondSpouse(r, false)} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 text-xs font-semibold">Decline</button>
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 mb-6 anim-rise">
          <div className="flex items-center gap-4">
            <button onClick={() => fileRef.current?.click()} className="relative group shrink-0" aria-label="Change profile picture">
              <Avatar profile={profile} size={16} />
              <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs transition">
                Edit
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={changeAvatar} />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate">
                {profile.name || profile.username}
                {profile.pronouns && <span className="ml-2 text-sm font-normal text-zinc-500">({profile.pronouns})</span>}
              </h2>
              <p className="text-sm text-zinc-500 truncate">@{profile.username}</p>
              <div className="flex gap-4 mt-1 text-sm">
                <button onClick={() => showFollows("followers")} className="hover:text-violet-300">
                  <strong>{profile.followerCount || 0}</strong> <span className="text-zinc-500">followers</span>
                </button>
                <button onClick={() => showFollows("following")} className="hover:text-violet-300">
                  <strong>{profile.followingCount || 0}</strong> <span className="text-zinc-500">following</span>
                </button>
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("mesh:goto-tab", { detail: "account" }))}
              className="min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3 text-xs font-semibold shrink-0"
            >
              Account settings
            </button>
          </div>

          {avatarError && <p className="mt-3 text-xs text-amber-400">{avatarError}</p>}

          <div className="mt-4 space-y-1 text-sm text-zinc-300">
            {profile.bio && <p className="whitespace-pre-wrap">{profile.bio}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 pt-1">
              {profile.town && <span>📍 {profile.town}</span>}
              {profile.birthYear > 0 && <span>🎂 born {profile.birthYear}</span>}
              {profile.spouseUsername && <span>💍 {profile.spouseUsername}</span>}
              {isMinor(profile) && <span className="text-amber-500">Under-16 · posts go to followers only</span>}
            </div>
          </div>

          <button onClick={() => setEditing(true)}
            className="mt-4 w-full rounded-xl border border-zinc-700 hover:border-violet-500 py-2 text-sm font-medium text-zinc-300 transition">
            Edit profile
          </button>
        </div>

        <div role="tablist" className="flex rounded-xl bg-zinc-900 p-1 mb-5 max-w-xs">
          {[["posts", "Your posts"], ["saved", "Saved"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium transition ${
                tab === id ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "posts" ? (
          <>
            {posts === null && <p className="text-zinc-500">Loading…</p>}
            {posts?.length === 0 && <p className="text-zinc-500 text-sm">You haven't shared anything yet.</p>}
            <div className="space-y-6 stagger">
              {posts?.map((p) => (
                <PostCard key={p.id} post={p} liked={liked.has(p.id)} onLikedChange={onLikedChange}
                  saved={savedIds.has(p.id)} onSavedChange={onSavedChange}
                  onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
              ))}
            </div>
          </>
        ) : (
          <SavedPosts liked={liked} onLikedChange={onLikedChange} />
        )}
      </div>

      {editing && (
        <EditProfileModal profile={profile} onClose={() => setEditing(false)}
          onSaved={(p) => { onProfileChange(p); setEditing(false); }} />
      )}

      {followList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 anim-fade" onClick={() => setFollowList(null)}>
          <div className="w-full max-w-sm max-h-[70vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-5 anim-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3 capitalize">{followList.kind}</h3>
            {followList.items.length === 0 && <p className="text-sm text-zinc-500">Nobody here yet.</p>}
            {followList.items.map((f) => (
              <p key={f.id} className="text-sm py-1.5 border-b border-zinc-800/60 last:border-0">@{f.username || f.id}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SavedPosts({ liked, onLikedChange }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    fetchSavedPosts().then(setPosts).catch((e) => { console.error(e); setPosts([]); });
  }, []);

  if (posts === null) return <p className="text-zinc-500">Loading saved…</p>;
  if (posts.length === 0) {
    return (
      <p className="text-zinc-500 text-sm">
        Nothing saved yet. Tap ☆ on any post to keep it here.
      </p>
    );
  }
  return (
    <div className="space-y-6 stagger">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} liked={liked.has(p.id)} onLikedChange={onLikedChange}
          saved onSavedChange={(id, on) => { if (!on) setPosts((prev) => prev.filter((x) => x.id !== id)); }} />
      ))}
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSaved }) {
  const [name, setName] = useState(profile.name || profile.username || "");
  const [handle, setHandle] = useState(profile.username || "");
  const [handleMsg, setHandleMsg] = useState("");
  const [handleBusy, setHandleBusy] = useState(false);
  const cooldown = usernameCooldown(profile);
  const [bio, setBio] = useState(profile.bio || "");
  const [pronouns, setPronouns] = useState(profile.pronouns || "");
  const [town, setTown] = useState(profile.town || "");
  const [birthYear, setBirthYear] = useState(profile.birthYear || "");
  const [spouseTerm, setSpouseTerm] = useState("");
  const [spouseResults, setSpouseResults] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    setError("");
    const vBio = validateText(bio, LIMITS.bio, "Bio");
    if (vBio.error) return setError(vBio.error);
    const vPro = validateText(pronouns, LIMITS.pronouns, "Pronouns");
    if (vPro.error) return setError(vPro.error);
    const vTown = validateText(town, LIMITS.town, "Town");
    if (vTown.error) return setError(vTown.error);
    const mod = checkContent(`${name}\n${vBio.text}\n${vPro.text}\n${vTown.text}`, { skipCooldown: true });
    if (mod.error) return setError(mod.error);
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      return setError("Name must be 1–50 characters.");
    }
    const y = Number(birthYear) || 0;

    setBusy(true);
    try {
      const fields = { name: trimmedName, bio: vBio.text, pronouns: vPro.text, town: vTown.text, birthYear: y };
      await updateProfileFields(me(), fields);
      onSaved({ ...profile, ...fields });
    } catch {
      setError("Couldn't save. Try again.");
      setBusy(false);
    }
  };

  const inviteSpouse = async (u) => {
    setError("");
    try {
      await sendSpouseRequest(u);
      onSaved({ ...profile, spouseUsername: `${u.username} (pending)` });
    } catch {
      setError("Couldn't send the spouse invite.");
    }
  };

  const input = "w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 anim-fade" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-3 anim-pop">
        <h3 className="font-bold text-lg">Edit profile</h3>

        <label className="block text-xs text-zinc-500">Name
          <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)}
            maxLength={50} placeholder="Alex Nguyen" />
          <span className="block mt-1 text-[11px] text-zinc-600">Shown everywhere. Names can repeat.</span>
        </label>

        <div>
          <p className="text-xs text-zinc-500 mb-1">Handle</p>
          <div className="flex gap-2">
            <input className={`${input} flex-1`} value={handle} disabled={!cooldown.canChange}
              onChange={(e) => setHandle(e.target.value.toLowerCase())} maxLength={30}
              aria-label="Handle" />
            <button type="button" disabled={!cooldown.canChange || handleBusy || handle === profile.username}
              onClick={async () => {
                setHandleMsg("");
                const v = validateUsername(handle);
                if (v.error) return setHandleMsg(v.error);
                setHandleBusy(true);
                try {
                  await changeUsername(profile, v.username);
                  onSaved({ ...profile, username: v.username, usernameChangedAt: { toMillis: () => Date.now() } });
                  setHandleMsg("Handle updated.");
                } catch (err) {
                  setHandleMsg(err.message);
                } finally { setHandleBusy(false); }
              }}
              className="min-h-[44px] shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-4 text-sm font-semibold">
              {handleBusy ? "Saving…" : "Change"}
            </button>
          </div>
          <p aria-live="polite" className="mt-1 text-[11px] text-zinc-600">
            {handleMsg ? (
              <span className={handleMsg.includes("updated") ? "text-emerald-400" : "text-red-400"}>{handleMsg}</span>
            ) : cooldown.canChange ? (
              `Unique to you. Once changed, you must wait ${USERNAME_COOLDOWN_DAYS} days to change it again.`
            ) : (
              `You can change your handle again in ${cooldown.daysLeft} day${cooldown.daysLeft === 1 ? "" : "s"}.`
            )}
          </p>
        </div>

        <label className="block text-xs text-zinc-500">Bio
          <textarea className={`${input} h-20 resize-none mt-1`} value={bio}
            onChange={(e) => setBio(e.target.value)} maxLength={LIMITS.bio} placeholder="Tell people your story…" />
        </label>
        <label className="block text-xs text-zinc-500">Pronouns
          <input className={`${input} mt-1`} value={pronouns} onChange={(e) => setPronouns(e.target.value)}
            maxLength={LIMITS.pronouns} placeholder="e.g. she/her, they/them" list="pronoun-options" />
          <datalist id="pronoun-options">
            <option value="she/her" /><option value="he/him" /><option value="they/them" />
            <option value="she/they" /><option value="he/they" />
          </datalist>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-500">Town
            <input className={`${input} mt-1`} value={town} onChange={(e) => setTown(e.target.value)}
              maxLength={LIMITS.town} placeholder="e.g. Melbourne" />
          </label>
          <label className="block text-xs text-zinc-500">Birth year
            <input className={`${input} mt-1`} type="number" value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)} placeholder="e.g. 2001" />
          </label>
        </div>

        <div>
          <p className="text-xs text-zinc-500 mb-1">Spouse {profile.spouseUsername && <span className="text-zinc-400">— currently: {profile.spouseUsername}</span>}</p>
          <input className={input} value={spouseTerm} onChange={(e) => setSpouseTerm(e.target.value)}
            placeholder="Search a username to invite…" />
          {spouseResults.map((u) => (
            <button type="button" key={u.id} onClick={() => inviteSpouse(u)}
              className="mt-1 w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-zinc-800 text-left text-sm">
              <span>@{u.username}</span>
              <span className="text-xs text-violet-400">Invite 💍</span>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 py-2.5 text-sm font-semibold">
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
