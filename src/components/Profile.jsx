import { useEffect, useRef, useState } from "react";
import { Settings, Link2, Camera, Grid3x3, Repeat2, Bookmark, Lock, Plus, Info, HeartHandshake } from "lucide-react";
import {
  fetchPostsByAuthor, fetchRepostedPosts, fetchSavedPosts, uploadAvatar, fetchIncomingSpouseRequests,
  respondSpouseRequest, isMinor, me, StorageUnavailableError, fetchMySpouseRequestStatus, updateProfileFields,
} from "../lib/db";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import { useBrick } from "../lib/useBrick";
import LockScreen from "./LockScreen";
import TopBar from "./shell/TopBar";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { useToast } from "./ui/toast-context";
import { ProfileHeader, FollowListDialog, PostGrid, EditProfileDialog } from "./ProfileParts";

/* The Account tab opens on your public profile: exactly what other people
   see. Private settings are one tap away behind the gear, and say so. */
export default function Profile() {
  const { profile, setProfile, openComposer } = useShell();
  const brick = useBrick();
  const feedLock = brick.state("feed");
  const toast = useToast();
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState(null);
  const [reposts, setReposts] = useState(null);
  const [saved, setSaved] = useState(null);
  const [editing, setEditing] = useState(false);
  const [follows, setFollows] = useState(null);
  const [spouseRequests, setSpouseRequests] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    fetchPostsByAuthor(me()).then((l) => setPosts(l.filter((p) => !p.groupId))).catch(() => setPosts([]));
    fetchIncomingSpouseRequests().then(setSpouseRequests).catch(() => {});
  }, []);

  // An invite you sent shows as "(pending)" on your profile until the other
  // person answers. Once they have, settle it here: linked if they accepted,
  // cleared if they declined.
  const pending = profile?.spouseUsername?.endsWith(" (pending)") ? profile.spouseUsername : "";
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    fetchMySpouseRequestStatus().then(async (req) => {
      if (!alive || !req || `${req.toUsername} (pending)` !== pending || req.status === "pending") return;
      const next = req.status === "accepted" ? req.toUsername : "";
      await updateProfileFields(me(), { spouseUsername: next });
      if (alive) setProfile((p) => ({ ...p, spouseUsername: next }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [pending, setProfile]);

  useEffect(() => {
    if (tab === "reposts" && reposts === null) fetchRepostedPosts(me()).then(setReposts).catch(() => setReposts([]));
    if (tab === "saved" && saved === null) fetchSavedPosts().then(setSaved).catch(() => setSaved([]));
  }, [tab, reposts, saved]);

  const changeAvatar = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ tone: "error", title: "Choose an image for your profile picture" });
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      setProfile({ ...profile, photoURL: url });
      toast({ title: "Profile picture updated" });
    } catch (err) {
      toast({
        tone: "error",
        title: err instanceof StorageUnavailableError ? "Photo uploads aren't switched on yet" : "Couldn't update your picture",
        body: err instanceof StorageUnavailableError ? "They need Firebase Cloud Storage (Blaze plan)." : "Try again in a moment.",
      });
    } finally { setUploading(false); }
  };

  const shareProfile = async () => {
    const url = `${window.location.origin}/u/${me()}`;
    try {
      if (navigator.share) await navigator.share({ title: `@${profile.username} on Mesh`, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Profile link copied" }); }
    } catch { /* share dismissed */ }
  };

  const respond = async (r, accept) => {
    try {
      await respondSpouseRequest(r, accept);
      setSpouseRequests((prev) => prev.filter((x) => x.id !== r.id));
      if (accept) setProfile({ ...profile, spouseUsername: r.fromUsername });
      toast({ title: accept ? `You and @${r.fromUsername} are linked` : "Invite declined" });
    } catch {
      toast({ tone: "error", title: "Couldn't respond to the invite" });
    }
  };

  return (
    <>
      <TopBar title={`@${profile.username}`}
        right={<IconButton icon={Settings} label="Settings" onClick={() => navigate("/account/settings")} />} />

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] pb-10">
          <div className="hidden items-center justify-end gap-2 px-6 pt-4 md:flex">
            <Button size="sm" variant="ghost" icon={Settings} onClick={() => navigate("/account/settings")}>Settings</Button>
          </div>

          {spouseRequests.map((r) => (
            <div key={r.id} role="status" className="mx-4 mt-4 flex items-center gap-3 rounded-card border border-fuchsia-500/30 bg-fuchsia-500/10 p-4 md:mx-6">
              <HeartHandshake size={22} className="shrink-0 text-like" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-callout"><strong>@{r.fromUsername}</strong> listed you as their spouse.</p>
              <Button size="sm" onClick={() => respond(r, false)}>Decline</Button>
              <Button size="sm" variant="primary" onClick={() => respond(r, true)}>Accept</Button>
            </div>
          ))}

          <div className="relative">
            <ProfileHeader profile={profile} postCount={posts?.length ?? null}
              onShowFollows={(kind) => setFollows(kind)}
              actions={
                <>
                  <Button className="flex-1" onClick={() => setEditing(true)}>Edit profile</Button>
                  <Button className="flex-1" icon={Link2} onClick={shareProfile}>Share profile</Button>
                </>
              } />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              aria-label="Change profile picture"
              className="press absolute left-[76px] top-[84px] flex h-9 w-9 items-center justify-center rounded-full border-2 border-canvas bg-surface-3 text-fg hover:bg-accent md:left-[84px]">
              <Camera size={16} aria-hidden="true" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={changeAvatar} tabIndex={-1} aria-hidden="true" />
          </div>

          {isMinor(profile) && (
            <p className="mx-4 mb-3 flex items-start gap-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted md:mx-6">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Under-16 accounts post to followers only. Only you can see this note.
            </p>
          )}

          <Tabs variant="underline" label="Profile content" value={tab} onChange={setTab} className="px-2 md:px-4"
            tabs={[
              { id: "posts", label: "Posts" },
              { id: "reposts", label: "Reposts" },
              { id: "saved", label: "Saved" },
            ]} />

          {feedLock ? (
            <LockScreen compact section="feed" lock={feedLock} opensAt={brick.opensAt("feed")} now={brick.now} parentName={brick.policy?.parent?.parentName} />
          ) : (
          <div role="tabpanel" className="pt-0.5">
            {tab === "posts" && (
              <PostGrid posts={posts} emptyIcon={Grid3x3} emptyTitle="Share your first post"
                emptyBody="Flicks, Stills and Strands you post show up here."
                emptyAction={<Button variant="primary" icon={Plus} onClick={() => openComposer()}>Create</Button>} />
            )}
            {tab === "reposts" && (
              <PostGrid posts={reposts} emptyIcon={Repeat2} emptyTitle="No reposts yet"
                emptyBody="When you repost something, it's shown to your followers and kept here." />
            )}
            {tab === "saved" && (
              <>
                <p className="flex items-center gap-2 px-4 py-3 text-caption text-fg-subtle md:px-6">
                  <Lock size={14} aria-hidden="true" /> Only you can see this tab.
                </p>
                <PostGrid posts={saved} emptyIcon={Bookmark} emptyTitle="Nothing saved yet"
                  emptyBody="Tap the bookmark on any post to keep it here." />
              </>
            )}
          </div>
          )}

        </div>
      </div>

      {editing && (
        <EditProfileDialog profile={profile} onClose={() => setEditing(false)}
          onSaved={(p, opts) => { setProfile(p); if (!opts?.keepOpen) setEditing(false); }} />
      )}
      {follows && <FollowListDialog uid={me()} kind={follows} onClose={() => setFollows(null)} />}
    </>
  );
}
