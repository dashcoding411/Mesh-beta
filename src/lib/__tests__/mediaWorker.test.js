// The Cloudflare media Worker, run against an in-memory R2 bucket and tokens
// signed with a local key standing in for Google's.
import { beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../../cloudflare/media/src/worker.js";

const PROJECT = "mesh-a293c";
const UID = "Xk83OAP9VkVgHTmJSZsdxbioI9a2";
const ORIGIN = "https://joinmesh.social";
const BASE = "https://mesh-media.example.workers.dev";

let privateKey;
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

async function token(claims = {}, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid }));
  const body = b64url(JSON.stringify({
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: UID, iat: now - 10, exp: now + 3600, ...claims,
  }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
}

function bucket() {
  const files = new Map();
  return {
    files,
    async put(key, body, opts) { files.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), opts }); },
    async list({ prefix }) { return { objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(keys) { for (const k of [].concat(keys)) files.delete(k); },
    async get(key, { range } = {}) {
      const f = files.get(key);
      if (!f) return null;
      let r;
      const m = range?.get?.("Range")?.match(/bytes=(\d+)-(\d*)/);
      // Like R2: every key present, the unused ones undefined.
      if (m) r = { offset: Number(m[1]), length: m[2] ? Number(m[2]) - Number(m[1]) + 1 : undefined, suffix: undefined };
      const s = range?.get?.("Range")?.match(/bytes=-(\d+)/);
      if (s) r = { offset: undefined, length: undefined, suffix: Number(s[1]) };
      const start = r ? (r.suffix != null ? f.bytes.length - r.suffix : r.offset) : 0;
      const bytes = r ? f.bytes.slice(start, r.length != null ? start + r.length : undefined) : f.bytes;
      return {
        size: f.bytes.length, range: r, httpEtag: '"e"', body: new Blob([bytes]).stream(),
        writeHttpMetadata: (h) => h.set("Content-Type", f.opts.httpMetadata.contentType),
      };
    },
  };
}

