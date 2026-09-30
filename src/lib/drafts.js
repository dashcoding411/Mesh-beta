// Local drafts (localStorage, "mesh:draft:<uid>:<scope>"), kept for a week
// and cleared on sign-out. Text and choices only; media isn't persisted.

import { useCallback, useEffect, useRef } from "react";
import { me } from "./db";

const PREFIX = "mesh:draft:";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const keyFor = (scope) => `${PREFIX}${me() || "signed-out"}:${scope}`;

/** { data, at } or null. */
export function readDraft(scope) {
  if (!scope) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(scope)) || "null");
    if (!saved || typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE) {
      localStorage.removeItem(keyFor(scope));
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function writeDraft(scope, json) {
  if (!scope) return;
  try {
    if (json) localStorage.setItem(keyFor(scope), `{"at":${Date.now()},"data":${json}}`);
    else localStorage.removeItem(keyFor(scope));
  } catch { /* storage full or blocked: the draft lasts as long as the screen */ }
}

/** Removes drafts for every account (sign-out). */
export function clearAllDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked: nothing was saved */ }
}

/** Debounced autosave of `data` (null clears). Returns `finish()` to call after a successful send. */
export function useDraft(scope, data) {
  const json = data ? JSON.stringify(data) : "";
  const latest = useRef(json);
  const finishedWith = useRef(null);

  useEffect(() => {
    // Ignore the render that follows finish() with the just-sent text.
    if (finishedWith.current !== null) {
      if (json === finishedWith.current) return;
      finishedWith.current = null;
    }
    latest.current = json;
    const t = setTimeout(() => writeDraft(scope, json), 400);
    return () => clearTimeout(t);
  }, [scope, json]);

  // Flush on unmount inside the debounce window.
  useEffect(() => () => writeDraft(scope, latest.current), [scope]);

  return useCallback(() => {
    finishedWith.current = latest.current;
    latest.current = "";
    writeDraft(scope, "");
  }, [scope]);
}
