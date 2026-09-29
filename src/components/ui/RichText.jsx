import { Fragment } from "react";
import { navigate } from "../../lib/router";
import { openUserProfile, uidForUsername } from "../../lib/db";

// URLs, #tags and @handles. Nothing else is interpreted, no HTML, no markdown.
// The lookbehinds stop "me@example.com" reading as a handle and "&#39;" as a tag.
const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|((?<![\p{L}\p{N}_&])#[\p{L}\p{N}_]{2,50})|((?<![\p{L}\p{N}_.])@[a-z0-9_]{3,30})/giu;

/* Post text with its links made real. A #tag opens Search, so it's a way in
   to everything else carrying it. An @handle opens that person's profile, or
   Search if nobody has the handle (any more). Outbound links are marked
   rel="ugc nofollow noopener", user-generated, not endorsed by us, and
   unable to reach back into this tab. Only http(s) is ever linked. */
export default function RichText({ text, className = "", highlight }) {
  if (!text) return null;
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

  const stop = (e) => e.stopPropagation();

  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) => {
        if (p.t === "text") return <Fragment key={i}>{highlight ? <Highlight text={p.v} query={highlight} /> : p.v}</Fragment>;
        if (p.t === "url") {
          let label = p.v.replace(/^https?:\/\/(www\.)?/, "");
          if (label.length > 36) label = label.slice(0, 34) + "…";
          return (
            <a key={i} href={p.v} target="_blank" rel="ugc nofollow noopener noreferrer" onClick={stop}
              className="text-accent-text underline-offset-2 hover:underline">
              {label}
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
