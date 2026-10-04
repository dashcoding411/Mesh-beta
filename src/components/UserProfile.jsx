import { useEffect, useState } from "react";
import {
  ArrowLeft, MessageCircle, UserPlus, UserCheck, Lock, Grid3x3, Repeat2, UserX, Link2, Clock, Ellipsis, Ban, Flag, VolumeX, Volume2, FlaskConical, BadgeCheck, Heart,
} from "lucide-react";
import ReportDialog from "./ReportDialog";
import {
  fetchProfile, fetchPostsByAuthor, fetchRepostedPosts, toggleFollow, openDirectChat,
  hasRequestedFollow, cancelFollowRequest, blockUser, unblockUser, staffRole, setBadge, setPinkCheck, me,
  uidForUsername, cachedUidFor,
} from "../lib/db";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { MenuItem, MenuGroup } from "./ui/Menu";
import { goBack, navigate, replacePath } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { EmptyState, Skeleton, Spinner } from "./ui/States";
import { useToast } from "./ui/toast-context";
import { usePageTitle } from "../lib/usePageTitle";
import { useBrick } from "../lib/useBrick";
import LockScreen from "./LockScreen";
import BrickHighlight from "./BrickHighlight";
import Highlights from "./Highlights";
import { ProfileHeader, FollowListDialog, MutualFollowers, PostGrid } from "./ProfileParts";
import { JournalistCard, JournalistStories } from "./news/Journalist";
import { useJournalist, useJournalistStories } from "../lib/journalists";
import { betaByJoinDate, FOUNDER_UID, hasPinkCheck } from "../lib/badges";
import { primeCard } from "../lib/profileCache";
import { useFocusTrap } from "../lib/useFocusTrap";

// scroll-pt keeps keyboard focus clear of the sticky header.
const OVERLAY = "fixed inset-0 z-overlay overflow-y-auto scroll-pt-16 bg-canvas anim-fade md:left-[76px] xl:left-64";

/** A profile overlay from /@handle (or an older /u/<uid> link). */
export default function UserProfile({ uid: givenUid, handle }) {
  const [lookup, setLookup] = useState({ handle: null, uid: undefined });
  const uid = givenUid || (lookup.handle === handle ? lookup.uid : cachedUidFor(handle));

  useEffect(() => {
    if (uid !== undefined) return undefined;
    let alive = true;
    uidForUsername(handle)
      .then((found) => { if (alive) setLookup({ handle, uid: found || null }); })
      .catch(() => { if (alive) setLookup({ handle, uid: null }); });
    return () => { alive = false; };
  }, [uid, handle]);

  useEffect(() => { if (uid && uid === me()) navigate("/account", { replace: true }); }, [uid]);

  if (uid === undefined) {
    return (
      <div role="dialog" aria-modal="true" aria-label={`@${handle}`} className={`${OVERLAY} flex items-center justify-center`}>
        <Spinner />
      </div>
    );
  }
  return <ProfileView key={uid || "missing"} uid={uid} />;
}

