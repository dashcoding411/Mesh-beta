// Opening one story from anywhere (a notification, say). The app shell
// listens and shows it in the story viewer, with echoes or your story's
// activity already open when asked.

export const OPEN_STORY_EVENT = "mesh:open-story";

/** @param {string} id @param {{panel?: "echoes" | "activity"}} [opts] */
export function openStory(id, opts = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_STORY_EVENT, { detail: { id, ...opts } }));
}
