// Firebase sign-in, checked the same way as the media Worker: an RS256 ID
// token signed by Google for this project.

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

export async function verifyToken(req, env) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const [h, p, sig] = token.split(".");
  if (!sig) throw httpError(401, "Sign in first.");
  let header, claims;
  try { header = decodeJson(h); claims = decodeJson(p); } catch { throw httpError(401, "Sign in again."); }

  const jwk = header.alg === "RS256" && (await keyFor(header.kid));
  if (!jwk) throw httpError(401, "Sign in again.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`));

  const now = Date.now() / 1000;
  if (!valid
    || claims.aud !== env.FIREBASE_PROJECT
    || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT}`
    || !(claims.exp > now) || !(claims.iat < now + 300)
    || typeof claims.sub !== "string" || !/^[A-Za-z0-9]{20,40}$/.test(claims.sub)) {
    throw httpError(401, "Sign in again.");
  }
  return claims.sub;
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
