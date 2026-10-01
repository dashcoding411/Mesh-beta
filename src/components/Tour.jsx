import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { setTourDone, tsMillis } from "../lib/db";
import { motionReduced } from "../lib/appearance";
import { TOUR_EVENT } from "../lib/tour";
import Button from "./ui/Button";

// New accounts from this date see the tour once by themselves; anyone can
// replay it from Settings.
const TOUR_SINCE = Date.parse("2026-10-02T00:00:00+10:00");
const doneKey = (uid) => `mesh:tour-done:${uid || "guest"}`;

// Each step spotlights the first visible element marked data-tour="<key>"
// (phones and computers mark different ones). Steps with nothing to point at
// are left out, except those without targets, which sit in the middle.
const MEMBER_STEPS = [
  { title: "Welcome to Mesh", body: "Here's a quick look at where everything is. It takes about 30 seconds." },
  { targets: ["feed-tabs"], title: "Your feed",
    body: "For you shows everyone's posts, newest first. Following shows only people you follow. Your interests sit alongside to narrow it down." },
  { targets: ["stories"], title: "Stories",
    body: "Photos and videos that last 24 hours. Tap the + on your picture to add one with the camera." },
  { targets: ["create"], title: "Create",
    body: "Post a Still (photos), a Flick (video) or a Strand (words), and choose who can see it." },
  { targets: ["sections", "nav-flicks"], title: "Flicks, News and Circles",
    body: {
      sections: "This menu has Flicks, News, Circles and the rest. Flicks is video with limits you set, News is written by verified journalists, and Circles are communities.",
      "nav-flicks": "Flicks is short and long video with limits you set. Below it, News is written by verified journalists, and Circles are communities.",
    } },
  { targets: ["search", "nav-search"], title: "Search", body: "Find people, posts, circles and news." },
  { targets: ["notifications", "nav-notifications"], title: "Notifications",
    body: "Likes, comments, follows and replies. New ones also drop in briefly at the top of the screen." },
  { targets: ["tab-messages", "nav-messages"], title: "Messages",
    body: "Chats, groups, voice notes and calls. Messages from people you don't follow wait in Requests until you accept." },
  { targets: ["tab-account", "profile"], title: "Your profile",
    body: "Your posts, reposts and saved posts, and how others see you. Settings are here too." },
  { targets: ["more", "sections"], title: "Brick mode",
    body: {
      more: "Brick mode, Saved, the Leaderboard and Settings are under More. Brick mode sets daily limits or locks parts of Mesh for a while.",
      sections: "Brick mode is in this menu too. It sets daily limits or locks parts of Mesh for a while. Mesh is made to be put down.",
    } },
  { title: "You're all set", body: "Replay this tour any time from Settings." },
];

const GUEST_STEPS = [
  { title: "Welcome to Mesh", body: "Have a look around. Here's where everything is." },
  { targets: ["sections", "nav-flicks"], title: "Flicks, News and Circles",
    body: "Video with limits you set, news from verified journalists, and communities. Browsing is free." },
  { targets: ["search", "nav-search", "tab-search"], title: "Search", body: "Find people, posts, circles and news." },
  { targets: ["login"], title: "Make an account", body: "Log in or sign up to post, follow people and message." },
  { title: "Enjoy Mesh", body: "No ads, no data sold, and no endless scroll." },
];

function findTarget(keys = []) {
  for (const key of keys) {
    for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return { el, key };
    }
  }
  return null;
}

/**
 * The first-run tour: spotlights the main controls one at a time. `ready`
 * says the Home feed is showing with nothing else open.
 */