const env = () => ({ FIREBASE_PROJECT: PROJECT, ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`, MEDIA: bucket() });

const put = async (e, { auth, type = "video/mp4", body = new Uint8Array([1, 2, 3, 4, 5, 6]), origin = ORIGIN } = {}) =>
  worker.fetch(new Request(`${BASE}/upload`, {
    method: "PUT", body,
    headers: { Origin: origin, "Content-Type": type, "Content-Length": String(body.length), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  }), e);

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Cache-Control": "max-age=600" } }));
});

describe("media worker", () => {
  it("stores a signed-in upload under the uploader's uid", async () => {
    const e = env();
    const res = await put(e, { auth: await token() });
    expect(res.status).toBe(200);
    const { url, path } = await res.json();
    expect(path).toMatch(new RegExp(`^v/${UID}/[a-f0-9]{32}\\.mp4$`));
    expect(url).toBe(`${BASE}/${path}`);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(e.MEDIA.files.get(path).opts.customMetadata.uid).toBe(UID);
  });

  it("turns away missing, forged, expired and other-project tokens", async () => {
    const e = env();
    expect((await put(e)).status).toBe(401);
    const good = await token();
    const forged = good.slice(0, good.lastIndexOf(".") + 1) + "AAAA";
    expect((await put(e, { auth: forged })).status).toBe(401);
    expect((await put(e, { auth: await token({ exp: Math.floor(Date.now() / 1000) - 5 }) })).status).toBe(401);
    expect((await put(e, { auth: await token({ aud: "someone-else" }) })).status).toBe(401);
    expect((await put(e, { auth: await token({}, "unknown-kid") })).status).toBe(401);
    expect(e.MEDIA.files.size).toBe(0);
  });

  it("only takes uploads from Mesh, in allowed formats", async () => {
    const e = env();
    const auth = await token();
    expect((await put(e, { auth, origin: "https://evil.example" })).status).toBe(403);
    expect((await put(e, { auth, type: "text/html" })).status).toBe(415);
    expect((await put(e, { auth, type: "image/svg+xml" })).status).toBe(415);
  });

  it("serves byte ranges so videos can seek", async () => {
    const e = env();
    const { path } = await (await put(e, { auth: await token() })).json();
    const full = await worker.fetch(new Request(`${BASE}/${path}`), e);
    expect(full.status).toBe(200);
    expect(full.headers.get("Content-Type")).toBe("video/mp4");
    expect(full.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const part = await worker.fetch(new Request(`${BASE}/${path}`, { headers: { Range: "bytes=2-3" } }), e);
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 2-3/6");
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([3, 4]);
    const open = await worker.fetch(new Request(`${BASE}/${path}`, { headers: { Range: "bytes=4-" } }), e);
    expect(open.headers.get("Content-Range")).toBe("bytes 4-5/6");
    expect(open.headers.get("Content-Length")).toBe("2");
    const tail = await worker.fetch(new Request(`${BASE}/${path}`, { headers: { Range: "bytes=-2" } }), e);
    expect(tail.headers.get("Content-Range")).toBe("bytes 4-5/6");
    expect([...new Uint8Array(await tail.arrayBuffer())]).toEqual([5, 6]);
  });

  it("lets only the owner delete", async () => {
    const e = env();
    const { path } = await (await put(e, { auth: await token() })).json();
    const del = async (auth) => worker.fetch(new Request(`${BASE}/${path}`, { method: "DELETE", headers: { Origin: ORIGIN, Authorization: `Bearer ${auth}` } }), e);
    expect((await del(await token({ sub: "SomeoneElse0000000000000000a" }))).status).toBe(403);
    expect(e.MEDIA.files.has(path)).toBe(true);
    expect((await del(await token())).status).toBe(200);
    expect(e.MEDIA.files.has(path)).toBe(false);
  });

  it("deletes all of an account's files, and only for that account", async () => {
    const e = env();
    const auth = await token();
    await put(e, { auth }); await put(e, { auth });
    const delAll = async (uid, a) => worker.fetch(new Request(`${BASE}/v/${uid}`, { method: "DELETE", headers: { Origin: ORIGIN, Authorization: `Bearer ${a}` } }), e);
    expect((await delAll("SomeoneElse0000000000000000a", auth)).status).toBe(403);
    expect(e.MEDIA.files.size).toBe(2);
    const res = await delAll(UID, auth);
    expect((await res.json()).removed).toBe(2);
    expect(e.MEDIA.files.size).toBe(0);
  });

  it("404s anything outside the media paths", async () => {
    const e = env();
    expect((await worker.fetch(new Request(`${BASE}/v/../secret`), e)).status).toBe(404);
    expect((await worker.fetch(new Request(`${BASE}/`), e)).status).toBe(404);
  });
});

describe("roll photos", () => {
  const putRoll = async (e, { auth, type = "image/jpeg", body = new Uint8Array([255, 216, 255, 1]) } = {}) =>
    worker.fetch(new Request(`${BASE}/upload?kind=roll`, {
      method: "PUT", body,
      headers: { Origin: ORIGIN, "Content-Type": type, "Content-Length": String(body.length), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    }), e);

  it("keeps roll photos under r/, JPEG only, and deletes them with the account", async () => {
    const e = env();
    const t = await token();
    const res = await putRoll(e, { auth: t });
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(new RegExp(`^${BASE}/r/${UID}/[a-f0-9]{32}\\.jpg$`));
    expect((await putRoll(e, { auth: t, type: "video/mp4" })).status).toBe(415);
    const got = await worker.fetch(new Request(url), e);
    expect(got.status).toBe(200);
    expect(got.headers.get("Content-Type")).toBe("image/jpeg");

    await put(e, { auth: t });
    const wipe = await worker.fetch(new Request(`${BASE}/v/${UID}`, { method: "DELETE", headers: { Origin: ORIGIN, Authorization: `Bearer ${t}` } }), e);
    expect((await wipe.json()).removed).toBe(2);
    expect(e.MEDIA.files.size).toBe(0);
  });
});

describe("post and story photos", () => {
  const putPhoto = async (e, { auth, type = "image/webp", kind = "photo", body = new Uint8Array([82, 73, 70, 70]) } = {}) =>
    worker.fetch(new Request(`${BASE}/upload?kind=${kind}`, {
      method: "PUT", body,
      headers: { Origin: ORIGIN, "Content-Type": type, "Content-Length": String(body.length), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    }), e);

  it("keeps photos under p/, JPEG or WebP only, servable, and deletes them with the account", async () => {
    const e = env();
    const t = await token();
    const webp = await putPhoto(e, { auth: t });
    expect(webp.status).toBe(200);
    const { url } = await webp.json();
    expect(url).toMatch(new RegExp(`^${BASE}/p/${UID}/[a-f0-9]{32}\\.webp$`));
    expect((await putPhoto(e, { auth: t, type: "image/jpeg" })).status).toBe(200);
    expect((await putPhoto(e, { auth: t, type: "image/png" })).status).toBe(415);
    expect((await putPhoto(e, { auth: t, type: "video/mp4" })).status).toBe(415);
    const got = await worker.fetch(new Request(url), e);
    expect(got.status).toBe(200);
    expect(got.headers.get("Content-Type")).toBe("image/webp");

    const wipe = await worker.fetch(new Request(`${BASE}/v/${UID}`, { method: "DELETE", headers: { Origin: ORIGIN, Authorization: `Bearer ${t}` } }), e);
    expect((await wipe.json()).removed).toBe(2);
    expect(e.MEDIA.files.size).toBe(0);
  });

  it("refuses a photo that's too big, and an unknown kind", async () => {
    const e = env();
    const t = await token();
    const big = await worker.fetch(new Request(`${BASE}/upload?kind=photo`, {
      method: "PUT", body: new Uint8Array([1]),
      headers: { Origin: ORIGIN, "Content-Type": "image/jpeg", "Content-Length": String(7 * 1024 * 1024), Authorization: `Bearer ${t}` },
    }), e);
    expect(big.status).toBe(413);
    expect((await putPhoto(e, { auth: t, kind: "anything" })).status).toBe(400);
  });
});
