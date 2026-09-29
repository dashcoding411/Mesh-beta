import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyLikes, fetchMySaves, fetchMyReposts } from "./db";

// What a kept feed already knew, so returning to it doesn't refetch every
// heart or flash them empty first. Lives for this visit only.
const kept = new Map(); // keepKey -> { state, fetched }

/* Whether *you* have liked, saved or reposted each post. Fetched once per
   post as it becomes visible, and updated optimistically when you act, so
   the heart fills the instant you tap rather than after the round trip.
   Pass `keepKey` to carry the answers across a remount (the Home feeds). */
export function usePostStates(posts, keepKey) {
  const [state, setState] = useState(() => kept.get(keepKey)?.state
    || { liked: new Set(), saved: new Set(), reposted: new Set() });
  const fetched = useRef(kept.get(keepKey)?.fetched || new Set());
  const key = (posts || []).map((p) => p.id).join(",");

  useEffect(() => {
    if (keepKey) kept.set(keepKey, { state, fetched: fetched.current });
  }, [keepKey, state]);

  useEffect(() => {
    // Only posts we haven't asked about yet, paging in more shouldn't refetch the first page.
    const list = key ? key.split(",").filter((id) => !fetched.current.has(id)) : [];
    if (!list.length) return;
    list.forEach((id) => fetched.current.add(id));
    // No cancellation on purpose: results are merged, so applying them late
    // is harmless: whereas discarding them (as a cleanup would under
    // StrictMode's double-run) leaves those posts looking un-liked forever,
    // because the ids are already marked as fetched.
    Promise.all([
      fetchMyLikes(list).catch(() => new Set()),
      fetchMySaves(list).catch(() => new Set()),
      fetchMyReposts(list).catch(() => new Set()),
    ]).then(([liked, saved, reposted]) => {
      setState((prev) => ({
        liked: new Set([...prev.liked, ...liked]),
        saved: new Set([...prev.saved, ...saved]),
        reposted: new Set([...prev.reposted, ...reposted]),
      }));
    });
  }, [key]);

  const update = useCallback((id, field, on) => {
    setState((prev) => {
      const next = new Set(prev[field]);
      if (on) next.add(id); else next.delete(id);
      return { ...prev, [field]: next };
    });
  }, []);

  return [state, update];
}
