// Unfinished posts and messages, kept on this device so closing the
// composer, switching chats or losing the tab doesn't lose what you wrote.
//
// Stored in this browser only (localStorage, keys beginning "mesh:draft:",
// see the Cookies & Storage policy), per account, for a week at most, and
// all of them are removed when you sign out. Photos and videos aren't kept:
// only words and choices.

import { useCallback, useEffect, useRef } from "react";
import { me } from "./db";

const PREFIX = "mesh:draft:";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const keyFor = (scope) => `${PREFIX}${me() || "signed-out"}:${scope}`;

/** The saved draft for `scope`, or null. `at` is when it was last saved. */
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

/** Save a draft (as JSON text), or remove it when `json` is empty. */
export function writeDraft(scope, json) {
  if (!scope) return;
  try {
    if (json) localStorage.setItem(keyFor(scope), `{"at":${Date.now()},"data":${json}}`);
    else localStorage.removeItem(keyFor(scope));
  } catch { /* storage full or blocked: the draft lasts as long as the screen */ }
}

/** Every draft on this device, for any account. Called on sign-out. */
export function clearAllDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked: nothing was saved */ }
}

/** Keep `data` saved as the draft for `scope` while it changes (null or
    undefined means there's nothing worth keeping). Returns `finish`, to call
    once the post is sent: it removes the draft and stops the last few
    keystrokes being saved back as the screen closes. */
export function useDraft(scope, data) {
  const json = data ? JSON.stringify(data) : "";
  const latest = useRef(json);
  const finishedWith = useRef(null);

  useEffect(() => {
    // Right after finishing, the screen may render once more with the words
    // it just sent. That isn't a new draft.
    if (finishedWith.current !== null) {
      if (json === finishedWith.current) return;
      finishedWith.current = null;
    }
    latest.current = json;
    const t = setTimeout(() => writeDraft(scope, json), 400);
    return () => clearTimeout(t);
  }, [scope, json]);

  // Closing within the 400ms still keeps the last words.
  useEffect(() => () => writeDraft(scope, latest.current), [scope]);

  return useCallback(() => {
    finishedWith.current = latest.current;
    latest.current = "";
    writeDraft(scope, "");
  }, [scope]);
}
