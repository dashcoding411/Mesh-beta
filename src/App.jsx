import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, releaseAppCheck } from "./firebase";
import { finishGoogleDirect, googleReturning, lostSession, noteSignedIn, restoreSession } from "./lib/auth";
import { clearSnapshots, readSnapshot, saveSnapshot } from "./lib/snapshot";
import { setPresenceHidden, tidyStoryViewers, openWatch, fetchOwnProfile, fetchMyFollowingSet, fetchBlocked, fetchMyPrefs, followsMe, setMuted, listenNotifications, removeMyReposts, staffRole, loadAppealAllowances, recordActivity, fetchMyRolls, isDeveloped, rollSeen, tsMillis } from "./lib/db";
import RollReady from "./components/rolls/RollReady";
import { BrickContext, useBrickEngine, useUsageMeter } from "./lib/useBrick";
import { useTimeMeter } from "./lib/timeMeter";
import { FOUNDER_UID } from "./lib/badges";
import { justAgeLocked } from "./lib/ageLock";
import { syncPush } from "./lib/push";
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
import { JoinDialog, JoinPage } from "./components/JoinPrompt";
import HomeFeed from "./components/HomeFeed";
import StorageNotice from "./components/StorageNotice";
import SuspensionBanner from "./components/SuspensionBanner";
import OfflineBanner from "./components/OfflineBanner";
import UpdateBanner from "./components/UpdateBanner";
import NotificationBanner from "./components/NotificationBanner";
import Shortcuts from "./components/Shortcuts";
import { ExternalLinkDialog } from "./components/ui/ExternalLink";
import StoryOpener from "./components/StoryOpener";
import { Loading } from "./components/ui/States";
import { usePageTitle } from "./lib/usePageTitle";
import { isVerifiedUser } from "./lib/verified";
import { DOCUMENT_TITLES } from "./legal/titles.js";
import LockScreen from "./components/LockScreen";
import HomeHeader from "./components/shell/HomeHeader";

