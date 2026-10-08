// Mesh media on Cloudflare: signed-in people upload videos (and their poster
// frames) to R2; anyone with the link can watch, with seeking. Roll photos
// (?kind=roll) are JPEGs kept under r/, and post and story photos
// (?kind=photo) JPEGs or WebPs under p/, each with their own allowance. Uploads are
// checked against the uploader's Firebase ID token, so files always live under
// the uploader's own uid and only they can delete them.

// The Workers free plan caps a request body at 100 MB.
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_PERSON = 60;
// Roll photos: 27 a roll, so about 22 full rolls each, at up to 12 MB a photo.
const MAX_ROLL_PHOTOS = 600;
const MAX_ROLL_BYTES = 12 * 1024 * 1024;
// Post and story photos: prepared on the device at up to 2048 px (about 1 MB).
// The allowance is checked with one R2 listing, which returns 1,000 at most.
const MAX_PHOTOS = 1000;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/webp": "webp" };
const TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const FILE = /^\/(v|r|p)\/([A-Za-z0-9]{20,40})\/([a-f0-9]{32}\.(?:mp4|webm|mov|jpg|webp))$/;
const PREFIXES = ["v", "r", "p"];
// What each ?kind= may be: its folder, file types, size and allowance.
const KINDS = {
  "": { prefix: "v", types: TYPES, maxBytes: MAX_BYTES, allowance: MAX_FILES_PER_PERSON,
    wrongType: "Use an MP4, WebM or MOV video.", tooBig: "Videos can be up to 100 MB for now.",
    full: "You've reached the test upload limit. Delete an old video to add another." },
  roll: { prefix: "r", types: { "image/jpeg": "jpg" }, maxBytes: MAX_ROLL_BYTES, allowance: MAX_ROLL_PHOTOS,
    wrongType: "Roll photos are JPEGs.", tooBig: "That photo is too big.",
    full: "You've used all your roll photos for now. Delete an old roll to shoot more." },
  photo: { prefix: "p", types: PHOTO_TYPES, maxBytes: MAX_PHOTO_BYTES, allowance: MAX_PHOTOS,
    wrongType: "Photos are JPEGs or WebPs.", tooBig: "That photo is too big.",
    full: "You've reached the photo limit for now. Delete some old posts to add more." },
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const trusted = env.ALLOWED_ORIGINS.split(",").includes(origin);
    const cors = trusted ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, HEAD, PUT, DELETE, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    } : { Vary: "Origin" };

    if (req.method === "OPTIONS") return new Response(null, { status: trusted ? 204 : 403, headers: cors });

    try {
      if (url.pathname === "/upload" && req.method === "PUT") {
        if (!trusted) throw httpError(403, "Uploads only come from Mesh.");
        return json(await upload(req, env), 200, cors);
      }
      // Account deletion: every file under the caller's own uid.
      const everything = url.pathname.match(/^\/v\/([A-Za-z0-9]{20,40})$/);
      if (everything && req.method === "DELETE") {
        if (!trusted) throw httpError(403, "Deletes only come from Mesh.");
        const uid = await verifyToken(req, env);
        if (uid !== everything[1]) throw httpError(403, "Those files aren't yours.");
        let removed = 0;
        for (const prefix of PREFIXES) {
          for (;;) {
            const page = await env.MEDIA.list({ prefix: `${prefix}/${uid}/`, limit: 1000 });
            if (!page.objects.length) break;
            await env.MEDIA.delete(page.objects.map((o) => o.key));
            removed += page.objects.length;
            if (!page.truncated) break;
          }
        }
        return json({ ok: true, removed }, 200, cors);
      }
      const file = url.pathname.match(FILE);
      if (file && (req.method === "GET" || req.method === "HEAD")) return serve(req, env, `${file[1]}/${file[2]}/${file[3]}`);
      if (file && req.method === "DELETE") {
        if (!trusted) throw httpError(403, "Deletes only come from Mesh.");
        const uid = await verifyToken(req, env);
        if (uid !== file[2]) throw httpError(403, "That file isn't yours.");
        await env.MEDIA.delete(`${file[1]}/${file[2]}/${file[3]}`);
        return json({ ok: true }, 200, cors);
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ error: err.status ? err.message : "Something went wrong." }, err.status || 500, cors);
    }
  },
};

