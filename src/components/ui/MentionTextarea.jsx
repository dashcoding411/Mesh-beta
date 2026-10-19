import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { fetchProfiles, searchNames, searchUsers, me } from "../../lib/db";
import { useShell } from "../shell/ShellContext";
import { Textarea } from "./Field";
import Avatar from "./Avatar";
import { VerifiedTick } from "./Badges";
import { tickOf } from "../../lib/badges";

// The people you follow, read once per session the first time you type @
// (up to 300), so they can be offered first.
let followedCache = { key: "", list: null };
async function followedPeople(following) {
  const ids = [...(following || [])].slice(0, 300);
  const key = ids.join(",");
  if (followedCache.key !== key || !followedCache.list) {
    followedCache = { key, list: fetchProfiles(ids).then((m) => [...m.values()]).catch(() => []) };
  }
  return followedCache.list;
}

const startsWith = (p, q) => p.username?.startsWith(q) || (p.name || "").toLowerCase().startsWith(q)
  || (p.name || "").toLowerCase().split(/\s+/).some((w) => w.startsWith(q));

// The @handle being typed just before the caret, if any.
function mentionAt(text, caret) {
  const m = text.slice(0, caret).match(/(?:^|[^\p{L}\p{N}_.])@([a-z0-9_]{0,30})$/iu);
  return m ? { query: m[1].toLowerCase(), start: caret - m[1].length - 1, end: caret } : null;
}

/**
 * A Textarea that suggests people while you type @, like other apps: people
 * you follow first (just "@" lists them), then `suggest` (the post's author,
 * others in the thread), then everyone else by handle or name. Arrow keys
 * move, Enter or Tab picks, Escape closes; picking writes "@handle ".
 */
const MentionTextarea = forwardRef(function MentionTextarea(
  { value, onChange, onKeyDown, suggest = [], wrapperClassName = "", ...rest }, ref,
) {
  const inner = useRef(null);
  const setRef = (el) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  const [mention, setMention] = useState(null);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [closedAt, setClosedAt] = useState(null);
  const listId = useId();
  const following = useShell()?.following;

  const sync = () => {
    const el = inner.current;
    if (el) setMention(mentionAt(el.value, el.selectionStart ?? el.value.length));
  };

  const query = mention?.query;
  useEffect(() => {
    if (query === undefined) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      const seen = new Set([me()]);
      const take = (p) => p?.username && !seen.has(p.id) && seen.add(p.id);
      const followed = (await followedPeople(following))
        .filter((p) => !query || startsWith(p, query))
        .sort((a, b) => (a.username.startsWith(query) ? 0 : 1) - (b.username.startsWith(query) ? 0 : 1) || a.username.localeCompare(b.username))
        .filter(take);
      const local = suggest.filter((p) => p?.username && (!query || startsWith(p, query))).filter(take);
      const [byHandle, byName] = query ? await Promise.all([
        searchUsers(query).catch(() => []),
        query.length >= 2 ? searchNames(query, 6).catch(() => []) : [],
      ]) : [[], []];
      // Among everyone else, people you follow (missed above) still go first.
      const rest = [...byHandle, ...byName].sort((a, b) => (following?.has(b.id) ? 1 : 0) - (following?.has(a.id) ? 1 : 0)).filter(take);
      if (live) { setResults([...followed, ...local, ...rest].slice(0, 6)); setActive(0); }
    }, query ? 150 : 0);
    return () => { live = false; clearTimeout(t); };
    // `suggest` is usually rebuilt each render; the query is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const open = !!mention && results.length > 0 && closedAt !== mention.start;

  const pick = (person) => {
    const insert = `@${person.username} `;
    const next = value.slice(0, mention.start) + insert + value.slice(mention.end);
    onChange?.({ target: { value: next } });
    setMention(null);
    const caret = mention.start + insert.length;
    setTimeout(() => { inner.current?.focus(); inner.current?.setSelectionRange(caret, caret); }, 0);
  };

  const keyDown = (e) => {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(results[active]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setClosedAt(mention.start); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <Textarea ref={setRef} value={value} {...rest}
        onChange={(e) => {
          onChange?.(e);
          const el = e.target;
          setMention(mentionAt(el.value, el.selectionStart ?? el.value.length));
        }}
        onKeyDown={keyDown} onKeyUp={(e) => { if (/^Arrow(Left|Right)$|^(Home|End)$/.test(e.key)) sync(); }}
        onClick={sync} onBlur={() => setTimeout(() => setMention(null), 150)}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined} />
      <span className="sr-only" aria-live="polite">
        {open ? `${results.length} ${results.length === 1 ? "person" : "people"} found. Use the up and down arrows, then Enter to pick.` : ""}
      </span>
      {open && (
        <ul id={listId} role="listbox" aria-label="People to mention"
          className="absolute inset-x-0 bottom-full z-sheet mb-1.5 max-h-72 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-overlay anim-rise">
          {results.map((p, i) => (
            <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} onMouseEnter={() => setActive(i)}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-2.5 ${i === active ? "bg-surface-2" : ""}`}>
              <Avatar profile={p} size={32} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-callout font-semibold text-fg">
                  <span className="truncate">{p.name || p.username}</span>
                  {tickOf(p.badges) && <VerifiedTick size={13} pink={tickOf(p.badges) === "pink"} />}
                </span>
                <span className="block truncate text-caption text-fg-subtle">@{p.username}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default MentionTextarea;
