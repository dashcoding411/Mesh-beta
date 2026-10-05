// Web Push, with nothing but the Workers' WebCrypto: VAPID signing (RFC 8292)
// and end-to-end encrypted payloads (RFC 8291, aes128gcm). The browser's
// push service (Google, Apple, Mozilla) carries the message but can't read it.

const enc = new TextEncoder();

export const b64url = {
  encode(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(str) {
    const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// HKDF with a single output block, which is all Web Push needs.
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** A P-256 key pair for ECDH from its raw parts (used by tests and fixed keys). */
export async function importEcdhKeys(publicRaw, privateRaw) {
  const jwk = {
    kty: "EC", crv: "P-256", ext: true,
    x: b64url.encode(publicRaw.slice(1, 33)), y: b64url.encode(publicRaw.slice(33, 65)), d: b64url.encode(privateRaw),
  };
  return { privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), publicRaw };
}

/**
 * Encrypts `plaintext` (bytes) for a subscription's keys. `local` (an ECDH
 * key pair) and `salt` are random unless given, for testing against the RFC.
 * Returns the full aes128gcm body: salt, record size, sender key, ciphertext.
 */
export async function encryptPayload(plaintext, { p256dh, auth }, { local, salt } = {}) {
  const uaPublic = typeof p256dh === "string" ? b64url.decode(p256dh) : p256dh;
  const authSecret = typeof auth === "string" ? b64url.decode(auth) : auth;
  const keys = local || await (async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    return { privateKey: pair.privateKey, publicRaw: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
  })();
  const s = salt || crypto.getRandomValues(new Uint8Array(16));

  const peer = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, keys.privateKey, 256));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, keys.publicRaw);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(s, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(s, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One record: the message, then the 0x02 "last record" delimiter.
  const padded = concat(plaintext, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, padded));

  const header = new Uint8Array(21 + keys.publicRaw.length);
  header.set(s, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = keys.publicRaw.length;
  header.set(keys.publicRaw, 21);
  return concat(header, cipher);
}

/** The Authorization header for a push service, signed with the VAPID key. */
export async function vapidAuth(endpoint, { publicKey, privateJwk, subject }, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url.encode(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url.encode(sig)}, k=${publicKey}`;
}

/**
 * Sends one notification. Returns "sent", "gone" (the subscription has
 * expired and should be deleted) or "failed".
 */
export async function sendPush(device, payload, vapid, { ttl = 3600, urgency = "normal", topic } = {}) {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), { p256dh: device.p256dh, auth: device.auth });
  const headers = {
    Authorization: await vapidAuth(device.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(ttl),
    Urgency: urgency,
  };
  // Topics collapse waiting notifications of the same kind (32 safe characters at most).
  if (topic) headers.Topic = topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const res = await fetch(device.endpoint, { method: "POST", headers, body });
  if (res.status === 404 || res.status === 410) return "gone";
  return res.ok ? "sent" : "failed";
}