// Route-level code splitting; only the shell and home feed are in the entry chunk.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Flicks = lazy(() => import("./components/Flicks"));
const FlicksHome = lazy(() => import("./components/FlicksHome"));
const Search = lazy(() => import("./components/Search"));
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
const StoryArchive = lazy(() => import("./components/StoryArchive"));
const AdsManager = lazy(() => import("./components/AdsManager"));
const AgeGate = lazy(() => import("./components/AgeGate"));
const ParentalControls = lazy(() => import("./components/ParentalControls"));
const NotFound = lazy(() => import("./components/NotFound"));
const VerifyContact = lazy(() => import("./components/VerifyContact"));
// What an account needs a confirmed email or phone for (needsAccount reasons).
const NEEDS_CONTACT = new Set([
  "post", "repost", "follow people", "follow journalists", "message people", "reply to comments", "reply to stories",
  "echo stories", "reply to gatherings", "post in gatherings", "start a circle", "plan a gathering",
]);
const Welcome = lazy(() => import("./components/Welcome"));
const WhatsOn = lazy(() => import("./components/WhatsOn"));
const Help = lazy(() => import("./components/Help"));
const WeekRecap = lazy(() => import("./components/WeekRecap"));
const StaffStats = lazy(() => import("./components/StaffStats"));
const Rolls = lazy(() => import("./components/rolls/Rolls"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const PostViewer = lazy(() => import("./components/PostViewer"));
const Watch = lazy(() => import("./components/Watch"));
const Composer = lazy(() => import("./components/Composer"));
// Only signed-out visitors and new accounts need these, so they stay out of
// the first download.
const AuthPage = lazy(() => import("./components/AuthPage"));
const Tour = lazy(() => import("./components/Tour"));
const CallScreen = named(() => import("./components/CallScreen"), "CallScreen");
const IncomingCall = named(() => import("./components/CallScreen"), "IncomingCall");
const InterestsDialog = named(() => import("./components/Interests"), "InterestsDialog");

// The pulsing logo while Mesh (or a page it needs) loads.
function Splash({ label = "Loading Mesh", children }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label={label}>
      <div className="animate-pulse"><LogoMark size={56} /></div>
      {children}
    </div>
  );
}

const SECTION_TITLES = {
  foryou: null, following: "Following", flicks: "Flicks", news: "News", circles: "Circles", search: "Search",
  notifications: "Notifications", leaderboard: "Leaderboard", whatson: "What's on", rolls: "Rolls", help: "Help",
};

// Brick-mode section for a page. Messaging, News, notifications, settings and
// gathering details are never locked.
function lockSectionOf(page) {
  if (page.tab !== "home" || page.gatheringId || page.notFound) return null;
  // News is never locked: like messages and calls, it stays open.
  return { foryou: "feed", following: "feed", search: "feed", circles: "feed", flicks: "flicks" }[page.section] || null;
}

// Pages that belong to an account, and what to tell a signed-out visitor.
function accountOnly(page) {
  if (page.tab === "messages") return { title: "Messages", body: "Log in to message people and join group chats." };
  if (page.tab === "account" && page.view !== "legal") return { title: "Your account", body: "Log in to see your profile and settings." };
  if (page.tab !== "home") return null;
  if (page.section === "news" && page.view) return { title: "Newsroom", body: "Log in to write and review stories." };
  return {
    following: { title: "Following", body: "Log in to see posts from people you follow." },
    notifications: { title: "Notifications", body: "Log in to see likes, replies and follows." },
  }[page.section] || null;
}

function sectionTitle(page, query) {
  if (page.view === "legal") return DOCUMENT_TITLES[page.doc] || "Policies";
  if (page.tab === "auth") return page.mode === "signup" ? "Sign up" : "Log in";
  if (page.notFound) return "Page not found";
  if (page.tab === "messages") return "Messages";
  if (page.tab === "account") return { settings: "Settings", moderation: "Moderation", brick: "Brick mode", archive: "Story archive", ads: "Ads", family: "Parental controls", week: "Your week", stats: "Stats" }[page.view] || "Your profile";
  if (page.section === "search" && query?.get("q")) return `${query.get("q").slice(0, 40)} · Search`;
  if (page.section === "circles" && page.gatheringId) return "Gatherings";
  return SECTION_TITLES[page.section] ?? null;
}

// How old this device's copy of your account can be and still open Mesh.
const ACCOUNT_COPY_MS = 30 * 24 * 3600e3;

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [signedOutWhy, setSignedOutWhy] = useState(""); // a code, when signed out without choosing to
  // Read before finishGoogleDirect clears the address bar.
  const [finishingSignIn] = useState(googleReturning);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(new Set());
  const [blocked, setBlocked] = useState(new Set());
  const [interests, setInterests] = useState([]);
  const [hiddenWords, setHiddenWords] = useState([]);
  const [hideAi, setHideAi] = useState(false);
  const [hideActive, setHideActive] = useState(false);
  const [tourDone, setTourDone] = useState(null); // from private prefs; null until known
  // First-time signed-out visitors see the welcome page at / until they choose to look around.
  const [welcomed, setWelcomed] = useState(() => { try { return !!localStorage.getItem("mesh:welcomed"); } catch { return true; } });
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
    const applyAccount = (a) => {
      setProfile(a.profile);
      setFollowing(new Set(a.following));
      setBlocked(new Set(a.blocked));
      setInterests(a.prefs.interests || []);
      setHiddenWords(a.prefs.hiddenWords || []);
      setHideAi(!!a.prefs.hideAi);
      setHideActive(!!a.prefs.hideActive);
      setTourDone(!!a.prefs.tourDone);
      setMutedSet(new Set(a.prefs.muted || []));
    };
    // Back from Google with a token (M.A.T.H): sign in before reading who's
    // signed in, so Mesh opens signed in rather than reloading after.
    restoreSession().catch(() => {}).then(() => finishGoogleDirect()).catch(() => {}).then(() => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, async (u) => {
        // Signing in or out after load starts a fresh page, so no feed,
        // cache or listener carries over between visitor and account.
        if (!initial) {
          // An under-16 sign-up that just ended goes back to say why; everyone else goes Home.
          if (!u) { clearSnapshots(); return window.location.replace(justAgeLocked() ? "/signup" : "/"); }
          noteSignedIn(u.uid);
          if (await fetchOwnProfile(u.uid).catch(() => null)) return window.location.replace(afterAuthPath());
          // Signed in without a profile: sign-up continues.
          setProfile(null);
          setUser(u);
          return;
        }
        initial = false;
        setUser(u);
        if (!u) {
          // Nobody's signed in: no copy of an account stays on this device,
          // and someone signed out without choosing to is told why.
          clearSnapshots();
          setSignedOutWhy(lostSession());
          setAuthReady(true);
          return;
        }
        noteSignedIn(u.uid);
        // Open straight away from this device's copy of the account, then
        // bring it up to date. Anything that can't be read keeps the copy.
        const copy = readSnapshot(`me:${u.uid}`, ACCOUNT_COPY_MS);
        if (copy?.profile) { applyAccount(copy); setAuthReady(true); }
        const [p, f, b, prefs] = await Promise.all([
          fetchOwnProfile(u.uid).catch(() => undefined),
          fetchMyFollowingSet().then((s) => [...s]).catch(() => null),
          fetchBlocked().then((l) => l.map((x) => x.id)).catch(() => null),
          fetchMyPrefs().catch(() => null),
        ]);
        if (cancelled) return;
        applyAccount({
          profile: p === undefined ? copy?.profile ?? null : p,
          following: f ?? copy?.following ?? [],
          blocked: b ?? copy?.blocked ?? [],
          prefs: prefs ?? copy?.prefs ?? { interests: [] },
        });
        // Private accounts can't have public reposts (older ones are removed).
        if (p?.isPrivate) removeMyReposts().catch(() => {});
        // Prompt once per account per device.
        let asked = true;
        try { asked = localStorage.getItem(`mesh:asked-interests:${u.uid}`) === "1"; } catch { /* storage blocked */ }
        if (p && prefs && !(prefs.interests || []).length && !asked) setInterestsDialog("first");
        setAuthReady(true);
      });
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  // Keep this device's copy of the account current (see above).
  useEffect(() => {
    if (!authReady || !user || !profile) return;
    saveSnapshot(`me:${user.uid}`, {
      profile, following: [...following], blocked: [...blocked],
      prefs: { interests, hiddenWords, hideAi, hideActive, tourDone, muted: [...muted] },
    });
  }, [authReady, user, profile, following, blocked, interests, hiddenWords, hideAi, hideActive, tourDone, muted]);
  // Online status stays off this device's writes while it's hidden.
  useEffect(() => { setPresenceHidden(hideActive); }, [hideActive]);

  // The security check starts once Mesh is on screen (firebase.js).
  useEffect(() => {
    if (!authReady) return undefined;
    const t = setTimeout(releaseAppCheck, 3000);
    return () => clearTimeout(t);
  }, [authReady]);

  useEffect(() => {
    if (!signedOutWhy) return;
    toast({
      tone: "info",
      title: "You were signed out",
      body: signedOutWhy === "keep-signed-in-off"
        ? "\"Keep me signed in\" was off, so Mesh signed you out when it closed. Log in again to carry on."
        : `Log in again to carry on. (code: ${signedOutWhy})`,
      action: { label: "Log in", onClick: () => navigate("/login") },
    });
  }, [signedOutWhy, toast]);

  const signedIn = !!(user && profile);
  const guest = authReady && !user;
  // Staff accounts are work accounts: Home is the moderation queue, there are
  // no feeds, Messages or discovery, and they don't post, like, follow or
  // message. The founder's own account is a personal one.
  const [role, setRole] = useState(null);
  useEffect(() => {
    let live = true;
    if (signedIn) staffRole().then((r) => { if (live) setRole(r); }).catch(() => {});
    return () => { live = false; };
  }, [signedIn]);
  const workAccount = signedIn && !!role && user.uid !== FOUNDER_UID;
  const [joinReason, setJoinReason] = useState(null);
  /**
   * Returns true (and explains) when the viewer can't do `reason`: signed-out
   * visitors need an account, and work accounts only moderate.
   */
  const [verifyReason, setVerifyReason] = useState(null);
  const needsAccount = useCallback((reason) => {
    if (workAccount) {
      toast({ title: "Work accounts only moderate", body: `Use your personal account to ${reason}.` });
      return true;
    }
    if (guest) {
      setJoinReason(reason);
      return true;
    }
    // Posting, messaging and following need a confirmed email or phone (the rules).
    if (NEEDS_CONTACT.has(reason) && !isVerifiedUser(auth.currentUser)) {
      setVerifyReason(reason);
      return true;
    }
    return false;
  }, [guest, workAccount, toast]);
  // Keep the viewer's own card current in the profile cache.
  useEffect(() => { if (user && profile) primeCard(user.uid, profile); }, [user, profile]);
  const inbox = useInbox(following, signedIn);
  const brick = useBrickEngine(signedIn);

  // Tapping a notification while Mesh is open moves here instead of reloading.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return undefined;
    const onMessage = (e) => {
      if (e.data?.type !== "mesh:open") return;
      try { const u = new URL(e.data.url); if (u.origin === window.location.origin) navigate(u.pathname + u.search); } catch { /* ignore */ }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Keep this device's notification subscription current, and quiet while an
  // instant brick runs (messages and calls still come through).
  const brickUntil = Math.max(brick.policy?.self?.until || 0, brick.policy?.parent?.until || 0);
  useEffect(() => {
    if (signedIn && brick.loaded) syncPush({ quietUntil: brickUntil > Date.now() ? brickUntil : 0 }).catch(() => {});
  }, [signedIn, brick.loaded, brickUntil]);

  const [notices, setNotices] = useState(null);
  useEffect(() => {
    if (!signedIn) return undefined;
    return listenNotifications(setNotices);
  }, [signedIn]);
  // What this account has won on appeal can be posted; refreshed when a decision arrives.
  const appealDecisions = (notices || []).filter((n) => n.type === "appeal").length;
  useEffect(() => { if (signedIn) loadAppealAllowances().catch(() => {}); }, [signedIn, appealDecisions]);
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
  const openComposer = useCallback((opts = {}) => {
    if (!needsAccount("post")) setComposer(opts);
  }, [needsAccount]);
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

  // Rolls: an orange dot while one of yours is shooting, and "your roll has
  // developed" the first time you're back after it develops. Checked on
  // sign-in, when Mesh comes back to the front, on leaving a roll, and every
  // ten minutes.
  const [rollSignal, setRollSignal] = useState({ dot: null, fresh: null });
  const onRolls = loc.path.startsWith("/rolls");
  useEffect(() => {
    if (!signedIn) return undefined;
    let live = true;
    const check = () => fetchMyRolls().then((list) => {
      if (!live) return;
      const now = Date.now();
      const fresh = list.find((r) => isDeveloped(r, now) && now - tsMillis(r.developAt) < 3 * 86400000 && !rollSeen(r.id) && (r.photoCount || 0) > 0) || null;
      setRollSignal({ dot: fresh ? "new" : list.some((r) => !isDeveloped(r, now)) ? "live" : null, fresh });
    }).catch(() => {});
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(check, 10 * 60000);
    return () => { live = false; document.removeEventListener("visibilitychange", onVisible); clearInterval(t); };
  }, [signedIn, onRolls]);

  const shell = useMemo(() => ({
    profile, setProfile, following, setFollowing, blocked, setBlocked, inbox, openComposer, openDrawer, feedKey, role, workAccount,
    interests, setInterests, openInterests, startCall, inCall: !!call, hiddenWords, setHiddenWords, hideAi, setHideAi, hideActive, setHideActive,
    muted, toggleMute, hiddenAuthors, notices, noticesUnread, guest, needsAccount, rollsDot: rollSignal.dot,
  }), [profile, following, blocked, inbox, openComposer, openDrawer, feedKey, role, workAccount, interests, openInterests, startCall, call, hiddenWords, hideAi, hideActive,
    muted, toggleMute, hiddenAuthors, notices, noticesUnread, guest, needsAccount, rollSignal.dot]);

  const { page, overlay, bgQuery } = resolve(loc);
  usePageTitle(sectionTitle(page, overlay ? bgQuery : loc.query), 0);
  // Already signed in on /login or /signup.
  const onAuthPage = page.tab === "auth";
  useEffect(() => { if (signedIn && onAuthPage) navigate(afterAuthPath(), { replace: true }); }, [signedIn, onAuthPage]);
  // Arriving anywhere else first (a shared post, a gathering, the news) counts as looking around.
  const browsingElsewhere = guest && !welcomed && !onAuthPage && page.tab !== "welcome" && page.view !== "legal"
    && !(page.tab === "home" && page.section === "foryou" && !overlay);
  if (browsingElsewhere) setWelcomed(true);
  useEffect(() => {
    if (!welcomed) return;
    try { localStorage.setItem("mesh:welcomed", "1"); } catch { /* storage blocked */ }
  }, [welcomed]);
  const lockSection = lockSectionOf(page);
  // Meter usage for capped sections (the player counts as Flicks).
  useUsageMeter(brick, overlay ? (overlay.overlay === "watch" ? "flicks" : overlay.overlay === "post" ? "feed" : null) : lockSection);
  useTimeMeter(signedIn ? user.uid : null);
  const joinedAt = profile?.createdAt;
  useEffect(() => { if (signedIn) recordActivity({ createdAt: joinedAt }).catch(() => {}); }, [signedIn, joinedAt]);
  // Viewer lists on your own stories go once they're 48 hours old.
  useEffect(() => { if (signedIn) tidyStoryViewers().catch(() => {}); }, [signedIn]);

  if (!authReady) {
    return (
      <Splash label={finishingSignIn ? "Finishing sign-in" : "Loading Mesh"}>
        {finishingSignIn && <p className="text-callout text-fg-muted">Finishing sign-in with Google…</p>}
      </Splash>
    );
  }

  // Both are the same element, so an email sign-up keeps its state when the
  // account is created and the profile is still to come.
  const enter = () => window.location.replace(afterAuthPath());
  if (user && !profile) return <Suspense fallback={<Splash />}><AuthPage pendingUser={user} onCreated={enter} /></Suspense>;
  // 16 and over only: accounts without a birth year are asked, and under-16s
  // can only download their data or delete the account.
  const ageYears = profile?.birthYear > 0 ? new Date().getFullYear() - profile.birthYear : null;
  if (user && profile && !profile.ageUnknown && (ageYears === null || ageYears < 16)) {
    return (
      <Suspense fallback={null}>
        <AgeGate profile={profile} onBirthYear={(y) => setProfile((p) => ({ ...p, birthYear: y }))} />
      </Suspense>
    );
  }
  if (guest && onAuthPage) return <Suspense fallback={<Splash />}><AuthPage initialMode={page.mode} onCreated={enter} /></Suspense>;
  if (onAuthPage) return null;

  const firstVisit = guest && !welcomed && page.tab === "home" && page.section === "foryou" && !page.notFound && !overlay;
  if (page.tab === "welcome" || firstVisit) {
    const browse = () => {
      setWelcomed(true);
      if (page.tab === "welcome") navigate("/");
    };
    return (
      <Suspense fallback={<div className="flex h-dvh items-center justify-center" role="status" aria-label="Loading Mesh"><div className="animate-pulse"><LogoMark size={56} /></div></div>}>
        <Welcome signedIn={signedIn} onBrowse={browse} />
        <StorageNotice onReadMore={() => navigate("/legal/cookies")} />
      </Suspense>
    );
  }

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
      case "notifications": content = <Notifications />; break;
      case "leaderboard": content = <Leaderboard groupId={page.groupId} />; break;
      case "whatson": content = <WhatsOn />; break;
      case "help": content = <Help key={page.id || "home"} guideId={page.id} />; break;
      case "rolls": content = <Rolls rollId={page.id} />; break;
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
  } else if (page.view === "archive") {
    content = <StoryArchive />;
  } else if (page.view === "ads") {
    content = <AdsManager />;
  } else if (page.view === "family") {
    content = <ParentalControls />;
  } else if (page.view === "week") {
    content = <WeekRecap />;
  } else if (page.view === "stats") {
    content = <StaffStats />;
  } else if (page.view === "legal") {
    content = <Legal key={page.doc} doc={page.doc} />;
  } else {
    content = <Profile key={page.profileTab || "profile"} initialTab={page.profileTab} />;
  }
  // Work accounts get the queue in place of feeds, Messages and discovery;
  // anything opened from a report (a post, profile, circle, gathering or
  // story) still shows.
  if (workAccount && (page.tab === "messages" || (page.tab === "home" && (
    ["foryou", "following", "flicks", "leaderboard", "whatson", "rolls"].includes(page.section)
    || (page.section === "news" && !page.id && !page.view)
    || (page.section === "circles" && !page.id && !page.gatheringId))))) {
    content = <Moderation />;
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

        <Sidebar page={page} profile={profile} work={workAccount} unread={inbox.unreadCount} notifications={noticesUnread} onCreate={() => openComposer()} />

        <main id="mesh-main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          <OfflineBanner />
          <UpdateBanner />
          <SuspensionBanner profile={profile} />
          <Suspense fallback={<Loading label="Loading" />}>{content}</Suspense>
        </main>

        <BottomNav page={page} profile={profile} work={workAccount} unread={inbox.unreadCount} immersive={immersive} />

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
          <HomeDrawer page={page} profile={profile} work={workAccount} unread={inbox.unreadCount} notifications={noticesUnread}
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
        {verifyReason && <Suspense fallback={null}><VerifyContact reason={verifyReason} onClose={() => setVerifyReason(null)} /></Suspense>}
        {signedIn && (
          <NotificationBanner notices={notices} hidden={hiddenAuthors}
            onNotificationsPage={page.tab === "home" && page.section === "notifications"} />
        )}
        <StorageNotice onReadMore={() => navigate("/legal/cookies")} />
        {signedIn && rollSignal.fresh && !onRolls && (
          <RollReady key={rollSignal.fresh.id} roll={rollSignal.fresh} onDone={() => setRollSignal((s) => ({ ...s, fresh: null }))} />
        )}
        {((signedIn && !workAccount) || guest) && (
          <Suspense fallback={null}>
            <Tour uid={user?.uid} guest={guest} profile={profile} prefsDone={tourDone} onSeen={() => setTourDone(true)}
              ready={page.tab === "home" && page.section === "foryou" && !overlay && !composer && !drawerOpen && !interestsDialog && !joinReason} />
          </Suspense>
        )}
        <Shortcuts onCreate={openComposer} />
        <ExternalLinkDialog />
        <StoryOpener />

        {interestsDialog && !workAccount && (
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
      className="fixed inset-0 z-overlay flex flex-col bg-canvas anim-fade md:right-[76px] xl:right-64">
      <div className="flex h-14 items-center px-2 pt-safe">
        <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack("/messages")} />
      </div>
      <LockScreen section={section} lock={lock} opensAt={brick.opensAt(section)} now={brick.now} parentName={brick.policy?.parent?.parentName} />
    </div>
  );
}
