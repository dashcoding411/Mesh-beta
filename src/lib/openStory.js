// Event-based story opener, handled by StoryOpener in the app shell.

export const OPEN_STORY_EVENT = "mesh:open-story";

/** @param {string} id @param {{panel?: "echoes" | "activity", tab?: "viewers" | "echoes"}} [opts] */
export function openStory(id, opts = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_STORY_EVENT, { detail: { id, ...opts } }));
}
