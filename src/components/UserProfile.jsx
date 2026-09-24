import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, UserPlus, UserCheck, Lock, Grid3x3, Repeat2, UserX, Link2 } from "lucide-react";
import {
  fetchProfile, fetchPostsByAuthor, fetchRepostedPosts, toggleFollow, openDirectChat,
} from "../lib/db";
import { goBack, navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { EmptyState, Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";
import { ProfileHeader, FollowListDialog, PostGrid } from "./ProfileParts";

/* Someone else's profile, opened over whatever you were doing. It has its
   own URL, so Back closes it and the page underneath is exactly as you left it. */
export default function UserProfile({ uid }) {
  const { following, setFollowing } = useShell();
  const toast = useToast();
  const [profile, setProfile] = useState(undefined);
  const [posts, setPosts] = useState(null);
  const [reposts, setReposts] = useState(null);
  const [tab, setTab] = useState("posts");
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [follows, setFollows] = useState(null);
  const followed = following.has(uid);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(uid).then((p) => { if (!cancelled) setProfile(p); }).catch(() => { if (!cancelled) setProfile(null); });
    fetchPostsByAuthor(uid)
      .then((l) => { if (!cancelled) setPosts(l.filter((p) => !p.groupId && (p.visibility !== "followers" || following.has(uid)))); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
    // Following changes are reflected by the button; refetching posts on every follow would flash the grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (tab === "reposts" && reposts === null) fetchRepostedPosts(uid).then(setReposts).catch(() => setReposts([]));
  }, [tab, reposts, uid]);

  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector("[role=dialog] [role=dialog], .z-sheet")) goBack("/"); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);

  const follow = async () => {
    if (busy || !profile) return;
    setBusy(true);
    try {
      await toggleFollow(profile, followed);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (followed) next.delete(uid); else next.add(uid);
        return next;
      });
      setProfile((p) => ({ ...p, followerCount: Math.max(0, (p.followerCount || 0) + (followed ? -1 : 1)) }));
    } catch {
      toast({ tone: "error", title: "Couldn't update follow", body: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  const message = async () => {
    setMessaging(true);
    try {
      const chatId = await openDirectChat(profile);
      navigate(`/messages/${chatId}`);
    } catch {
      setMessaging(false);
      toast({ tone: "error", title: "Couldn't open the conversation" });
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/u/${uid}`;
    try {
      if (navigator.share) await navigator.share({ title: `@${profile.username} on Mesh`, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Profile link copied" }); }
    } catch { /* dismissed */ }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={profile ? `@${profile.username}` : "Profile"}
      className="fixed inset-0 z-overlay overflow-y-auto bg-canvas anim-fade md:left-[76px] xl:left-64">
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/")} />
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{profile ? `@${profile.username}` : ""}</p>
        {profile && <IconButton icon={Link2} label="Share profile" onClick={share} />}
      </header>

      <div className="mx-auto max-w-[760px] pb-16">
        {profile === undefined && (
          <div className="flex items-start gap-4 px-4 pt-5 md:px-6" role="status" aria-label="Loading profile">
            <Skeleton className="h-[88px] w-[88px] !rounded-full" />
            <div className="flex-1 space-y-3 pt-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-56" /></div>
          </div>
        )}

        {profile === null && (
          <EmptyState icon={UserX} title="This account isn't available"
            body="It may have been deleted, or the link is wrong."
            action={<Button onClick={() => goBack("/")}>Go back</Button>} />
        )}

        {profile && (
          <>
            <ProfileHeader profile={profile} postCount={posts?.length ?? null} onShowFollows={setFollows}
              actions={
                <>
                  <Button className="flex-1" variant={followed ? "secondary" : "primary"} icon={followed ? UserCheck : UserPlus}
                    loading={busy} onClick={follow} aria-label={followed ? `Unfollow @${profile.username}` : `Follow @${profile.username}`}>
                    {followed ? "Following" : "Follow"}
                  </Button>
                  <Button className="flex-1" icon={MessageCircle} loading={messaging} onClick={message}>Message</Button>
                </>
              } />

            <Tabs variant="underline" label="Profile content" value={tab} onChange={setTab} className="px-2 md:px-4"
              tabs={[{ id: "posts", label: "Posts" }, { id: "reposts", label: "Reposts" }]} />

            <div role="tabpanel" className="pt-0.5">
              {tab === "posts" ? (
                <PostGrid posts={posts} emptyIcon={Grid3x3} emptyTitle="No posts yet"
                  emptyBody={followed ? `When @${profile.username} posts, it'll show up here.` : `Follow @${profile.username} to see followers-only posts too.`} />
              ) : (
                <PostGrid posts={reposts} emptyIcon={Repeat2} emptyTitle="No reposts yet" />
              )}
            </div>

            {!followed && posts?.length === 0 && (
              <p className="flex items-center justify-center gap-1.5 px-4 text-caption text-fg-subtle">
                <Lock size={13} aria-hidden="true" /> Some posts may be for followers only.
              </p>
            )}
          </>
        )}
      </div>

      {follows && <FollowListDialog uid={uid} kind={follows} onClose={() => setFollows(null)} />}
    </div>
  );
}
