import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, UserPlus, UserCheck, Lock, Grid3x3, Repeat2, UserX, Link2, Clock, Ellipsis, Ban, Flag } from "lucide-react";
import ReportDialog from "./ReportDialog";
import {
  fetchProfile, fetchPostsByAuthor, fetchRepostedPosts, toggleFollow, openDirectChat,
  hasRequestedFollow, cancelFollowRequest, blockUser, unblockUser,
} from "../lib/db";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { MenuItem, MenuGroup } from "./ui/Menu";
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
  const { following, setFollowing, blocked, setBlocked } = useShell();
  const toast = useToast();
  const [profile, setProfile] = useState(undefined);
  const [posts, setPosts] = useState(null);
  const [reposts, setReposts] = useState(null);
  const [tab, setTab] = useState("posts");
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [follows, setFollows] = useState(null);
  const [requested, setRequested] = useState(false);
  const [dialog, setDialog] = useState(null); // menu | block
  const followed = following.has(uid);
  const isBlocked = blocked.has(uid);
  const locked = !!profile?.isPrivate && !following.has(uid);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(uid).then((p) => { if (!cancelled) setProfile(p); }).catch(() => { if (!cancelled) setProfile(null); });
    hasRequestedFollow(uid).then((r) => { if (!cancelled) setRequested(r); });
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

  /* Follow, request (private accounts), cancel a request, or unfollow. */
  const follow = async () => {
    if (busy || !profile) return;
    setBusy(true);
    try {
      if (requested) {
        await cancelFollowRequest(uid);
        setRequested(false);
        toast({ title: "Request cancelled" });
        return;
      }
      const result = await toggleFollow(profile, followed);
      if (result === "requested") {
        setRequested(true);
        toast({ title: "Request sent", body: `@${profile.username} will decide whether to approve it.` });
        return;
      }
      setFollowing((prev) => {
        const next = new Set(prev);
        if (followed) next.delete(uid); else next.add(uid);
        return next;
      });
      setProfile((p) => ({ ...p, followerCount: Math.max(0, (p.followerCount || 0) + (followed ? -1 : 1)) }));
    } catch (err) {
      toast({ tone: "error", title: err?.code === "permission-denied" ? "You can't follow this account" : "Couldn't update follow",
        body: err?.code === "permission-denied" ? undefined : "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    try {
      if (isBlocked) {
        await unblockUser(uid);
        setBlocked((prev) => { const n = new Set(prev); n.delete(uid); return n; });
        toast({ title: `Unblocked @${profile.username}` });
      } else {
        await blockUser(profile);
        setBlocked((prev) => new Set(prev).add(uid));
        setFollowing((prev) => { const n = new Set(prev); n.delete(uid); return n; });
        setRequested(false);
        toast({ title: `Blocked @${profile.username}`, body: "They can't follow you, message you or comment on your posts." });
      }
    } catch { toast({ tone: "error", title: "Couldn't update the block" }); }
    setDialog(null);
  };

  const message = async () => {
    setMessaging(true);
    try {
      const chatId = await openDirectChat(profile);
      navigate(`/messages/${chatId}`);
    } catch (err) {
      setMessaging(false);
      toast({ tone: "error", title: err?.message?.startsWith("You can't") ? err.message : "Couldn't open the conversation" });
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
        {profile && <IconButton icon={Ellipsis} label="More options" onClick={() => setDialog("menu")} />}
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
            <ProfileHeader profile={profile} postCount={locked ? null : posts?.length ?? null}
              onShowFollows={locked ? undefined : setFollows}
              actions={isBlocked ? (
                <Button className="flex-1" icon={Ban} onClick={() => setDialog("block")}>Unblock</Button>
              ) : (
                <>
                  <Button className="flex-1" variant={followed || requested ? "secondary" : "primary"}
                    icon={followed ? UserCheck : requested ? Clock : UserPlus} loading={busy} onClick={follow}
                    aria-label={followed ? `Unfollow @${profile.username}` : requested ? `Cancel follow request to @${profile.username}` : `Follow @${profile.username}`}>
                    {followed ? "Following" : requested ? "Requested" : profile.isPrivate ? "Request to follow" : "Follow"}
                  </Button>
                  <Button className="flex-1" icon={MessageCircle} loading={messaging} onClick={message}>Message</Button>
                </>
              )} />

            {isBlocked ? (
              <EmptyState icon={Ban} title={`You've blocked @${profile.username}`}
                body="You won't see their posts, and they can't follow you, message you or comment on your posts." />
            ) : locked ? (
              <EmptyState icon={Lock} title="This account is private"
                body={requested ? "Your request is waiting for their approval." : `Follow @${profile.username} to see their posts. They'll need to approve you.`} />
            ) : (
              <>
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
              </>
            )}
          </>
        )}
      </div>

      {follows && <FollowListDialog uid={uid} kind={follows} onClose={() => setFollows(null)} />}
      {dialog === "menu" && profile && (
        <Dialog title={`@${profile.username}`} onClose={() => setDialog(null)}>
          <MenuGroup>
            <MenuItem icon={Link2} onClick={() => { setDialog(null); share(); }}>Share profile</MenuItem>
            <MenuItem icon={Ban} danger={!isBlocked} onClick={() => setDialog("block")}
              description={isBlocked ? undefined : "They won't be told"}>
              {isBlocked ? `Unblock @${profile.username}` : `Block @${profile.username}`}
            </MenuItem>
            <MenuItem icon={Flag} danger onClick={() => setDialog("report")} description="A moderator reviews the account">
              Report @{profile.username}
            </MenuItem>
          </MenuGroup>
        </Dialog>
      )}
      {dialog === "report" && profile && (
        <ReportDialog onClose={() => setDialog(null)} target={{ type: "user", id: uid, authorId: uid }} />
      )}
      {dialog === "block" && profile && (
        <ConfirmDialog title={isBlocked ? `Unblock @${profile.username}?` : `Block @${profile.username}?`}
          confirmLabel={isBlocked ? "Unblock" : "Block"} tone={isBlocked ? "accent" : "danger"}
          body={isBlocked
            ? "They'll be able to follow and message you again. They won't be told."
            : "They won't be told. They can't follow you, message you or comment on your posts, and you'll stop seeing theirs. Any follows between you end."}
          onClose={() => setDialog(null)} onConfirm={toggleBlock} />
      )}
    </div>
  );
}
