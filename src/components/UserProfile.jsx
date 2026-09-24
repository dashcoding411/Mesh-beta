import { useEffect, useState } from "react";
import {
  fetchProfile, fetchPostsByAuthor, fetchMyLikes, toggleFollow,
  openDirectChat, timeAgo, me,
} from "../lib/db";
import { Avatar } from "./Nav";
import PostCard from "./PostCard";

// Overlay profile for other users, with follow + message actions.
export default function UserProfile({ uid, following, setFollowing, onClose }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState(null);
  const [liked, setLiked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const followed = following.has(uid);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await fetchProfile(uid);
      if (cancelled) return;
      setProfile(p);
      try {
        const list = await fetchPostsByAuthor(uid);
        if (cancelled) return;
        // hide followers-only posts unless we follow them
        setPosts(list.filter((x) => x.visibility !== "followers" || following.has(uid)));
        const likes = await fetchMyLikes(list.map((x) => x.id));
        if (!cancelled) setLiked(likes);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [uid, following]);

  const handleFollow = async () => {
    if (busy || !profile) return;
    setBusy(true);
    try {
      await toggleFollow(profile, followed);
      setFollowing((prev) => {
        const next = new Set(prev);
        followed ? next.delete(uid) : next.add(uid);
        return next;
      });
      setProfile((p) => ({ ...p, followerCount: (p.followerCount || 0) + (followed ? -1 : 1) }));
    } finally {
      setBusy(false);
    }
  };

  const handleMessage = async () => {
    await openDirectChat(profile);
    onClose();
    window.dispatchEvent(new CustomEvent("mesh:goto-tab", { detail: "messages" }));
  };

  const onLikedChange = (id, isLiked) => {
    setLiked((prev) => {
      const next = new Set(prev);
      isLiked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/98 backdrop-blur anim-fade overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 py-6 pb-24">
        <button onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200 mb-4">← Back</button>

        {!profile ? (
          <p className="text-zinc-400">Loading…</p>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 mb-6 anim-rise">
              <div className="flex items-center gap-4">
                <Avatar profile={profile} size={16} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">
                    @{profile.username}
                    {profile.pronouns && <span className="ml-2 text-sm font-normal text-zinc-400">({profile.pronouns})</span>}
                  </h2>
                  <div className="flex gap-4 mt-1 text-sm">
                    <span><strong>{profile.followerCount || 0}</strong> <span className="text-zinc-400">followers</span></span>
                    <span><strong>{profile.followingCount || 0}</strong> <span className="text-zinc-400">following</span></span>
                  </div>
                </div>
              </div>

              {(profile.bio || profile.town || profile.spouseUsername) && (
                <div className="mt-4 space-y-1 text-sm text-zinc-300">
                  {profile.bio && <p className="whitespace-pre-wrap">{profile.bio}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400 pt-1">
                    {profile.town && <span>📍 {profile.town}</span>}
                    {profile.spouseUsername && !profile.spouseUsername.includes("pending") && <span>💍 {profile.spouseUsername}</span>}
                    <span>joined {timeAgo(profile.createdAt)}</span>
                  </div>
                </div>
              )}

              {uid !== me() && (
                <div className="flex gap-2 mt-4">
                  <button onClick={handleFollow} disabled={busy}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                      followed
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500"
                    }`}>
                    {followed ? "Following ✓" : "Follow"}
                  </button>
                  <button onClick={handleMessage}
                    className="flex-1 rounded-xl border border-zinc-700 hover:border-violet-500 py-2.5 text-sm font-semibold transition">
                    Message
                  </button>
                </div>
              )}
            </div>

            {posts === null && <p className="text-zinc-400">Loading posts…</p>}
            {posts?.length === 0 && <p className="text-zinc-400 text-sm">No posts to show.</p>}
            <div className="space-y-6 stagger">
              {posts?.map((p) => (
                <PostCard key={p.id} post={p} liked={liked.has(p.id)} onLikedChange={onLikedChange} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
