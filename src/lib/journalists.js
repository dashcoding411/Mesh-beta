// Journalist bylines, read once per session per writer.
import { useEffect, useState } from "react";
import { fetchJournalist, fetchStoriesBy } from "./db";

const cards = new Map(); // uid -> Promise<journalist | null>

function cardFor(uid) {
  if (!cards.has(uid)) cards.set(uid, fetchJournalist(uid).catch(() => null));
  return cards.get(uid);
}

/** Who a journalist writes for. */
export const outletOf = (j) => j?.outlet || "Independent journalist";

/** After an edit, so bylines pick up the change. */
export function forgetJournalist(uid) {
  cards.delete(uid);
}

/** undefined while loading, null if `uid` isn't a journalist. */
export function useJournalist(uid) {
  const [card, setCard] = useState({ uid, value: undefined });
  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    cardFor(uid).then((value) => { if (alive) setCard({ uid, value }); });
    return () => { alive = false; };
  }, [uid]);
  return card.uid === uid ? card.value : undefined;
}

/** A journalist's published stories; null while loading or when they aren't one. */
export function useJournalistStories(uid, isJournalist) {
  const [state, setState] = useState({ uid, stories: null });
  useEffect(() => {
    if (!uid || !isJournalist) return undefined;
    let alive = true;
    fetchStoriesBy(uid)
      .then((stories) => { if (alive) setState({ uid, stories }); })
      .catch(() => { if (alive) setState({ uid, stories: [] }); });
    return () => { alive = false; };
  }, [uid, isJournalist]);
  return state.uid === uid ? state.stories : null;
}
