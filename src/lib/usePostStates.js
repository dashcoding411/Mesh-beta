import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyLikes, fetchMySaves, fetchMyReposts } from "./db";

// Per-feed cache so a remounted feed doesn't refetch or flash empty states.
const kept = new Map(); // keepKey -> { state, fetched }

/** Viewer's liked/saved/reposted state per post, fetched once per post and updated optimistically. `keepKey` persists it across remounts. */
export function usePostStates(posts, keepKey) {
  const [state, setState] = useState(() => kept.get(keepKey)?.state
    || { liked: new Set(), saved: new Set(), reposted: new Set() });
  const fetched = useRef(kept.get(keepKey)?.fetched || new Set());
  const key = (posts || []).map((p) => p.id).join(",");

  useEffect(() => {
    if (keepKey) kept.set(keepKey, { state, fetched: fetched.current });
  }, [keepKey, state]);

  useEffect(() => {
    // Only ids not fetched yet.
    const list = key ? key.split(",").filter((id) => !fetched.current.has(id)) : [];
    if (!list.length) return;
    list.forEach((id) => fetched.current.add(id));
    // Deliberately not cancelled: ids are already marked fetched, so dropping
    // a late result (e.g. StrictMode double-run) would lose it permanently.
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
