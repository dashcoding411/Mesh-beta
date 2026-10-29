import { useEffect, useState } from "react";
import { Settings, Link2, Grid3x3, Repeat2, Plus, HeartHandshake, History, Menu } from "lucide-react";
import {
  fetchPostsByAuthor, fetchRepostedPosts, fetchSavedPosts, fetchIncomingSpouseRequests,
  respondSpouseRequest, me, fetchMySpouseRequestStatus, updateProfileFields,
} from "../lib/db";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import { EditableAvatar } from "./ProfilePhoto";
import BrickHighlight from "./BrickHighlight";
import Highlights from "./Highlights";
import SavedSection from "./SavedAlbums";
import { useBrick } from "../lib/useBrick";
import LockScreen from "./LockScreen";
import TopBar from "./shell/TopBar";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { useToast } from "./ui/toast-context";
import { ProfileHeader, FollowListDialog, PostGrid, EditProfileDialog } from "./ProfileParts";
import { JournalistCard, JournalistSettings, JournalistStories } from "./news/Journalist";
import { useJournalist, useJournalistStories } from "../lib/journalists";
import { hasPinkCheck } from "../lib/badges";
import { siteOrigin } from "../lib/native";

export default function Profile({ initialTab = null }) {
  const { profile, setProfile, openComposer, openDrawer } = useShell();
  const brick = useBrick();
  const feedLock = brick.state("feed");
  const toast = useToast();
  const [tab, setTab] = useState(initialTab);
  const loadedJournalist = useJournalist(me());
  const [editedJournalist, setEditedJournalist] = useState(null);
  const journalist = editedJournalist || loadedJournalist;
  const stories = useJournalistStories(me(), !!journalist);
  const [editingByline, setEditingByline] = useState(false);
  const current = tab ?? (journalist ? "stories" : "posts");
  const [posts, setPosts] = useState(null);
  const [reposts, setReposts] = useState(null);
  const [saved, setSaved] = useState(null);
  const [editing, setEditing] = useState(false);
  const [follows, setFollows] = useState(null);
  const [spouseRequests, setSpouseRequests] = useState([]);

  useEffect(() => {
    fetchPostsByAuthor(me()).then((l) => setPosts(l.filter((p) => !p.groupId))).catch(() => setPosts([]));
    fetchIncomingSpouseRequests().then(setSpouseRequests).catch(() => {});
  }, []);

  // Settle a sent spouse invite once the other person has answered.
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
    if (current === "reposts" && reposts === null) fetchRepostedPosts(me()).then(setReposts).catch(() => setReposts([]));
    if (current === "saved" && saved === null) fetchSavedPosts().then(setSaved).catch(() => setSaved([]));
  }, [current, reposts, saved]);

  const shareProfile = async () => {
    const url = `${siteOrigin()}/@${profile.username}`;
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
    <div className={`flex min-h-0 flex-1 flex-col ${hasPinkCheck(profile.badges) ? "theme-pink bg-canvas" : ""}`}>
      <TopBar title={`@${profile.username}`}
        left={<IconButton icon={Menu} label="Open Home sections" onClick={openDrawer} />}
        right={(
          <>
            <IconButton icon={History} label="Story archive" onClick={() => navigate("/account/archive")} />
            <IconButton icon={Settings} label="Settings" onClick={() => navigate("/account/settings")} />
          </>
        )} />

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] pb-10">
          <div className="hidden items-center justify-end gap-2 px-6 pt-4 md:flex">
            <Button size="sm" variant="ghost" icon={History} onClick={() => navigate("/account/archive")}>Story archive</Button>
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
              onShowFollows={(kind) => setFollows(kind)} avatar={<EditableAvatar size={88} />}
              featured={journalist && <JournalistCard uid={profile.id} journalist={journalist} stories={stories} onEdit={() => setEditingByline(true)} className="" />}
              actions={
                <>
                  <Button className="flex-1" onClick={() => setEditing(true)}>Edit profile</Button>
                  <Button className="flex-1" icon={Link2} onClick={shareProfile}>Share profile</Button>
                </>
              } />
          </div>

          <Highlights profile={profile} own />
          <BrickHighlight uid={profile.id} own />

          <Tabs variant="underline" label="Profile content" value={current} onChange={setTab} className="px-2 md:px-4"
            tabs={[
              ...(journalist ? [{ id: "stories", label: "Stories" }] : []),
              { id: "posts", label: "Posts" },
              { id: "reposts", label: "Reposts" },
              { id: "saved", label: "Saved" },
            ]} />

          {feedLock ? (
            <LockScreen compact section="feed" lock={feedLock} opensAt={brick.opensAt("feed")} now={brick.now} parentName={brick.policy?.parent?.parentName} />
          ) : (
          <div role="tabpanel" className="pt-0.5">
            {current === "stories" && <JournalistStories stories={stories} />}
            {current === "posts" && (
              <PostGrid posts={posts} emptyIcon={Grid3x3} emptyTitle="Share your first post"
                emptyBody="Flicks, Stills and Strands you post show up here."
                emptyAction={<Button variant="primary" icon={Plus} onClick={() => openComposer()}>Create</Button>} />
            )}
            {current === "reposts" && (
              <PostGrid posts={reposts} emptyIcon={Repeat2} emptyTitle="No reposts yet"
                emptyBody="When you repost something, it's shown to your followers and kept here." />
            )}
            {current === "saved" && <SavedSection saved={saved} />}
          </div>
          )}

        </div>
      </div>

      {editingByline && journalist && (
        <JournalistSettings journalist={journalist} onClose={() => setEditingByline(false)}
          onSaved={(j) => { setEditedJournalist(j); setEditingByline(false); }} />
      )}
      {editing && (
        <EditProfileDialog profile={profile} onClose={() => setEditing(false)}
          onSaved={(p, opts) => { setProfile(p); if (!opts?.keepOpen) setEditing(false); }} />
      )}
      {follows && <FollowListDialog uid={me()} kind={follows} onClose={() => setFollows(null)} />}
    </div>
  );
}
