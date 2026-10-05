// The Cloudflare push Worker: Web Push encryption checked against RFC 8291's
// worked example, VAPID signing, and how notifications are worded and routed.
import { describe, expect, it } from "vitest";
import { b64url, encryptPayload, importEcdhKeys, vapidAuth } from "../../../cloudflare/push/src/webpush.js";

const d = b64url.decode;

describe("web push encryption", () => {
  it("matches RFC 8291's example byte for byte", async () => {
    const local = await importEcdhKeys(
      d("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"),
      d("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
    );
    const body = await encryptPayload(
      d("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24"),
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      { local, salt: d("DGv6ra1nlYgDCS1FRnbzlw") },
    );
    // Salt, record size 4096, key id length 65, the sender's key, then the ciphertext.
    expect(b64url.encode(body.slice(0, 16))).toBe("DGv6ra1nlYgDCS1FRnbzlw");
    expect([...body.slice(16, 21)]).toEqual([0, 0, 16, 0, 65]);
    expect(b64url.encode(body.slice(21, 86))).toBe("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    expect(b64url.encode(body.slice(86))).toBe("8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ");
  });

  it("signs a VAPID token the public key verifies", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const publicKey = b64url.encode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const header = await vapidAuth("https://fcm.googleapis.com/fcm/send/abc", { publicKey, privateJwk, subject: "mailto:admin@joinmesh.social" }, 1_800_000_000_000);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(k).toBe(publicKey);
    const [h, c, s] = token.split(".");
    const claims = JSON.parse(new TextDecoder().decode(d(c)));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_800_000_000 + 12 * 3600, sub: "mailto:admin@joinmesh.social" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, d(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});

import { messagePushes, noticePush, pushEndpointOk, wants, callPush } from "../../../cloudflare/push/src/compose.js";
import { deviceId, handle, runDue } from "../../../cloudflare/push/src/worker.js";

const NOW = Date.parse("2026-10-06T10:00:00Z");
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

describe("what notifications say", () => {
  const chat = {
    id: "c1", members: ["a", "b", "c"], memberNames: { a: "ana", b: "ben", c: "cy" }, createdBy: "a", acceptedBy: ["b"], mutedBy: [],
  };

  it("shows a message to people who started or accepted the chat, and keeps requests private", () => {
    const pushes = messagePushes({ ...chat, members: ["a", "b"], isGroup: false }, { senderId: "a", text: "see you at 8" }, "a");
    expect(pushes).toEqual([{ uid: "b", kind: "messages", payload: { title: "@ana", body: "see you at 8", url: "/messages/c1", tag: "chat-c1" } }]);
    const request = messagePushes({ ...chat, members: ["a", "c"], isGroup: false }, { senderId: "a", text: "hey stranger" }, "a");
    expect(request[0].payload.body).toBe("Sent you a message");
    // Following whoever started the chat means it isn't a request.
    const friend = messagePushes({ ...chat, members: ["a", "c"], isGroup: false }, { senderId: "a", text: "hey friend" }, "a", new Set(["c"]));
    expect(friend[0].payload.body).toBe("hey friend");
  });

  it("names the sender in groups, skips muted people, and never pushes call logs or unsent messages", () => {
    const group = messagePushes({ ...chat, isGroup: true, name: "Park run", mutedBy: ["c"] }, { senderId: "a", photo: {} }, "a");
    expect(group).toHaveLength(1);
    expect(group[0].payload).toMatchObject({ title: "Park run", body: "@ana: Photo" });
    expect(messagePushes(chat, { senderId: "a", call: { summary: "Missed call" } }, "a")).toEqual([]);
    expect(messagePushes(chat, { senderId: "a", text: "x", deleted: true }, "a")).toEqual([]);
    expect(messagePushes(chat, { senderId: "b", text: "x" }, "a")).toEqual([]); // not the caller's message
  });

  it("pushes replies, follows and invites, but never likes", () => {
    expect(noticePush({ id: "n", type: "comment", actorName: "ana", postId: "p1", text: "love this" }, "b"))
      .toMatchObject({ kind: "comments", payload: { title: "@ana", body: "Commented: love this", url: "/p/p1" } });
    expect(noticePush({ id: "n", type: "follow", actorName: "ana" }, "b")).toMatchObject({ kind: "follows", payload: { url: "/@ana" } });
    expect(noticePush({ id: "n", type: "like", actorName: "ana" }, "b")).toBe(null);
    expect(noticePush({ id: "n", type: "storylike", actorName: "ana" }, "b")).toBe(null);
  });

  it("says who's calling", () => {
    expect(callPush({ id: "k", calleeId: "b", callerName: "ana", video: true, chatId: "c1" }).payload).toMatchObject({ title: "@ana", body: "Video calling you" });
  });

  it("respects each device's choices, and Brick mode keeps all but messages and calls quiet", () => {
    const dev = { kinds: JSON.stringify(["messages", "comments", "calls"]), quiet_until: NOW + 3600000 };
    expect(wants(dev, "messages", NOW)).toBe(true);
    expect(wants(dev, "calls", NOW)).toBe(true);
    expect(wants(dev, "comments", NOW)).toBe(false); // bricked for another hour
    expect(wants({ ...dev, quiet_until: 0 }, "comments", NOW)).toBe(true);
    expect(wants(dev, "follows", NOW)).toBe(false); // switched off
  });

  it("only delivers to real push services", () => {
    expect(pushEndpointOk("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(pushEndpointOk("https://web.push.apple.com/QGx")).toBe(true);
    expect(pushEndpointOk("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(pushEndpointOk("https://evil.example.com/fcm.googleapis.com")).toBe(false);
    expect(pushEndpointOk("http://fcm.googleapis.com/x")).toBe(false);
  });
});

// An in-memory stand-in for D1.
function memoryStore() {
  const devices = new Map();
  const alerts = new Map();
  const sent = new Set();
  return {
    devices, alerts,
    device: async (id) => devices.get(id) || null,
    devicesFor: async (uid) => [...devices.values()].filter((d) => d.uid === uid),
    upsertDevice: async (d) => { devices.set(d.id, { ...d }); },
    updateDevice: async (id, f) => { const d = devices.get(id); if (f.kinds != null) d.kinds = f.kinds; if (f.quiet_until != null) d.quiet_until = f.quiet_until; },
    deleteDevice: async (id) => { devices.delete(id); },
    deleteUser: async (uid) => { for (const [k, d] of devices) if (d.uid === uid) devices.delete(k); for (const [k, a] of alerts) if (a.uid === uid) alerts.delete(k); },
    putAlert: async (a) => { alerts.set(a.id, { ...a }); },
    deleteAlert: async (id) => { alerts.delete(id); },
    alertsFor: async (kind, ref) => [...alerts.values()].filter((a) => a.kind === kind && a.ref === ref),
    dueAlerts: async (now) => [...alerts.values()].filter((a) => a.at <= now),
    markSent: async (key) => (sent.has(key) ? false : (sent.add(key), true)),
    pruneSent: async () => {},
  };
}

describe("push Worker", () => {
  const env = { ALLOWED_ORIGINS: "https://joinmesh.social" };
  const P256 = `B${"A".repeat(86)}`;
  const AUTH = "A".repeat(22);
  const call = (method, path, body, d) => handle(new Request(`https://push.example${path}`, {
    method, headers: { Origin: "https://joinmesh.social", Authorization: "Bearer t", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  }), env, null, d);

  function setup(docs = {}) {
    const store = memoryStore();
    const pushed = [];
    const d = {
      store, now: () => NOW,
      verify: async () => "ana",
      firestore: async (_, path) => docs[path] || null,
      push: async (dev, payload) => { pushed.push({ uid: dev.uid, payload }); return dev.endpoint.includes("gone") ? "gone" : "sent"; },
    };
    return { store, pushed, d };
  }

  it("registers a device for a real push service, and refuses other addresses", async () => {
    const { store, d } = setup();
    const ok = await call("POST", "/devices", { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: P256, auth: AUTH }, kinds: ["messages", "nonsense"] }, d);
    expect(ok.status).toBe(200);
    const dev = await store.device(await deviceId("https://fcm.googleapis.com/fcm/send/x"));
    expect(dev).toMatchObject({ uid: "ana", kinds: '["messages"]' });
    const bad = await call("POST", "/devices", { endpoint: "https://evil.example.com/x", keys: { p256dh: P256, auth: AUTH } }, d);
    expect(bad.status).toBe(400);
  });

  it("turns away other websites", async () => {
    const { d } = setup();
    const res = await handle(new Request("https://push.example/devices", { method: "POST", headers: { Origin: "https://evil.example.com" } }), env, null, d);
    expect(res.status).toBe(403);
  });

  it("pushes a fresh message once, only if the caller sent it", async () => {
    const docs = {
      "chats/c1": { members: ["ana", "ben"], memberNames: { ana: "ana", ben: "ben" }, createdBy: "ana" },
      "chats/c1/messages/m1": { senderId: "ana", text: "hi", createdAt: iso(5000) },
      "chats/c1/messages/old": { senderId: "ana", text: "hi", createdAt: iso(10 * 60000) },
      "chats/c1/messages/theirs": { senderId: "ben", text: "hi", createdAt: iso(5000) },
      "users/ana/followers/ben": { username: "ben" },
    };
    const { store, pushed, d } = setup(docs);
    await store.upsertDevice({ id: "d1", uid: "ben", endpoint: "https://fcm.googleapis.com/x", kinds: '["messages"]', quiet_until: 0 });
    const first = await (await call("POST", "/notify", { kind: "message", chatId: "c1", messageId: "m1" }, d)).json();
    expect(first.sent).toBe(1);
    expect(pushed[0]).toMatchObject({ uid: "ben", payload: { title: "@ana", body: "hi", kind: "messages" } });
    expect((await (await call("POST", "/notify", { kind: "message", chatId: "c1", messageId: "m1" }, d)).json()).sent).toBe(0); // already sent
    expect((await (await call("POST", "/notify", { kind: "message", chatId: "c1", messageId: "old" }, d)).json()).sent).toBe(0);
    expect((await (await call("POST", "/notify", { kind: "message", chatId: "c1", messageId: "theirs" }, d)).json()).sent).toBe(0);
    expect(pushed).toHaveLength(1);
  });

  it("removes devices whose subscription has expired", async () => {
    const docs = { "users/ben/notifications/follow_ana": { type: "follow", actorId: "ana", actorName: "ana", createdAt: iso(1000) } };
    const { store, d } = setup(docs);
    await store.upsertDevice({ id: "gone1", uid: "ben", endpoint: "https://fcm.googleapis.com/gone", kinds: '["follows"]', quiet_until: 0 });
    await call("POST", "/notify", { kind: "notice", to: "ben", id: "follow_ana" }, d);
    expect(store.devices.has("gone1")).toBe(false);
  });

  it("sets a roll reminder for members only, and sends it when due", async () => {
    const docs = {
      "rolls/r1": { title: "Sam's 21st", members: ["ana"], developAt: new Date(NOW + 3600000).toISOString() },
      "rolls/r2": { title: "Not mine", members: ["ben"], developAt: new Date(NOW + 3600000).toISOString() },
    };
    const { store, pushed, d } = setup(docs);
    await store.upsertDevice({ id: "d1", uid: "ana", endpoint: "https://fcm.googleapis.com/x", kinds: '["rolls"]', quiet_until: 0 });
    expect((await (await call("POST", "/alerts", { kind: "roll", id: "r1" }, d)).json()).ok).toBe(true);
    expect((await (await call("POST", "/alerts", { kind: "roll", id: "r2" }, d)).json()).ok).toBe(false);
    await runDue(env, d);
    expect(pushed).toHaveLength(0); // not yet
    await runDue(env, { ...d, now: () => NOW + 3600001 });
    expect(pushed[0].payload).toMatchObject({ title: "Your roll has developed", url: "/rolls/r1" });
    expect(store.alerts.size).toBe(0);
  });

  it("forgets everything about an account on request", async () => {
    const { store, d } = setup();
    await store.upsertDevice({ id: "d1", uid: "ana", endpoint: "https://fcm.googleapis.com/x", kinds: "[]", quiet_until: 0 });
    await store.putAlert({ id: "roll:r1:ana", uid: "ana", kind: "rolls", ref: "r1", at: NOW });
    await call("DELETE", "/me", null, d);
    expect(store.devices.size + store.alerts.size).toBe(0);
  });
});
