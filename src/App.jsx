import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { restoreSession } from "./lib/auth";
import { openWatch, fetchOwnProfile, fetchMyFollowingSet, fetchBlocked, fetchMyPrefs, followsMe, setMuted, listenNotifications, removeMyReposts } from "./lib/db";
import { BrickContext, useBrickEngine, useUsageMeter } from "./lib/useBrick";
import { primeCard } from "./lib/profileCache";
import { CallSession, listenIncomingCalls, callsSupported, refuseCall, ringExpired } from "./lib/calls";

import { useToast } from "./components/ui/toast-context";
import { useLocation, resolve, navigate, goBack, afterAuthPath } from "./lib/router";
import { ArrowLeft } from "lucide-react";
import IconButton from "./components/ui/IconButton";
import { useInbox } from "./lib/inbox";
import { ShellContext } from "./components/shell/ShellContext";
import Sidebar, { LogoMark } from "./components/shell/Sidebar";
import BottomNav from "./components/shell/BottomNav";
import HomeDrawer from "./components/shell/HomeDrawer";
import AuthPage from "./components/AuthPage";
import { JoinDialog, JoinPage } from "./components/JoinPrompt";
import HomeFeed from "./components/HomeFeed";
import StorageNotice from "./components/StorageNotice";
import SuspensionBanner from "./components/SuspensionBanner";
import OfflineBanner from "./components/OfflineBanner";
import UpdateBanner from "./components/UpdateBanner";
import NotificationBanner from "./components/NotificationBanner";
import Tour from "./components/Tour";
import Shortcuts from "./components/Shortcuts";
import { ExternalLinkDialog } from "./components/ui/ExternalLink";
import StoryOpener from "./components/StoryOpener";
import { Loading } from "./components/ui/States";
import { usePageTitle } from "./lib/usePageTitle";
import { DOCUMENT_TITLES } from "./legal/titles.js";
import LockScreen from "./components/LockScreen";
import HomeHeader from "./components/shell/HomeHeader";

