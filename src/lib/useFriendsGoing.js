import { useEffect, useState } from "react";
import { fetchFriendsGoing, fetchProfiles, tsMillis } from "./db";
import { useShell } from "../components/shell/ShellContext";

/**
 * Friends going for the next dozen upcoming gatherings in a list, with up to
 * three profile photos each. Signed out, or following nobody, it's empty.
 */
export function useFriendsGoing(events) {
  const { following, guest } = useShell();
  const [state, setState] = useState({ friends: new Map(), people: new Map() });
  const key = (events || []).map((e) => e.id).join(",");

  useEffect(() => {
    if (guest || !events?.length || !following?.size) return undefined;
    let live = true;
    const soon = events.filter((e) => tsMillis(e.startsAt) > Date.now() - 6 * 3600000).slice(0, 12);
    fetchFriendsGoing(soon, following).then(async (friends) => {
      const ids = [...new Set([...friends.values()].flatMap((l) => l.slice(0, 3).map((f) => f.id)))].slice(0, 60);
      const people = ids.length ? await fetchProfiles(ids).catch(() => new Map()) : new Map();
      if (live) setState({ friends, people });
    }).catch(() => {});
    return () => { live = false; };
    // The ids stand in for the list, which is a new array on every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, following, guest]);

  return state;
}
