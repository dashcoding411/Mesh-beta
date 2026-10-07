import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";

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

const { readSnapshot, saveSnapshot, clearSnapshots } = await import("../snapshot");
const DAY = 24 * 3600e3;

describe("snapshots", () => {
  beforeEach(() => { store.clear(); vi.useRealTimers(); });

  it("gives back Firestore times as times, nested anywhere", () => {
    const at = Timestamp.fromMillis(1_790_000_000_123);
    saveSnapshot("home:a", [{ id: "p1", createdAt: at, poll: { endsAt: at }, likeCount: 3 }]);
    const [post] = readSnapshot("home:a", DAY);
    expect(post.createdAt).toBeInstanceOf(Timestamp);
    expect(post.createdAt.toMillis()).toBe(1_790_000_000_123);
    expect(post.poll.endsAt.toMillis()).toBe(1_790_000_000_123);
    expect(post.likeCount).toBe(3);
  });

  it("leaves ordinary objects that only look a bit like times alone", () => {
    saveSnapshot("me:a", { size: { seconds: 5, nanoseconds: 0, label: "x", other: 1 } });
    expect(readSnapshot("me:a", DAY).size).toEqual({ seconds: 5, nanoseconds: 0, label: "x", other: 1 });
  });

  it("ignores a copy older than asked for", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    saveSnapshot("home:a", [{ id: "p1" }]);
    vi.setSystemTime(1_000_000 + 2 * DAY);
    expect(readSnapshot("home:a", DAY)).toBeNull();
    expect(readSnapshot("home:a", 3 * DAY)).toEqual([{ id: "p1" }]);
  });

  it("doesn't keep a copy too big for the device, and drops the old one", () => {
    saveSnapshot("home:a", [{ id: "small" }]);
    saveSnapshot("home:a", [{ text: "x".repeat(400_000) }]);
    expect(readSnapshot("home:a", DAY)).toBeNull();
  });

  it("clears every copy, and nothing else", () => {
    saveSnapshot("me:a", { profile: {} });
    saveSnapshot("home:a:foryou:all", []);
    localStorage.setItem("mesh:consent", "{}");
    clearSnapshots();
    expect([...store.keys()]).toEqual(["mesh:consent"]);
  });
});
