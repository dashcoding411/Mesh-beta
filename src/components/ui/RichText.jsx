import { Fragment } from "react";
import { navigate } from "../../lib/router";
import { openUserProfile, uidForUsername } from "../../lib/db";
import { followLink } from "../../lib/links";

// URLs (http(s) or www.), #tags and @handles only; no HTML or markdown.
// Lookbehinds keep emails from matching as handles and entities as tags.
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

// Chat text with links only (no tags/handles), styled for any bubble colour.
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

// Tags link to Search; handles to the profile (or Search if unknown).
// External links go through the leave-Mesh dialog with rel="ugc nofollow noopener".
export default function RichText({ text, className = "", highlight, as: Tag = "p" }) {
  if (!text) return null;
  const parts = tokenize(text);

  return (
    <Tag className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) => {
        if (p.t === "text") return <Fragment key={i}>{highlight ? <Highlight text={p.v} query={highlight} /> : p.v}</Fragment>;
        if (p.t === "url") {
          return (
            <a key={i} href={hrefOf(p.v)} target="_blank" rel="ugc nofollow noopener noreferrer" onClick={(e) => followLink(hrefOf(p.v), e)}
              className="text-accent-text underline decoration-accent-text/50 underline-offset-2 hover:decoration-current">
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
            className="text-accent-text underline decoration-accent-text/50 underline-offset-2 hover:decoration-current">
            {q}
          </a>
        );
      })}
    </Tag>
  );
}

/** Bolds `query` terms in `text`. */
export function Highlight({ text, query }) {
  const words = String(query || "").toLowerCase().split(/\s+/).map((w) => w.replace(/^[#@]/, "")).filter((w) => w.length >= 2);
  if (!words.length || !text) return text || null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return String(text).split(re).map((chunk, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded-sm bg-accent-soft px-0.5 font-semibold text-fg">{chunk}</mark> : chunk
  );
}
