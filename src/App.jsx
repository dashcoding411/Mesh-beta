import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { fetchProfile, fetchMyFollowingSet } from "./lib/db";
import { useLocation, resolve, navigate } from "./lib/router";
import { useInbox } from "./lib/inbox";
import { ShellContext } from "./components/shell/ShellContext";
import Sidebar, { LogoMark } from "./components/shell/Sidebar";
import BottomNav from "./components/shell/BottomNav";
import HomeDrawer from "./components/shell/HomeDrawer";
import AuthPage from "./components/AuthPage";
import HomeFeed from "./components/HomeFeed";
import Flicks from "./components/Flicks";
import Search from "./components/Search";
import Saved from "./components/Saved";
import News from "./components/News";
import Circles from "./components/Circles";
import Messages from "./components/Messages";
import Profile from "./components/Profile";
import Settings from "./components/Settings";
import Legal from "./components/Legal";
import UserProfile from "./components/UserProfile";
import PostViewer from "./components/PostViewer";
import Watch from "./components/Watch";
import Composer from "./components/Composer";
import StorageNotice from "./components/StorageNotice";

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(new Set());
  const [composer, setComposer] = useState(null); // null | { kind?, groupId?, group? }
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  const loc = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const [p, f] = await Promise.all([
          fetchProfile(u.uid).catch(() => null),
          fetchMyFollowingSet().catch(() => new Set()),
        ]);
        setProfile(p);
        setFollowing(f);
      } else {
        setProfile(null);
        setFollowing(new Set());
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const signedIn = !!(user && profile);
  const inbox = useInbox(following, signedIn);
  const openComposer = useCallback((opts = {}) => setComposer(opts), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const shell = useMemo(() => ({
    profile, setProfile, following, setFollowing, inbox, openComposer, openDrawer, feedKey,
  }), [profile, following, inbox, openComposer, openDrawer, feedKey]);

  const { page, overlay, bgQuery } = resolve(loc);

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
          <Legal key={page.doc} doc={page.doc} standalone />
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
      case "news": content = <News />; break;
      case "circles": content = <Circles key={`circles-${feedKey}`} circleId={page.id} view={query.get("view")} />; break;
      case "search": content = <Search initialQuery={query.get("q") || ""} filter={query.get("type") || "top"} />; break;
      case "saved": content = <Saved />; break;
      default: content = <HomeFeed key={`foryou-${feedKey}`} mode="foryou" />;
    }
  } else if (page.tab === "messages") {
    content = <Messages chatId={page.id} />;
  } else if (page.view === "settings") {
    content = <Settings />;
  } else if (page.view === "legal") {
    content = <Legal key={page.doc} doc={page.doc} />;
  } else {
    content = <Profile />;
  }

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh flex-col md:flex-row">
        {/* Keyboard users land here first and can jump the navigation. */}
        <a href="#mesh-main" className="skip-link">Skip to content</a>

        <Sidebar page={page} profile={profile} unread={inbox.unreadCount} onCreate={() => openComposer()} />

        <main id="mesh-main" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          {content}
        </main>

        <BottomNav page={page} profile={profile} unread={inbox.unreadCount} immersive={immersive} />

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
      </div>
    </ShellContext.Provider>
  );
}
