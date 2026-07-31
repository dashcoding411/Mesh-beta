import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { fetchProfile, fetchMyFollowingSet, onOpenUserProfile, onOpenPost } from "./lib/db";
import AuthPage from "./components/AuthPage";
import Nav from "./components/Nav";
import Weave from "./components/Weave";
import Stills from "./components/Stills";
import Flicks from "./components/Flicks";
import Features from "./components/Features";
import Circles from "./components/Circles";
import Sourced from "./components/Sourced";
import Chats from "./components/Chats";
import Discover from "./components/Discover";
import Profile from "./components/Profile";
import AccountPage from "./components/AccountPage";
import UserProfile from "./components/UserProfile";
import PostViewer from "./components/PostViewer";
import Composer from "./components/Composer";

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(new Set());
  const [tab, setTab] = useState("weave");
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewUserId, setViewUserId] = useState(null);
  const [viewPostId, setViewPostId] = useState(null);
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const [p, f] = await Promise.all([
          fetchProfile(u.uid),
          fetchMyFollowingSet().catch(() => new Set()),
        ]);
        setProfile(p);
        setFollowing(f);
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => onOpenUserProfile((uid) => {
    if (uid === auth.currentUser?.uid) setTab("profile");
    else setViewUserId(uid);
  }), []);

  useEffect(() => onOpenPost(setViewPostId), []);

  useEffect(() => {
    const fn = (e) => { setViewUserId(null); setViewPostId(null); setTab(e.detail); };
    window.addEventListener("mesh:goto-tab", fn);
    return () => window.removeEventListener("mesh:goto-tab", fn);
  }, []);

  if (!authReady) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-3xl font-black bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent animate-pulse">
          Mesh
        </div>
      </div>
    );
  }

  if (!user || !profile) return <AuthPage />;

  const ctx = { profile, following, setFollowing, goTo: setTab };

  const pages = {
    weave: <Weave key={`weave-${feedKey}`} {...ctx} />,
    stills: <Stills key={`stills-${feedKey}`} {...ctx} />,
    flicks: <Flicks key={`flicks-${feedKey}`} {...ctx} />,
    features: <Features key={`features-${feedKey}`} {...ctx} />,
    circles: <Circles key={`circles-${feedKey}`} {...ctx} />,
    sourced: <Sourced {...ctx} />,
    chats: <Chats {...ctx} />,
    discover: <Discover {...ctx} />,
    profile: <Profile profile={profile} onProfileChange={setProfile} />,
    account: <AccountPage profile={profile} />,
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      <Nav tab={tab} onTab={(t) => { setViewUserId(null); setTab(t); }}
        onCreate={() => setComposerOpen(true)} profile={profile} />

      <main className={`flex-1 min-h-0 overflow-hidden anim-fade ${
        tab === "flicks" ? "-mb-[58px] md:mb-0" : ""
      }`} key={tab}>
        {pages[tab]}
      </main>

      {viewUserId && (
        <UserProfile uid={viewUserId} following={following} setFollowing={setFollowing}
          onClose={() => setViewUserId(null)} />
      )}

      {viewPostId && <PostViewer postId={viewPostId} onClose={() => setViewPostId(null)} />}

      {composerOpen && (
        <Composer profile={profile} onClose={() => setComposerOpen(false)}
          onPosted={(kind) => {
            setComposerOpen(false);
            setFeedKey((k) => k + 1);
            setTab(kind === "short" ? "flicks" : kind === "video" ? "features" : "weave");
          }} />
      )}
    </div>
  );
}
