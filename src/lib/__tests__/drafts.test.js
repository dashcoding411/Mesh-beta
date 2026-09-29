import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain in-memory stand-in for the browser's localStorage. The Proxy lets
// Object.keys(localStorage) list the stored keys, as it does in a browser.
const store = new Map();
globalThis.localStorage = new Proxy({
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined),
});

vi.mock("../db", () => ({ me: () => "user-a" }));
const { readDraft, writeDraft, clearAllDrafts } = await import("../drafts");

describe("drafts", () => {
  beforeEach(() => store.clear());

  it("saves and reads back a draft for this account", () => {
    writeDraft("post", JSON.stringify({ text: "half a thought" }));
    const d = readDraft("post");
    expect(d.data).toEqual({ text: "half a thought" });
    expect(typeof d.at).toBe("number");
    expect([...store.keys()]).toEqual(["mesh:draft:user-a:post"]);
  });

  it("an empty draft removes the saved one", () => {
    writeDraft("post", JSON.stringify({ text: "x" }));
    writeDraft("post", "");
    expect(readDraft("post")).toBeNull();
    expect(store.size).toBe(0);
  });

  it("drafts older than a week are dropped", () => {
    store.set("mesh:draft:user-a:post", JSON.stringify({ at: Date.now() - 8 * 24 * 3600 * 1000, data: { text: "old" } }));
    expect(readDraft("post")).toBeNull();
    expect(store.size).toBe(0);
  });

  it("a damaged draft is ignored rather than crashing", () => {
    store.set("mesh:draft:user-a:post", "{not json");
    expect(readDraft("post")).toBeNull();
  });

  it("signing out clears every draft on the device, and nothing else", () => {
    writeDraft("post", JSON.stringify({ text: "a" }));
    store.set("mesh:draft:user-b:chat:1", "{}");
    store.set("mesh:appearance", "{}");
    clearAllDrafts();
    expect([...store.keys()]).toEqual(["mesh:appearance"]);
  });
});