async function upload(req, env) {
  const uid = await verifyToken(req, env);
  const kind = KINDS[new URL(req.url).searchParams.get("kind") || ""];
  if (!kind) throw httpError(400, "Unknown upload kind.");
  const type = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = kind.types[type];
  if (!ext) throw httpError(415, kind.wrongType);
  const size = Number(req.headers.get("Content-Length") || 0);
  if (!size) throw httpError(411, "The upload was empty.");
  if (size > kind.maxBytes) throw httpError(413, kind.tooBig);

  const { prefix, allowance } = kind;
  const mine = await env.MEDIA.list({ prefix: `${prefix}/${uid}/`, limit: allowance });
  if (mine.objects.length >= allowance) throw httpError(429, kind.full);

  const key = `${prefix}/${uid}/${crypto.randomUUID().replaceAll("-", "")}.${ext}`;
  await env.MEDIA.put(key, req.body, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { uid },
  });
  return { url: `${new URL(req.url).origin}/${key}`, path: key };
}

// Streams a file, honouring Range so videos can seek.
async function serve(req, env, key) {
  const wantsRange = req.headers.has("Range");
  const obj = await env.MEDIA.get(key, wantsRange ? { range: req.headers } : {});
  if (!obj) return new Response("Not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, ETag");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

  let status = 200;
  if (wantsRange && obj.range) {
    // R2 fills in either offset/length or suffix; the others are undefined.
    const { offset: from, length: count, suffix } = obj.range;
    const length = suffix != null ? Math.min(suffix, obj.size) : count ?? obj.size - (from ?? 0);
    const offset = suffix != null ? obj.size - length : from ?? 0;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    status = 206;
  } else {
    headers.set("Content-Length", String(obj.size));
  }
  return new Response(req.method === "HEAD" ? null : obj.body, { status, headers });
}

// Firebase ID tokens are RS256 JWTs signed with Google's rotating keys.
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks = null;
let jwksUntil = 0;
let jwksAt = 0;

async function signingKeys(force = false) {
  if (!force && jwks && Date.now() < jwksUntil) return jwks;
  const res = await fetch(JWKS_URL);
  const maxAge = Number((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  jwks = (await res.json()).keys;
  jwksAt = Date.now();
  jwksUntil = jwksAt + maxAge * 1000;
  return jwks;
}

// Google rotates its keys, so an unknown key id means fetching them again,
// at most once a minute (made-up ids can't make us fetch on every request).
async function keyFor(kid) {
  const known = (await signingKeys()).find((k) => k.kid === kid);
  if (known || Date.now() - jwksAt < 60_000) return known;
  return (await signingKeys(true)).find((k) => k.kid === kid);
}

const fromB64url = (s) => Uint8Array.from(
  atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)),
  (c) => c.charCodeAt(0),
);
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(fromB64url(s)));

async function verifyToken(req, env) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const [h, p, sig] = token.split(".");
  if (!sig) throw httpError(401, "Sign in to upload.");
  let header, claims;
  try { header = decodeJson(h); claims = decodeJson(p); } catch { throw httpError(401, "Sign in again to upload."); }

  const jwk = header.alg === "RS256" && (await keyFor(header.kid));
  if (!jwk) throw httpError(401, "Sign in again to upload.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`));

  const now = Date.now() / 1000;
  if (!valid
    || claims.aud !== env.FIREBASE_PROJECT
    || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT}`
    || !(claims.exp > now) || !(claims.iat < now + 300)
    || typeof claims.sub !== "string" || !/^[A-Za-z0-9]{20,40}$/.test(claims.sub)) {
    throw httpError(401, "Sign in again to upload.");
  }
  return claims.sub;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
