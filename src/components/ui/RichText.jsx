import { Fragment } from "react";
import { navigate } from "../../lib/router";
import { openUserProfile, uidForUsername } from "../../lib/db";
import { followLink } from "../../lib/links";

// URLs (with http(s):// or www.), #tags and @handles. Nothing else is
// interpreted, no HTML, no markdown. The lookbehinds stop "me@example.com"
// reading as a handle and "&#39;" as a tag.
const TOKEN = /((?:https?:\/\/|(?<![\p{L}\p{N}_.@/])www\.)[^\s<]+[^\s<.,:;"')\]!?])|((?<![\p{L}\p{N}_&])#[\p{L}\p{N}_]{2,50})|((?<![\p{L}\p{N}_.])@[a-z0-9_]{3,30})/giu;
const hrefOf = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

function tokenize(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1]) parts.push({ t: "url", v: m[1] });
    else if (m[2]) parts.push({ t: "tag", v: m[2] });
    else parts.push({ t: "handle", v: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });
  return parts;
}

const shortLabel = (u) => {
  let label = u.replace(/^https?:\/\/(www\.)?/i, "").replace(/^www\./i, "");
  return label.length > 36 ? `${label.slice(0, 34)}…` : label;
};

/* A message's words with its web addresses made into links, which open
   through the "you're leaving Mesh" step. Inline, and underlined in the
   bubble's own colour, so they read on any chat theme. */
export function LinkedText({ text, className = "" }) {
  if (!text) return null;
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {tokenize(text).map((p, i) => (p.t === "url" ? (
        <a key={i} href={hrefOf(p.v)} target="_blank" rel="ugc nofollow noopener noreferrer"
          onClick={(e) => followLink(hrefOf(p.v), e)}
          className="font-semibold underline decoration-2 underline-offset-2">
          {shortLabel(p.v)}
        </a>
      ) : <Fragment key={i}>{p.v}</Fragment>))}
    </span>
  );
}

/* Post text with its links made real. A #tag opens Search, so it's a way in
   to everything else carrying it. An @handle opens that person's profile, or
   Search if nobody has the handle (any more). Outbound links are marked
   rel="ugc nofollow noopener", user-generated, not endorsed by us, and
   unable to reach back into this tab. Only http(s) is ever linked. */
export default function RichText({ text, className = "", highlight }) {
  if (!text) return null;
  const parts = tokenize(text);

  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) => {
        if (p.t === "text") return <Fragment key={i}>{highlight ? <Highlight text={p.v} query={highlight} /> : p.v}</Fragment>;
        if (p.t === "url") {
          return (
            <a key={i} href={hrefOf(p.v)} target="_blank" rel="ugc nofollow noopener noreferrer" onClick={(e) => followLink(hrefOf(p.v), e)}
              className="text-accent-text underline-offset-2 hover:underline">
              {shortLabel(p.v)}
            </a>
          );
        }
        const q = p.v;
        const search = () => navigate(`/search?q=${encodeURIComponent(q)}`);
        const open = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (p.t === "tag") return search();
          const uid = await uidForUsername(q).catch(() => null);
          if (uid) openUserProfile(uid); else search();
        };
        return (
          <a key={i} href={`/search?q=${encodeURIComponent(q)}`} onClick={open}
            className="text-accent-text hover:underline underline-offset-2">
            {q}
          </a>
        );
      })}
    </p>
  );
}

/** Bold the parts of `text` that match the words in `query`, used in search results. */
export function Highlight({ text, query }) {
  const words = String(query || "").toLowerCase().split(/\s+/).map((w) => w.replace(/^[#@]/, "")).filter((w) => w.length >= 2);
  if (!words.length || !text) return text || null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return String(text).split(re).map((chunk, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded-sm bg-accent-soft px-0.5 font-semibold text-fg">{chunk}</mark> : chunk
  );
}