export default function Tour({ ready, uid, guest, profile, prefsDone, onSeen }) {
  const [steps, setSteps] = useState(null);
  const [at, setAt] = useState(0);
  const [pending, setPending] = useState(false);
  const [rect, setRect] = useState(null);
  const [matched, setMatched] = useState(null);
  const cardRef = useRef(null);

  // Replays from Settings.
  useEffect(() => {
    const replay = () => setPending(true);
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);

  // First visit: guests, and accounts made since the tour arrived.
  const eligible = (() => {
    let seen = false;
    try { seen = localStorage.getItem(doneKey(uid)) === "1"; } catch { /* storage blocked */ }
    if (seen) return false;
    if (guest) return true;
    return !!uid && prefsDone === false && tsMillis(profile?.createdAt) >= TOUR_SINCE;
  })();

  useEffect(() => {
    if (steps || !ready || !(pending || eligible)) return undefined;
    // Wait for the feed to render and for any first-run dialog to close.
    const id = setInterval(() => {
      if (document.querySelector("[aria-modal=true]")) return;
      clearInterval(id);
      const list = (guest ? GUEST_STEPS : MEMBER_STEPS).filter((s) => !s.targets || findTarget(s.targets));
      setPending(false);
      setAt(0);
      setSteps(list);
    }, 700);
    return () => clearInterval(id);
  }, [ready, pending, eligible, steps, guest]);

  const finish = useCallback(() => {
    setSteps(null);
    setRect(null);
    try { localStorage.setItem(doneKey(uid), "1"); } catch { /* storage blocked */ }
    if (uid) setTourDone().catch(() => {});
    onSeen?.();
  }, [uid, onSeen]);

  const step = steps?.[at];

  // Measure the current target, and keep measuring as the page moves.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const measure = () => {
      const found = step.targets ? findTarget(step.targets) : null;
      setMatched(found?.key || null);
      if (!found) return setRect(null);
      const r = found.el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const found = step.targets ? findTarget(step.targets) : null;
    found?.el.scrollIntoView({ block: "nearest", behavior: motionReduced() ? "auto" : "smooth" });
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step]);

  useEffect(() => { if (step) cardRef.current?.focus(); }, [step]);

  useEffect(() => {
    if (!steps) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setAt((i) => (i + 1 < steps.length ? i + 1 : i)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [steps, finish]);

  if (!step) return null;

  const last = at === steps.length - 1;
  const body = typeof step.body === "string" ? step.body : step.body[matched] || Object.values(step.body)[0];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  const pad = 6;

  // Beside a narrow target at the left edge (the desktop sidebar), else
  // below it, or above when it sits low on the screen.
  let place;
  if (!rect) place = { left: (vw - cardW) / 2, top: vh / 2, transform: "translateY(-50%)" };
  else if (rect.left + rect.width < vw * 0.3 && rect.height < vh * 0.5 && vw >= 768) {
    place = { left: rect.left + rect.width + pad + 14, top: Math.min(Math.max(16, rect.top + rect.height / 2 - 90), vh - 240) };
  } else {
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16);
    place = rect.top + rect.height / 2 < vh * 0.55
      ? { left, top: rect.top + rect.height + pad + 12 }
      : { left, bottom: vh - rect.top + pad + 12 };
  }
  const moving = motionReduced() ? "" : "transition-all duration-300 ease-out";

  return createPortal(
    <div className="fixed inset-0 z-[65]" role="presentation">
      {rect ? (
        <div aria-hidden="true" className={`pointer-events-none fixed rounded-[14px] ring-2 ring-white/70 ${moving}`}
          style={{
            top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)",
          }} />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/60" />
      )}
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1}
        className={`fixed rounded-card border border-line bg-surface p-4 text-fg shadow-overlay outline-none ${moving}`}
        style={{ width: cardW, ...place }}>
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-label font-semibold uppercase tracking-wider text-accent-text">
            {at + 1} of {steps.length}
          </p>
          <button type="button" onClick={finish} aria-label="Close the tour"
            className="press -m-2 flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-1 text-title-3">{step.title}</h2>
        <p id="tour-body" className="mt-1.5 text-callout text-fg-muted">{body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full ${i === at ? "w-4 bg-accent" : "w-1.5 bg-line-strong"} ${moving}`} />
            ))}
          </div>
          {at === 0 ? (
            <Button size="sm" variant="ghost" onClick={finish}>Skip</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAt(at - 1)}>Back</Button>
          )}
          <Button size="sm" variant="primary" onClick={() => (last ? finish() : setAt(at + 1))}>
            {last ? "Done" : at === 0 ? "Show me" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
