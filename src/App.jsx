import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { fetchProfile, fetchMyFollowingSet, fetchBlocked, fetchMyPrefs, followsMe } from "./lib/db";
import { CallSession, listenIncomingCalls, callsSupported } from "./lib/calls";

import { useToast } from "./components/ui/toast-context";
import { useLocation, resolve, navigate } from "./lib/router";
import { useInbox } from "./lib/inbox";
import { ShellContext } from "./components/shell/ShellContext";
import Sidebar, { LogoMark } from "./components/shell/Sidebar";
import BottomNav from "./components/shell/BottomNav";
import HomeDrawer from "./components/shell/HomeDrawer";
import AuthPage from "./components/AuthPage";
import HomeFeed from "./components/HomeFeed";
import StorageNotice from "./components/StorageNotice";
import SuspensionBanner from "./components/SuspensionBanner";
import { Loading } from "./components/ui/States";
import { usePageTitle } from "./lib/usePageTitle";
import { DOCUMENTS } from "./legal/content.js";

// Everything but the shell and the home feed loads when it's first opened,
// so the first visit downloads only what it shows.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Flicks = lazy(() => import("./components/Flicks"));
const Search = lazy(() => import("./components/Search"));
const Saved = lazy(() => import("./components/Saved"));
const News = lazy(() => import("./components/News"));
const Circles = lazy(() => import("./components/Circles"));
const GatheringPage = lazy(() => import("./components/GatheringPage"));
const Messages = lazy(() => import("./components/Messages"));
const Profile = lazy(() => import("./components/Profile"));
const Settings = lazy(() => import("./components/Settings"));
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
};

/* The tab title for the section on screen. Pages inside a section (a circle,
   a profile, a story) set a more specific one with usePageTitle. */