function ProfileView({ uid }) {
  const trap = useFocusTrap({ restore: false });
  const { following, setFollowing, blocked, setBlocked, muted, toggleMute, guest, needsAccount } = useShell();
  const toast = useToast();
  const [profile, setProfile] = useState(uid ? undefined : null);
  usePageTitle(profile ? `@${profile.username}` : null, 2);
  const [posts, setPosts] = useState(null);
  const [reposts, setReposts] = useState(null);
  const [tab, setTab] = useState(null);
  const journalist = useJournalist(uid);
  const stories = useJournalistStories(uid, !!journalist);
  // Journalists' profiles open on their stories.
  const current = tab ?? (journalist ? "stories" : "posts");
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [follows, setFollows] = useState(null);
  const [requested, setRequested] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [dialog, setDialog] = useState(null); // "menu" | "block"
  const followed = following.has(uid);
  const isBlocked = blocked.has(uid);
  const isMuted = muted.has(uid);
  const brick = useBrick();
  const feedLock = brick.state("feed");
  const locked = !!profile?.isPrivate && !following.has(uid);

  // The address shows the handle, never the account ID.
  const username = profile?.username;
  useEffect(() => {
    if (username && window.location.pathname !== `/@${username}`) replacePath(`/@${username}${window.location.search}`);
  }, [username]);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    fetchProfile(uid).then((p) => { if (!cancelled) setProfile(p); }).catch(() => { if (!cancelled) setProfile(null); });
    if (!guest) hasRequestedFollow(uid).then((r) => { if (!cancelled) setRequested(r); });
    if (!guest) staffRole().then((r) => { if (!cancelled) setAdmin(!!r); }).catch(() => {});
    fetchPostsByAuthor(uid, { follower: following.has(uid) })
      .then((l) => { if (!cancelled) setPosts(l.filter((p) => !p.groupId && (p.visibility !== "followers" || following.has(uid)))); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
    // Don't refetch on follow changes; the button reflects them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (current === "reposts" && reposts === null) fetchRepostedPosts(uid).then(setReposts).catch(() => setReposts([]));
  }, [current, reposts, uid]);

  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector("[role=dialog] [role=dialog], .z-sheet")) goBack("/"); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);

  const follow = async () => {
    if (needsAccount("follow people")) return;
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
    if (needsAccount("message people")) return;
    setMessaging(true);
    try {
      const chatId = await openDirectChat(profile);
      navigate(`/messages/${chatId}`);
    } catch (err) {
      setMessaging(false);
      toast({ tone: "error", title: err?.message?.startsWith("You can't") ? err.message : "Couldn't open the conversation" });
    }
  };

  const toggleBadge = async (badge) => {
    const on = !profile.badges?.includes(badge);
    setDialog(null);
    try {
      await setBadge(uid, badge, on);
      const badges = on ? [...(profile.badges || []), badge] : (profile.badges || []).filter((b) => b !== badge);
      setProfile((p) => ({ ...p, badges }));
      primeCard(uid, { ...profile, badges }); // so their posts and comments update now
      toast({ title: on ? (badge === "verified" ? `@${profile.username} is verified` : `@${profile.username} is a beta tester`) : badge === "verified" ? "Verification removed" : "Badge removed" });
    } catch {
      toast({ tone: "error", title: "Couldn't change the badge", body: "Only Mesh admins and moderators can do this." });
    }
  };

  const togglePink = async () => {
    const on = !profile.badges?.includes("pink");
    setDialog(null);
    try {
      await setPinkCheck(uid, on);
      const badges = on ? [...(profile.badges || []), "pink"] : (profile.badges || []).filter((b) => b !== "pink");
      setProfile((p) => ({ ...p, badges }));
      primeCard(uid, { ...profile, badges });
      toast({ title: on ? `@${profile.username} has girlfriend privilege` : "Girlfriend privilege removed",
        body: on ? "Pink check, pink profile and a pink banner." : undefined });
    } catch {
      toast({ tone: "error", title: "Couldn't change girlfriend privilege" });
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/@${profile.username}`;
    try {
      if (navigator.share) await navigator.share({ title: `@${profile.username} on Mesh`, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Profile link copied" }); }
    } catch { /* dismissed */ }
  };

  return (
    <div ref={trap} role="dialog" aria-modal="true" aria-label={profile ? `@${profile.username}` : "Profile"}
      className={`${OVERLAY} ${hasPinkCheck(profile?.badges) ? "theme-pink" : ""}`}>
      <header className="sticky top-0 z-nav flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-safe backdrop-blur">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/")} />
        <p className="min-w-0 flex-1 truncate text-callout font-semibold">{profile ? `@${profile.username}` : ""}</p>
        {profile && <IconButton icon={Link2} label="Share profile" onClick={share} />}
        {profile && !guest && <IconButton icon={Ellipsis} label="More options" onClick={() => setDialog("menu")} />}
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
            body={guest ? "It may have been deleted, or you may need to log in to see it." : "It may have been deleted, or the link is wrong."}
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

            {!isBlocked && <MutualFollowers uid={uid} onOpen={() => setFollows("mutual")} />}
            {!isBlocked && !locked && !guest && <Highlights profile={profile} />}
            {!isBlocked && <BrickHighlight uid={uid} />}
            {!isBlocked && journalist && <JournalistCard uid={uid} journalist={journalist} stories={stories} />}
            {isMuted && !isBlocked && (
              <p role="status" className="mx-4 mb-3 flex items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5 text-caption text-fg-muted md:mx-6">
                <VolumeX size={16} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">You've muted @{profile.username}. Their posts don't show in your feeds.</span>
                <Button size="sm" variant="ghost" onClick={() => toggleMute({ id: uid, username: profile.username }, false)}>Unmute</Button>
              </p>
            )}
            {isBlocked ? (
              <EmptyState icon={Ban} title={`You've blocked @${profile.username}`}
                body="You won't see their posts, and they can't follow you, message you or comment on your posts." />
            ) : locked ? (
              <EmptyState icon={Lock} title="This account is private"
                body={requested ? "Your request is waiting for their approval." : `Follow @${profile.username} to see their posts. They'll need to approve you.`} />
            ) : (
              <>
                <Tabs variant="underline" label="Profile content" value={current} onChange={setTab} className="px-2 md:px-4"
                  tabs={[...(journalist ? [{ id: "stories", label: "Stories" }] : []), { id: "posts", label: "Posts" }, { id: "reposts", label: "Reposts" }]} />
                {feedLock ? (
                  <LockScreen compact section="feed" lock={feedLock} opensAt={brick.opensAt("feed")} now={brick.now} parentName={brick.policy?.parent?.parentName} />
                ) : (
                  <div role="tabpanel" className="pt-0.5">
                    {current === "stories" ? (
                      <JournalistStories stories={stories} />
                    ) : current === "posts" ? (
                      <PostGrid posts={posts} emptyIcon={Grid3x3} emptyTitle="No posts yet"
                        emptyBody={followed ? `When @${profile.username} posts, it'll show up here.` : `Follow @${profile.username} to see followers-only posts too.`} />
                    ) : (
                      <PostGrid posts={reposts} emptyIcon={Repeat2} emptyTitle="No reposts yet" />
                    )}
                  </div>
                )}
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
            {!isBlocked && (
              <MenuItem icon={isMuted ? Volume2 : VolumeX}
                description={isMuted ? undefined : "Stop seeing their posts, stories and comments. They won't know"}
                onClick={() => { setDialog(null); toggleMute({ id: uid, username: profile.username }, !isMuted); }}>
                {isMuted ? `Unmute @${profile.username}` : `Mute @${profile.username}`}
              </MenuItem>
            )}
            <MenuItem icon={Ban} danger={!isBlocked} onClick={() => setDialog("block")}
              description={isBlocked ? undefined : "They won't be told"}>
              {isBlocked ? `Unblock @${profile.username}` : `Block @${profile.username}`}
            </MenuItem>
            <MenuItem icon={Flag} danger onClick={() => setDialog("report")} description="A moderator reviews the account">
              Report @{profile.username}
            </MenuItem>
          </MenuGroup>
          {me() === FOUNDER_UID && (
            <MenuGroup>
              <MenuItem icon={Heart} onClick={togglePink} description="Pink check, pink profile and a pink banner. Only you can give it, to one person at a time">
                {profile.badges?.includes("pink") ? "Remove girlfriend privilege" : "Give girlfriend privilege"}
              </MenuItem>
            </MenuGroup>
          )}
          {admin && (
            <MenuGroup>
              <MenuItem icon={BadgeCheck} onClick={() => toggleBadge("verified")}
                description="Staff only. A purple tick by their name everywhere">
                {profile.badges?.includes("verified") ? "Remove verification" : `Verify @${profile.username}`}
              </MenuItem>
              {!betaByJoinDate(profile) && (
                <MenuItem icon={FlaskConical} onClick={() => toggleBadge("beta")} description="Staff only. Shows on their profile and posts">
                  {profile.badges?.includes("beta") ? "Remove beta tester badge" : "Give beta tester badge"}
                </MenuItem>
              )}
            </MenuGroup>
          )}
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
