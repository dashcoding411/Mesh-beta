// Mesh push: sends notifications to phones and computers that asked for
// them. Signed-in people register their device's push subscription; when
// they send a message, comment, follow or call, their app asks this Worker
// to notify the other person. The Worker reads the message, notice or call
// from Firestore with the sender's own sign-in (so the security rules
// decide), checks it really just happened, and only then pushes. A cron
// trigger sends reminders: rolls developing at 9am, and gatherings 2 hours
// before they start. Deploy with `npm run push:deploy`.

import { httpError, verifyToken } from "./auth.js";
import { sendPush } from "./webpush.js";
import { d1Store } from "./store.js";
import {
  KINDS, REMIND_BEFORE_MS, callPush, gatheringAlert, messagePushes, noticePush, pushEndpointOk, rollAlert, wants,
} from "./compose.js";

const FRESH_MS = 2 * 60000; // a message or notice older than this isn't pushed

export default {
  fetch: (req, env, ctx) => handle(req, env, ctx),
  scheduled: (_, env, ctx) => ctx.waitUntil(runDue(env, deps(env))),
};

function deps(env, overrides = {}) {
  return {
    store: d1Store(env.DB),
    verify: (req) => verifyToken(req, env),
    firestore: (token, path) => firestoreGet(env, token, path),
    // Async, so a bad key becomes a failed send rather than a crash.
    push: async (device, payload, opts) => sendPush(device, payload, vapid(env), opts),
    now: () => Date.now(),
    ...overrides,
  };
}

const vapid = (env) => ({ publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_KEY), subject: env.VAPID_SUBJECT });

export async function handle(req, env, ctx, overrides) {
  const d = deps(env, overrides);
  const url = new URL(req.url);
  const origin = req.headers.get("Origin") || "";
  const trusted = env.ALLOWED_ORIGINS.split(",").includes(origin);
  const cors = trusted ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  } : { Vary: "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { status: trusted ? 204 : 403, headers: cors });

  try {
    if (!trusted) throw httpError(403, "Requests only come from Mesh.");
    const uid = await d.verify(req);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const body = req.method === "DELETE" && !req.headers.get("Content-Length") ? {} : await req.json().catch(() => ({}));
    const route = `${req.method} ${url.pathname}`;
    let result;
    if (route === "POST /devices") result = await addDevice(d, uid, body);
    else if (route === "PATCH /devices") result = await updateDevice(d, uid, body);
    else if (route === "DELETE /devices") result = await removeDevice(d, uid, body);
    else if (route === "DELETE /me") { await d.store.deleteUser(uid); result = { ok: true }; }
    else if (route === "POST /notify") result = await notify(d, uid, token, body, ctx);
    else if (route === "POST /alerts") result = await addAlert(d, uid, token, body);
    else if (route === "DELETE /alerts") result = await removeAlert(d, uid, body);
    else throw httpError(404, "Not found.");
    return json(result, 200, cors);
  } catch (err) {
    if (!err.status) console.error("mesh-push", err);
    return json({ error: err.status ? err.message : "Something went wrong." }, err.status || 500, cors);
  }
}

// Devices

export async function deviceId(endpoint) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cleanKinds = (kinds) => JSON.stringify([...new Set((Array.isArray(kinds) ? kinds : KINDS).filter((k) => KINDS.includes(k)))]);

async function addDevice(d, uid, { endpoint, keys, kinds, quietUntil }) {
  if (!pushEndpointOk(endpoint)) throw httpError(400, "That isn't a push service Mesh can use.");
  const p256dh = String(keys?.p256dh || "");
  const auth = String(keys?.auth || "");
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw httpError(400, "That subscription is missing its keys.");
  const id = await deviceId(endpoint);
  await d.store.upsertDevice({ id, uid, endpoint, p256dh, auth, kinds: cleanKinds(kinds), quiet_until: Number(quietUntil) || 0 }, d.now());
  return { ok: true };
}

async function ownDevice(d, uid, endpoint) {
  const dev = await d.store.device(await deviceId(String(endpoint || "")));
  if (!dev || dev.uid !== uid) throw httpError(404, "That device isn't registered.");
  return dev;
}

async function updateDevice(d, uid, { endpoint, kinds, quietUntil }) {
  const dev = await ownDevice(d, uid, endpoint);
  await d.store.updateDevice(dev.id, {
    kinds: kinds ? cleanKinds(kinds) : undefined,
    quiet_until: quietUntil == null ? undefined : Math.max(0, Number(quietUntil) || 0),
  }, d.now());
  return { ok: true };
}

async function removeDevice(d, uid, { endpoint }) {
  const dev = await ownDevice(d, uid, endpoint).catch(() => null);
  if (dev) await d.store.deleteDevice(dev.id);
  return { ok: true };
}

// Sending

/** Pushes to every device of each person that wants it; expired subscriptions are removed. */
export async function deliver(d, pushes, opts = {}) {
  let sent = 0;
  for (const p of pushes) {
    for (const dev of await d.store.devicesFor(p.uid)) {
      if (!wants(dev, p.kind, d.now())) continue;
      const result = await d.push(dev, { ...p.payload, kind: p.kind, ts: d.now() }, opts).catch(() => "failed");
      if (result === "gone") await d.store.deleteDevice(dev.id);
      if (result === "sent") sent += 1;
    }
  }
  return sent;
}