function sectionTitle(page, signedIn, query) {
  if (page.view === "legal") return DOCUMENTS.find((d) => d.id === page.doc)?.title || "Policies";
  if (!signedIn) return null;
  if (page.notFound) return "Page not found";
  if (page.tab === "messages") return "Messages";
  if (page.tab === "account") return { settings: "Settings", moderation: "Moderation" }[page.view] || "Your profile";
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
  const [interestsDialog, setInterestsDialog] = useState(null); // null | "first" | "edit"
  const [incoming, setIncoming] = useState([]);
  const [call, setCall] = useState(null);
  const toast = useToast();
  const [composer, setComposer] = useState(null); // null | { kind?, groupId?, group? }
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  const loc = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const [p, f, b, prefs] = await Promise.all([
          fetchProfile(u.uid).catch(() => null),
          fetchMyFollowingSet().catch(() => new Set()),
          fetchBlocked().then((l) => new Set(l.map((x) => x.id))).catch(() => new Set()),
          fetchMyPrefs().catch(() => ({ interests: [] })),
        ]);
        setProfile(p);
        setFollowing(f);
        setBlocked(b);
        setInterests(prefs.interests || []);
        setHiddenWords(prefs.hiddenWords || []);
        // Ask once, on a new account's first visit. Skippable, never nagging.
        let asked = true;
        try { asked = localStorage.getItem(`mesh:asked-interests:${u.uid}`) === "1"; } catch { /* storage blocked */ }
        if (p && !(prefs.interests || []).length && !asked) setInterestsDialog("first");
      } else {
        setProfile(null);
        setFollowing(new Set());
        setBlocked(new Set());
        setHiddenWords([]);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const signedIn = !!(user && profile);
  const inbox = useInbox(following, signedIn);

  // Incoming calls, while signed in.
  useEffect(() => { if (signedIn && callsSupported()) return listenIncomingCalls(setIncoming); }, [signedIn]);

  const startCall = useCallback(async (chat, video) => {
    if (!callsSupported()) return toast({ tone: "error", title: "This browser can't make calls" });
    if (call) return;
    const other = chat.members.find((m) => m !== user?.uid);
    // Check before asking for the camera, so nobody grants access for nothing.
    if (!(await followsMe(other))) {
      return toast({ tone: "info", title: "You can only call people who follow you",
        body: "It stops strangers ringing people. Send a message instead." });
    }
    const session = new CallSession({ chatId: chat.id, video, peer: { id: other, username: chat.memberNames?.[other] || "?" } });
    setCall(session);
    try { await session.start(); }
    catch (err) {
      console.error(err);
      // Turn the camera and microphone back off before saying anything.
      session.finish("failed").catch(() => {});
      setCall(null);
      if (err?.code === "permission-denied") {
        return toast({ tone: "info", title: "You can only call people who follow you",
          body: "It stops strangers ringing people. Send a message instead." });
      }
      toast({ tone: "error", title: err?.name === "NotAllowedError" ? "Mesh needs your microphone" + (video ? " and camera" : "") : "Couldn't start the call",
        body: err?.name === "NotAllowedError" ? "Allow access in your browser's site settings, then try again." : undefined });
    }
  }, [call, user, toast]);

  const answer = async (inc) => {
    const session = new CallSession({ chatId: inc.chatId, video: inc.video, incoming: inc, peer: { id: inc.callerId, username: inc.callerName, photoURL: inc.callerPhoto } });
    setIncoming((l) => l.filter((c) => c.id !== inc.id));
    setCall(session);
    try { await session.answer(); }
    catch (err) {
      console.error(err);
      await session.decline();
      setCall(null);
      toast({ tone: "error", title: err?.name === "NotAllowedError" ? "Mesh needs your microphone to answer" : "Couldn't answer the call" });
    }
  };
  const decline = async (inc) => {
    setIncoming((l) => l.filter((c) => c.id !== inc.id));
    await new CallSession({ chatId: inc.chatId, video: inc.video, incoming: inc, peer: { id: inc.callerId, username: inc.callerName } }).decline();
  };
  const openComposer = useCallback((opts = {}) => setComposer(opts), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const openInterests = useCallback(() => setInterestsDialog("edit"), []);
  const shell = useMemo(() => ({
    profile, setProfile, following, setFollowing, blocked, setBlocked, inbox, openComposer, openDrawer, feedKey,
    interests, setInterests, openInterests, startCall, inCall: !!call, hiddenWords, setHiddenWords,
  }), [profile, following, blocked, inbox, openComposer, openDrawer, feedKey, interests, openInterests, startCall, call, hiddenWords]);

  const { page, overlay, bgQuery } = resolve(loc);
  usePageTitle(sectionTitle(page, signedIn, overlay ? bgQuery : loc.query), 0);

  if (!authReady) {
    return (
      <div className="flex h-dvh items-center justify-center" role="status" aria-label="Loading Mesh">
        <div className="animate-pulse"><LogoMark size={56} /></div>
      </div>
    );
  }

  // Policies have to be readable before anyone has an account.
  if (!signedIn) {
    if (page.view === "legal") {
      return (
        <div className="h-dvh overflow-y-auto" data-scroll>
          <Suspense fallback={<Loading label="Loading" />}>
            <Legal key={page.doc} doc={page.doc} standalone />
          </Suspense>
        </div>
      );
    }
    return <AuthPage />;
  }

  const query = overlay ? bgQuery : loc.query;
  const immersive = page.tab === "home" && page.section === "flicks" && !overlay;

  let content;
  if (page.tab === "home") {
    switch (page.section) {
      case "following": content = <HomeFeed key={`following-${feedKey}`} mode="following" />; break;
      case "flicks": content = <Flicks key={`flicks-${feedKey}`} startId={page.id} />; break;
      case "news": content = <News storyId={page.id} />; break;
      case "circles":
        content = page.gatheringId
          ? <GatheringPage key={`g-${page.gatheringId}-${feedKey}`} eventId={page.gatheringId} />
          : <Circles key={`circles-${feedKey}`} circleId={page.id} view={query.get("view")} />;
        break;
      case "search": content = <Search initialQuery={query.get("q") || ""} filter={query.get("type") || "top"} />; break;
      case "saved": content = <Saved />; break;
      default: content = <HomeFeed key={`foryou-${feedKey}`} mode="foryou" />;
    }
  } else if (page.tab === "messages") {
    content = <Messages chatId={page.id} />;
  } else if (page.view === "settings") {
    content = <Settings />;
  } else if (page.view === "moderation") {
    content = <Moderation />;
  } else if (page.view === "legal") {
    content = <Legal key={page.doc} doc={page.doc} />;
  } else {
    content = <Profile />;
  }
  if (page.notFound) content = <NotFound />;

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh flex-col md:flex-row">
        {/* Keyboard users land here first and can jump the navigation. */}
        <a href="#mesh-main" className="skip-link">Skip to content</a>

        <Sidebar page={page} profile={profile} unread={inbox.unreadCount} onCreate={() => openComposer()} />

        <main id="mesh-main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          <SuspensionBanner profile={profile} />
          <Suspense fallback={<Loading label="Loading" />}>{content}</Suspense>
        </main>

        <BottomNav page={page} profile={profile} unread={inbox.unreadCount} immersive={immersive} />

        {/* Overlays and dialogs load on first use; while one loads, nothing
            flashes (they open over a page that's already there). */}
        <Suspense fallback={null}>
        {overlay?.overlay === "user" && <UserProfile key={overlay.id} uid={overlay.id} />}
        {overlay?.overlay === "post" && <PostViewer key={overlay.id} postId={overlay.id} />}
        {overlay?.overlay === "watch" && <Watch key={overlay.id} postId={overlay.id} />}

        {drawerOpen && <HomeDrawer page={page} profile={profile} onClose={() => setDrawerOpen(false)} />}

        {composer && (
          <Composer {...composer} profile={profile} onClose={() => setComposer(null)}
            onPosted={(post) => {
              setComposer(null);
              setFeedKey((k) => k + 1);
              if (composer.groupId) return;
              navigate(post.kind === "short" || post.kind === "video" ? `/flicks/${post.id}` : "/");
            }} />
        )}

        <StorageNotice onReadMore={() => navigate("/legal/cookies")} />

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
    </ShellContext.Provider>
  );
}
