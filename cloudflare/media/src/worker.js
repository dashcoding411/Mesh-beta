// Mesh media on Cloudflare: signed-in people upload videos (and their poster
// frames) to R2; anyone with the link can watch, with seeking. Uploads are
// checked against the uploader's Firebase ID token, so files always live under
// the uploader's own uid and only they can delete them.

// The Workers free plan caps a request body at 100 MB.
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_PERSON = 60;
const TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const FILE = /^\/v\/([A-Za-z0-9]{20,40})\/([a-f0-9]{32}\.(?:mp4|webm|mov|jpg|webp))$/;

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
        for (;;) {
          const page = await env.MEDIA.list({ prefix: `v/${uid}/`, limit: 1000 });
          if (!page.objects.length) break;
          await env.MEDIA.delete(page.objects.map((o) => o.key));
          removed += page.objects.length;
          if (!page.truncated) break;
        }
        return json({ ok: true, removed }, 200, cors);
      }
      const file = url.pathname.match(FILE);
      if (file && (req.method === "GET" || req.method === "HEAD")) return serve(req, env, `v/${file[1]}/${file[2]}`);
      if (file && req.method === "DELETE") {
        if (!trusted) throw httpError(403, "Deletes only come from Mesh.");
        const uid = await verifyToken(req, env);
        if (uid !== file[1]) throw httpError(403, "That file isn't yours.");
        await env.MEDIA.delete(`v/${file[1]}/${file[2]}`);
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
  const type = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw httpError(415, "Use an MP4, WebM or MOV video.");
  const size = Number(req.headers.get("Content-Length") || 0);
  if (!size) throw httpError(411, "The upload was empty.");
  if (size > MAX_BYTES) throw httpError(413, "Videos can be up to 100 MB for now.");

  const mine = await env.MEDIA.list({ prefix: `v/${uid}/`, limit: MAX_FILES_PER_PERSON });
  if (mine.objects.length >= MAX_FILES_PER_PERSON) {
    throw httpError(429, "You've reached the test upload limit. Delete an old video to add another.");
  }

  const key = `v/${uid}/${crypto.randomUUID().replaceAll("-", "")}.${ext}`;
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

async function signingKeys() {
  if (jwks && Date.now() < jwksUntil) return jwks;
  const res = await fetch(JWKS_URL);
  const maxAge = Number((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  jwks = (await res.json()).keys;
  jwksUntil = Date.now() + maxAge * 1000;
  return jwks;
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

  const jwk = header.alg === "RS256" && (await signingKeys()).find((k) => k.kid === header.kid);
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