const fresh = (d, iso, ms = FRESH_MS) => {
  const at = Date.parse(iso || "");
  return Number.isFinite(at) && d.now() - at < ms && at - d.now() < 60000;
};
const safeId = (s) => /^[A-Za-z0-9_-]{1,128}$/.test(String(s || ""));

async function notify(d, uid, token, body, ctx) {
  const { kind } = body;
  let pushes = [];
  let opts = {};
  let key = "";
  if (kind === "message") {
    if (!safeId(body.chatId) || !safeId(body.messageId)) throw httpError(400, "Bad message.");
    const [chat, msg] = await Promise.all([
      d.firestore(token, `chats/${body.chatId}`),
      d.firestore(token, `chats/${body.chatId}/messages/${body.messageId}`),
    ]);
    if (!chat || !msg || msg.senderId !== uid || !fresh(d, msg.createdAt)) return { sent: 0 };
    // Who follows the chat's starter, so it isn't a request for them (unreadable lists count as no).
    const unsure = (chat.members || []).filter((m) => m !== uid && m !== chat.createdBy && !(chat.acceptedBy || []).includes(m));
    const follows = await Promise.all(unsure.slice(0, 20).map((m) => d.firestore(token, `users/${chat.createdBy}/followers/${m}`)));
    const followers = new Set(unsure.filter((_, i) => follows[i]));
    pushes = messagePushes({ ...chat, id: body.chatId }, msg, uid, followers);
    opts = { urgency: "high", ttl: 86400, topic: `chat${body.chatId}` };
    key = `m:${body.chatId}:${body.messageId}`;
  } else if (kind === "notice") {
    if (!safeId(body.to) || !safeId(body.id)) throw httpError(400, "Bad notice.");
    const notice = await d.firestore(token, `users/${body.to}/notifications/${body.id}`);
    if (!notice || notice.actorId !== uid || !fresh(d, notice.createdAt)) return { sent: 0 };
    const p = noticePush({ ...notice, id: body.id }, body.to);
    pushes = p ? [p] : [];
    key = `n:${body.to}:${body.id}`;
  } else if (kind === "call") {
    if (!safeId(body.callId)) throw httpError(400, "Bad call.");
    const call = await d.firestore(token, `calls/${body.callId}`);
    if (!call || call.callerId !== uid || call.status !== "ringing" || !fresh(d, call.createdAt, 60000)) return { sent: 0 };
    pushes = [callPush({ ...call, id: body.callId })];
    opts = { urgency: "high", ttl: 45 };
    key = `c:${body.callId}`;
  } else if (kind === "roll") {
    // A roll developed early: its reminders go out now.
    if (!safeId(body.rollId)) throw httpError(400, "Bad roll.");
    const roll = await d.firestore(token, `rolls/${body.rollId}`);
    const at = Date.parse(roll?.developAt || "");
    if (!roll || !Number.isFinite(at) || at > d.now() || d.now() - at > 15 * 60000) return { sent: 0 };
    return { sent: await sendAlerts(d, await d.store.alertsFor("rolls", body.rollId)) };
  } else {
    throw httpError(400, "Unknown kind.");
  }
  if (!pushes.length || !(await d.store.markSent(key, d.now()))) return { sent: 0 };
  // Answer straight away; the pushes finish in the background.
  const work = deliver(d, pushes, opts);
  if (ctx?.waitUntil) { ctx.waitUntil(work); return { queued: pushes.length }; }
  return { sent: await work };
}

// Reminders

async function addAlert(d, uid, token, { kind, id }) {
  if (!safeId(id)) throw httpError(400, "Bad reminder.");
  if (kind === "roll") {
    const roll = await d.firestore(token, `rolls/${id}`);
    const at = Date.parse(roll?.developAt || "");
    if (!roll || !(roll.members || []).includes(uid) || !(at > d.now())) return { ok: false };
    await d.store.putAlert({ ...rollAlert({ ...roll, id }, uid), at });
    return { ok: true };
  }
  if (kind === "gathering") {
    const event = await d.firestore(token, `events/${id}`);
    const at = Date.parse(event?.startsAt || "") - REMIND_BEFORE_MS;
    if (!event || !(at > d.now())) return { ok: false };
    await d.store.putAlert({ ...gatheringAlert({ ...event, id }, uid), at });
    return { ok: true };
  }
  throw httpError(400, "Unknown reminder.");
}

async function removeAlert(d, uid, { kind, id }) {
  if (!safeId(id) || !["roll", "gathering"].includes(kind)) throw httpError(400, "Bad reminder.");
  await d.store.deleteAlert(`${kind}:${id}:${uid}`);
  return { ok: true };
}

async function sendAlerts(d, alerts) {
  let sent = 0;
  for (const a of alerts) {
    await d.store.deleteAlert(a.id);
    sent += await deliver(d, [{ uid: a.uid, kind: a.kind, payload: { title: a.title, body: a.body, url: a.url, tag: a.id } }], { urgency: "high", ttl: 6 * 3600 });
  }
  return sent;
}

/** Every minute: reminders that are due, then tidying. */
export async function runDue(env, d) {
  await sendAlerts(d, await d.store.dueAlerts(d.now()));
  await d.store.pruneSent(d.now() - 2 * 86400000);
}

// Firestore REST, as the signed-in person, so the security rules decide.

async function firestoreGet(env, token, path) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return plain({ mapValue: { fields: (await res.json()).fields || {} } });
}

/** Firestore's typed JSON to plain values. */
export function plain(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  return null;
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