// Route-level code splitting; only the shell and home feed are in the entry chunk.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Flicks = lazy(() => import("./components/Flicks"));
const FlicksHome = lazy(() => import("./components/FlicksHome"));
const Search = lazy(() => import("./components/Search"));
const Saved = lazy(() => import("./components/Saved"));
const News = lazy(() => import("./components/News"));
const Circles = lazy(() => import("./components/Circles"));
const GatheringPage = lazy(() => import("./components/GatheringPage"));
const Messages = lazy(() => import("./components/Messages"));
const Profile = lazy(() => import("./components/Profile"));
const Settings = lazy(() => import("./components/Settings"));
const BrickSettings = lazy(() => import("./components/BrickSettings"));
const Notifications = lazy(() => import("./components/Notifications"));
const Leaderboard = lazy(() => import("./components/Leaderboard"));
const PublicGathering = lazy(() => import("./components/PublicGathering"));
const Legal = lazy(() => import("./components/Legal"));
const Moderation = lazy(() => import("./components/Moderation"));
const NotFound = lazy(() => import("./components/NotFound"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const PostViewer = lazy(() => import("./components/PostViewer"));
const Watch = lazy(() => import("./components/Watch"));
const Composer = lazy(() => import("./components/Composer"));
const CallScreen = named(() => import("./components/CallScreen"), "CallScreen");
const IncomingCall = named(() => import("./components/CallScreen"), "IncomingCall");
const InterestsDialog = named(() => import("./components/Interests"), "InterestsDialog");

const SECTION_TITLES = {
  foryou: null, following: "Following", flicks: "Flicks", news: "News", circles: "Circles", search: "Search", saved: "Saved",
  notifications: "Notifications", leaderboard: "Leaderboard",
};

// Brick-mode section for a page. Messaging, notifications, settings and
// gathering details are never locked.
function lockSectionOf(page) {
  if (page.tab !== "home" || page.gatheringId || page.notFound) return null;
  // The newsroom is exempt from News limits.
  if (page.section === "news" && page.view) return null;
  return { foryou: "feed", following: "feed", search: "feed", circles: "feed", saved: "feed", flicks: "flicks", news: "news" }[page.section] || null;
}

// Pages that belong to an account, and what to tell a signed-out visitor.
function accountOnly(page) {
  if (page.tab === "messages") return { title: "Messages", body: "Log in to message people and join group chats." };
  if (page.tab === "account" && page.view !== "legal") return { title: "Your account", body: "Log in to see your profile and settings." };
  if (page.tab !== "home") return null;
  if (page.section === "news" && page.view) return { title: "Newsroom", body: "Log in to write and review stories." };
  return {
    following: { title: "Following", body: "Log in to see posts from people you follow." },
    saved: { title: "Saved", body: "Log in to save posts and find them here later." },
    notifications: { title: "Notifications", body: "Log in to see likes, replies and follows." },
  }[page.section] || null;
}

function sectionTitle(page, query) {
  if (page.view === "legal") return DOCUMENT_TITLES[page.doc] || "Policies";
  if (page.tab === "auth") return page.mode === "signup" ? "Sign up" : "Log in";
  if (page.notFound) return "Page not found";
  if (page.tab === "messages") return "Messages";
  if (page.tab === "account") return { settings: "Settings", moderation: "Moderation", brick: "Brick mode" }[page.view] || "Your profile";
  if (page.section === "search" && query?.get("q")) return `${query.get("q").slice(0, 40)} · Search`;
  if (page.section === "circles" && page.gatheringId) return "Gatherings";
  return SECTION_TITLES[page.section] ?? null;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(new Set());
  const [blocked, setBlocked] = useState(new Set());
  const [interests, setInterests] = useState([]);
  const [hiddenWords, setHiddenWords] = useState([]);
  const [hideAi, setHideAi] = useState(false);
  const [tourDone, setTourDone] = useState(null); // from private prefs; null until known
  const [muted, setMutedSet] = useState(() => new Set());
  const [interestsDialog, setInterestsDialog] = useState(null); // null | "first" | "edit"
  const [incoming, setIncoming] = useState([]);
  const [call, setCall] = useState(null);
  const toast = useToast();
  const [composer, setComposer] = useState(null); // null | { kind?, groupId?, group? }
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  const loc = useLocation();

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    let initial = true;
    restoreSession().catch(() => {}).then(() => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, async (u) => {
        // Signing in or out after load starts a fresh page, so no feed,
        // cache or listener carries over between visitor and account.
        if (!initial) {
          if (!u) return window.location.replace("/");
          if (await fetchOwnProfile(u.uid).catch(() => null)) return window.location.replace(afterAuthPath());
          // Signed in without a profile: sign-up continues.
          setProfile(null);
          setUser(u);
          return;
        }
        initial = false;
        setUser(u);
        if (u) {
          const [p, f, b, prefs] = await Promise.all([
            fetchOwnProfile(u.uid).catch(() => null),
            fetchMyFollowingSet().catch(() => new Set()),
            fetchBlocked().then((l) => new Set(l.map((x) => x.id))).catch(() => new Set()),
            fetchMyPrefs().catch(() => ({ interests: [] })),
          ]);
          setProfile(p);
          // Private accounts can't have public reposts (older ones are removed).
          if (p?.isPrivate) removeMyReposts().catch(() => {});
          setFollowing(f);
          setBlocked(b);
          setInterests(prefs.interests || []);
          setHiddenWords(prefs.hiddenWords || []);
          setHideAi(!!prefs.hideAi);
          setTourDone(!!prefs.tourDone);
          setMutedSet(new Set(prefs.muted || []));
          // Prompt once per account per device.
          let asked = true;
          try { asked = localStorage.getItem(`mesh:asked-interests:${u.uid}`) === "1"; } catch { /* storage blocked */ }
          if (p && !(prefs.interests || []).length && !asked) setInterestsDialog("first");
        }
        setAuthReady(true);
      });
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  const signedIn = !!(user && profile);
  const guest = authReady && !user;
  const [joinReason, setJoinReason] = useState(null);
  /** For signed-out visitors: explains that `reason` needs an account and returns true. */
  const needsAccount = useCallback((reason) => {
    if (!guest) return false;
    setJoinReason(reason);
    return true;
  }, [guest]);
  // Keep the viewer's own card current in the profile cache.
  useEffect(() => { if (user && profile) primeCard(user.uid, profile); }, [user, profile]);
  const inbox = useInbox(following, signedIn);
  const brick = useBrickEngine(signedIn);

  const [notices, setNotices] = useState(null);
  useEffect(() => {
    if (!signedIn) return undefined;
    return listenNotifications(setNotices);
  }, [signedIn]);
  const noticesUnread = useMemo(() => (notices || []).filter((n) => !n.read && !muted.has(n.actorId) && !blocked.has(n.actorId)).length, [notices, muted, blocked]);

  const callUid = signedIn ? user.uid : null;
  useEffect(() => { if (callUid && callsSupported()) return listenIncomingCalls(callUid, setIncoming); }, [callUid]);
  // Expire rings whose caller vanished without updating the doc.
  useEffect(() => {
    if (!incoming.length) return;
    const t = setInterval(() => setIncoming((l) => l.filter((c) => !ringExpired(c))), 5000);
    return () => clearInterval(t);
  }, [incoming.length]);
  // Auto-reject other incoming calls as busy; the listener then drops them.
  useEffect(() => {
    if (!call || call.state === "ended") return;
    incoming.filter((c) => c.id !== call.signal.id).forEach((c) => refuseCall(c.id, "busy"));
  }, [call, incoming]);
  // End the call on page unload.
  useEffect(() => {
    if (!call) return;
    const bye = () => { call.hangUp(); };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [call]);

  const startCall = useCallback(async (chat, video) => {
    if (!callsSupported()) return toast({ tone: "error", title: "This browser can't make calls" });
    if (call) return;
    const other = chat.members.find((m) => m !== user?.uid);
    // Check eligibility before prompting for camera/mic.
    if (!(await followsMe(other))) {
      return toast({ tone: "info", title: "You can only call people who follow you",
        body: "It stops strangers ringing people. Send a message instead." });
    }
    const session = new CallSession({
      chatId: chat.id, video,
      peer: { id: other, username: chat.memberNames?.[other] || "?" },
      self: { id: user.uid, username: profile?.username || "", photoURL: profile?.photoURL || "" },
    });
    setCall(session);
    try { await session.start(); }
    catch (err) {
      if (session.state === "ended" && session.endedReason === "cancelled") return;
      console.error(err);
      // Release devices before surfacing the error.
      session.finish("failed").catch(() => {});
      setCall(null);
      if (err?.code === "permission-denied") {
        return toast({ tone: "info", title: "You can only call people who follow you",
          body: "It stops strangers ringing people. Send a message instead." });
      }
      const denied = err?.name === "NotAllowedError";
      toast({ tone: "error", title: denied ? "Mesh needs your microphone" : err?.name === "NotFoundError" ? "No microphone found" : "Couldn't start the call",
        body: denied ? "Allow access in your browser's site settings, then try again." : undefined });
    }
  }, [call, user, profile, toast]);

  const answer = async (inc) => {
    const session = new CallSession({ chatId: inc.chatId, video: inc.video, incoming: inc, peer: { id: inc.callerId, username: inc.callerName, photoURL: inc.callerPhoto } });
    setIncoming((l) => l.filter((c) => c.id !== inc.id));
    setCall(session);
    try { await session.answer(); }
    catch (err) {
      console.error(err);
      await session.finish("failed");
      setCall(null);
      toast({ tone: "error", title: err?.name === "NotAllowedError" ? "Mesh needs your microphone to answer" : "Couldn't answer the call",
        body: err?.name === "NotAllowedError" ? "Allow access in your browser's site settings." : undefined });
    }
  };
  const decline = async (inc) => {
    setIncoming((l) => l.filter((c) => c.id !== inc.id));
    await refuseCall(inc.id, "declined");
  };
  const openComposer = useCallback((opts = {}) => { if (!needsAccount("post")) setComposer(opts); }, [needsAccount]);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const openInterests = useCallback(() => setInterestsDialog("edit"), []);
  const saveMute = useCallback(async (person, on) => {
    await setMuted(person.id, on);
    setMutedSet((prev) => { const n = new Set(prev); if (on) n.add(person.id); else n.delete(person.id); return n; });
  }, []);
  const toggleMute = useCallback(async (person, on) => {
    try {
      await saveMute(person, on);
      toast(on
        ? { title: `Muted @${person.username}`, body: "Their posts, stories and comments won't show for you. They aren't told.",
            action: { label: "Undo", onClick: () => saveMute(person, false).catch(() => toast({ tone: "error", title: "Couldn't unmute" })) } }
        : { title: `Unmuted @${person.username}` });
    } catch {
      toast({ tone: "error", title: on ? "Couldn't mute" : "Couldn't unmute", body: "Check your connection and try again." });
    }
  }, [saveMute, toast]);
  const hiddenAuthors = useMemo(() => new Set([...blocked, ...muted]), [blocked, muted]);
  const shell = useMemo(() => ({
    profile, setProfile, following, setFollowing, blocked, setBlocked, inbox, openComposer, openDrawer, feedKey,
    interests, setInterests, openInterests, startCall, inCall: !!call, hiddenWords, setHiddenWords, hideAi, setHideAi,
    muted, toggleMute, hiddenAuthors, notices, noticesUnread, guest, needsAccount,
  }), [profile, following, blocked, inbox, openComposer, openDrawer, feedKey, interests, openInterests, startCall, call, hiddenWords, hideAi,
    muted, toggleMute, hiddenAuthors, notices, noticesUnread, guest, needsAccount]);

  const { page, overlay, bgQuery } = resolve(loc);
  usePageTitle(sectionTitle(page, overlay ? bgQuery : loc.query), 0);
  // Already signed in on /login or /signup.
  const onAuthPage = page.tab === "auth";
  useEffect(() => { if (signedIn && onAuthPage) navigate(afterAuthPath(), { replace: true }); }, [signedIn, onAuthPage]);
  const lockSection = lockSectionOf(page);
  // Meter usage for capped sections (the player counts as Flicks).
  useUsageMeter(brick, overlay ? (overlay.overlay === "watch" ? "flicks" : overlay.overlay === "post" ? "feed" : null) : lockSection);

  if (!authReady) {
    return (
      <div className="flex h-dvh items-center justify-center" role="status" aria-label="Loading Mesh">
        <div className="animate-pulse"><LogoMark size={56} /></div>
      </div>
    );
  }

  // Both are the same element, so an email sign-up keeps its state when the
  // account is created and the profile is still to come.
  const enter = () => window.location.replace(afterAuthPath());
  if (user && !profile) return <AuthPage pendingUser={user} onCreated={enter} />;
  if (guest && onAuthPage) return <AuthPage initialMode={page.mode} onCreated={enter} />;
  if (onAuthPage) return null;

  const query = overlay ? bgQuery : loc.query;
  const immersive = page.tab === "home" && page.section === "flicks" && !!page.id && !overlay;

  let content;
  const joinFor = guest ? accountOnly(page) : null;
  if (joinFor) {
    content = <JoinPage {...joinFor} />;
  } else if (page.tab === "home") {
    switch (page.section) {
      case "following": content = <HomeFeed key={`following-${feedKey}`} mode="following" />; break;
      case "flicks":
        content = page.id ? <Flicks key={`flicks-${page.id}-${feedKey}`} startId={page.id} /> : <FlicksHome key={`flicks-${feedKey}`} />;
        break;
      case "news": content = <News storyId={page.id} view={page.view} />; break;
      case "circles":
        content = page.gatheringId
          ? guest ? <PublicGathering eventId={page.gatheringId} /> : <GatheringPage key={`g-${page.gatheringId}-${feedKey}`} eventId={page.gatheringId} />
          : <Circles key={`circles-${feedKey}`} circleId={page.id} view={query.get("view")} />;
        break;
      case "search": content = <Search initialQuery={query.get("q") || ""} filter={query.get("type") || "top"} />; break;
      case "saved": content = <Saved />; break;
      case "notifications": content = <Notifications />; break;
      case "leaderboard": content = <Leaderboard />; break;
      default: content = <HomeFeed key={`foryou-${feedKey}`} mode="foryou" />;
    }
  } else if (page.tab === "messages") {
    content = <Messages chatId={page.id} />;
  } else if (page.view === "settings") {
    content = <Settings />;
  } else if (page.view === "brick") {
    content = <BrickSettings />;
  } else if (page.view === "moderation") {
    content = <Moderation />;
  } else if (page.view === "legal") {
    content = <Legal key={page.doc} doc={page.doc} />;
  } else {
    content = <Profile />;
  }
  if (page.notFound) content = <NotFound />;

  // Locked sections render the lock screen (the rules also refuse the reads).
  const locked = lockSection ? brick.state(lockSection) : null;
  if (locked) {
    content = (
      <>
        <HomeHeader section={page.section} />
        <LockScreen section={lockSection} lock={locked} opensAt={brick.opensAt(lockSection)} now={brick.now}
          parentName={brick.policy?.parent?.parentName} />
      </>
    );
  }
  const overlayLock = overlay?.overlay === "watch" ? brick.state("flicks") : overlay?.overlay === "post" ? brick.state("feed") : null;

  return (
    <ShellContext.Provider value={shell}>
    <BrickContext.Provider value={brick}>
      <div className="flex h-dvh flex-col md:flex-row">
        <a href="#mesh-main" className="skip-link">Skip to content</a>

        <Sidebar page={page} profile={profile} unread={inbox.unreadCount} notifications={noticesUnread} onCreate={() => openComposer()} />

        <main id="mesh-main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          <OfflineBanner />
          <UpdateBanner />
          <SuspensionBanner profile={profile} />
          <Suspense fallback={<Loading label="Loading" />}>{content}</Suspense>
        </main>

        <BottomNav page={page} profile={profile} unread={inbox.unreadCount} immersive={immersive} />

        {/* Overlays render over the current page, so a null fallback avoids flashing it. */}
        <Suspense fallback={null}>
        {/* One instance: swapping /u/<uid> for /@handle mustn't remount it. Each account remounts inside. */}
        {overlay?.overlay === "user" && <UserProfile uid={overlay.id} handle={overlay.handle} />}
        {overlayLock ? (
          <LockedOverlay section={overlay.overlay === "watch" ? "flicks" : "feed"} lock={overlayLock} brick={brick} />
        ) : (
          <>
            {overlay?.overlay === "post" && <PostViewer key={overlay.id} postId={overlay.id} />}
            {overlay?.overlay === "watch" && <Watch key={overlay.id} postId={overlay.id} />}
          </>
        )}

        {drawerOpen && (
          <HomeDrawer page={page} profile={profile} unread={inbox.unreadCount} notifications={noticesUnread}
            onCreate={() => openComposer()} onClose={() => setDrawerOpen(false)} />
        )}

        {composer && (
          <Composer {...composer} profile={profile} onClose={() => setComposer(null)}
            onPosted={(post) => {
              setComposer(null);
              setFeedKey((k) => k + 1);
              if (composer.groupId) return;
              if (post.kind === "video") return openWatch(post.id);
              navigate(post.kind === "short" ? `/flicks/${post.id}` : "/");
            }} />
        )}

        {joinReason && <JoinDialog reason={joinReason} onClose={() => setJoinReason(null)} />}
        {signedIn && (
          <NotificationBanner notices={notices} hidden={hiddenAuthors}
            onNotificationsPage={page.tab === "home" && page.section === "notifications"} />
        )}
        <StorageNotice onReadMore={() => navigate("/legal/cookies")} />
        {(signedIn || guest) && (
          <Tour uid={user?.uid} guest={guest} profile={profile} prefsDone={tourDone} onSeen={() => setTourDone(true)}
            ready={page.tab === "home" && page.section === "foryou" && !overlay && !composer && !drawerOpen && !interestsDialog && !joinReason} />
        )}
        <Shortcuts onCreate={openComposer} />
        <ExternalLinkDialog />
        <StoryOpener />

        {interestsDialog && (
          <InterestsDialog initial={interests} firstRun={interestsDialog === "first"}
            onClose={() => {
              try { localStorage.setItem(`mesh:asked-interests:${user.uid}`, "1"); } catch { /* storage blocked */ }
              setInterestsDialog(null);
            }}
            onSaved={(list) => {
              try { localStorage.setItem(`mesh:asked-interests:${user.uid}`, "1"); } catch { /* storage blocked */ }
              setInterests(list);
              setInterestsDialog(null);
              setFeedKey((k) => k + 1);
            }} />
        )}

        {!call && incoming[0] && (
          <IncomingCall call={incoming[0]} onAnswer={() => answer(incoming[0])} onDecline={() => decline(incoming[0])} />
        )}
        {call && <CallScreen session={call} onClose={() => setCall(null)} />}
        </Suspense>
      </div>
    </BrickContext.Provider>
    </ShellContext.Provider>
  );
}

function LockedOverlay({ section, lock, brick }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Locked"
      className="fixed inset-0 z-overlay flex flex-col bg-canvas anim-fade md:left-[76px] xl:left-64">
      <div className="flex h-14 items-center px-2 pt-safe">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/messages")} />
      </div>
      <LockScreen section={section} lock={lock} opensAt={brick.opensAt(section)} now={brick.now} parentName={brick.policy?.parent?.parentName} />
    </div>
  );
}
