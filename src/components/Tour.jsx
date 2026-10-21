import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Aperture, BrickWall, Hand, ShieldCheck, X } from "lucide-react";
import { setTourDone, tsMillis } from "../lib/db";
import { motionReduced } from "../lib/appearance";
import { TOUR_EVENT } from "../lib/tour";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";
import { navigate } from "../lib/router";
import { useFocusTrap } from "../lib/useFocusTrap";

// New accounts from this date get the short welcome once. The full tour
// runs only when someone asks for it: from Settings, Help, or "Show me
// around" on the welcome.
const TOUR_SINCE = Date.parse("2026-10-02T00:00:00+10:00");
const doneKey = (uid) => `mesh:tour-done:${uid || "guest"}`;

// What's different about Mesh, for the welcome. Everything else works the
// way people expect from the apps they already use.
const DIFFERENT = [
  { icon: BrickWall, title: "Brick mode", body: "Daily limits that really lock, so you can put your phone down. Change them any time in Brick mode." },
  { icon: Aperture, title: "Rolls", body: "A shared disposable camera for nights out. Nobody sees the photos until they develop at 9am the next day." },
  { icon: ShieldCheck, title: "Made by people", body: "No AI-made pictures or videos. News comes from verified journalists, with their sources." },
  { icon: Hand, title: "Not for sale", body: "Your data is never sold, and ads never follow what you do." },
];

// The full tour. Each step spotlights the first visible element marked
// data-tour="<key>" (phones and computers mark different ones). Steps with
// nothing to point at are left out, except those without targets, which sit
// in the middle. A step with `path` opens that page first; the rest happen
// on Home.
const MEMBER_STEPS = [
  { title: "The full tour", body: "Every part of Mesh, one at a time. It takes about two minutes, and you can stop whenever you like." },
  // Brick mode comes first: Mesh is made to be put down.
  { path: "/account/brick", targets: ["brick-limits"], title: "Your daily limits",
    body: "This is Brick mode. The limit you picked at sign-up lives here. When you hit it, Home or Flicks locks until midnight. Lowering a limit is instant; raising it takes 24 hours." },
  { path: "/account/brick", targets: ["brick-now"], title: "Brick me now",
    body: "Lock Mesh to messages, calls and News for a few hours or days, like exam week. Scheduled times below lock it every week, say before 10am." },
  { targets: ["rolls"], title: "Rolls",
    body: "A shared disposable camera for a night out. Start one, send the link, and everyone gets 27 shots with no previews. It all develops at 9am the next morning." },
  { targets: ["feed-tabs"], title: "Your feed",
    body: "For you shows everyone's posts, newest first. Following shows only people you follow. Your interests sit alongside to narrow it down." },
  { targets: ["stories"], title: "Stories",
    body: "Photos and videos that last 24 hours. Tap the + on your picture, or swipe left anywhere on Home, to open the camera. It scans Mesh QR codes too." },
  { targets: ["create"], title: "Create",
    body: "Post a Still (photos), a Flick (video) or a Strand (words), and choose who can see it." },
  { targets: ["sections", "nav-flicks"], title: "Flicks, News and Circles",
    body: {
      sections: "This menu has Flicks, News, Circles and the rest. Flicks is video with limits you set, News is written by verified journalists, and Circles are communities, with Gatherings for meeting up in real life.",
      "nav-flicks": "Flicks is short and long video with limits you set. Below it, News is written by verified journalists, and Circles are communities, with Gatherings for meeting up in real life.",
    } },
  { targets: ["search", "nav-search"], title: "Search", body: "Find people, posts, circles and news." },
  { targets: ["notifications", "nav-notifications"], title: "Notifications",
    body: "Likes, comments, follows and replies. New ones also drop in briefly at the top of the screen." },
  { targets: ["tab-messages", "nav-messages"], title: "Messages",
    body: "Chats, groups, voice notes and calls. Notes, the short lines at the top, last 24 hours. Messages from people you don't follow wait in Requests until you accept." },
  { targets: ["tab-account", "profile"], title: "Your profile",
    body: "Your posts, reposts and saved posts, and how others see you. Settings are here too." },
  { title: "Safe by design",
    body: "Slurs and attacks are stopped before they post, and if something of yours is blocked, a person reviews your appeal. To report anything, use the ••• menu on it." },
  { targets: ["more", "sections"], title: "Back to Brick mode",
    body: {
      more: "Brick mode, the Leaderboard and Settings are under More, so you can change your limits any time.",
      sections: "Brick mode is in this menu too, so you can change your limits any time.",
    } },
  { title: "That's everything", body: "Help, in the menu, has a short guide to every part of Mesh, and this tour is always in Settings." },
];

const GUEST_STEPS = [
  { title: "The full tour", body: "Have a look around. Here's where everything is." },
  { targets: ["sections", "nav-flicks"], title: "Flicks, News and Circles",
    body: "Video with limits you set, news from verified journalists, and communities. Browsing is free." },
  { targets: ["search", "nav-search", "tab-search"], title: "Search", body: "Find people, posts, circles and news." },
  { targets: ["login"], title: "Make an account", body: "Log in or sign up to post, follow people and message." },
  { targets: ["sections", "more"], title: "Help", body: "Help, in this menu, explains everything in Mesh in plain words." },
  { title: "Enjoy Mesh", body: "Ads never target what you do, your data is never sold, and the scroll ends." },
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
 * A new account's short welcome, and the full tour, which spotlights the
 * main controls one at a time when someone asks for it. `ready` says the
 * Home feed is showing with nothing else open.
 */
export default function Tour({ ready, uid, guest, profile, prefsDone, onSeen }) {
  const [welcome, setWelcome] = useState(false);
  const [steps, setSteps] = useState(null);
  const [at, setAt] = useState(0);
  const [asked, setAsked] = useState(false);
  const [rect, setRect] = useState(null);
  const [matched, setMatched] = useState(null);
  const cardRef = useRef(null);
  useFocusTrap({ ref: cardRef, active: !!steps });

  // The full tour, from Settings and Help.
  useEffect(() => {
    const replay = () => setAsked(true);
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);

  // First visit, for accounts made since the welcome arrived. Guests have
  // the Welcome page instead.
  const eligible = (() => {
    if (guest || !uid) return false;
    let seen = false;
    try { seen = localStorage.getItem(doneKey(uid)) === "1"; } catch { /* storage blocked */ }
    return !seen && prefsDone === false && tsMillis(profile?.createdAt) >= TOUR_SINCE;
  })();

  // Once Home is clear of dialogs and the cookie banner.
  useEffect(() => {
    if (welcome || steps || !ready || !(asked || eligible)) return undefined;
    const id = setInterval(() => {
      if (document.querySelector("[aria-modal=true], [data-cookie-banner]")) return;
      clearInterval(id);
      if (asked) {
        setAsked(false);
        setAt(0);
        setSteps((guest ? GUEST_STEPS : MEMBER_STEPS).filter((s) => !s.targets || s.path || findTarget(s.targets)));
      } else {
        setWelcome(true);
      }
    }, 500);
    return () => clearInterval(id);
  }, [ready, asked, eligible, welcome, steps, guest]);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(doneKey(uid), "1"); } catch { /* storage blocked */ }
    if (uid) setTourDone().catch(() => {});
    onSeen?.();
  }, [uid, onSeen]);

  const closeWelcome = (showAround) => {
    setWelcome(false);
    markSeen();
    if (showAround) setAsked(true);
  };

  const finish = useCallback(() => {
    setSteps(null);
    setRect(null);
    markSeen();
  }, [markSeen]);

  const step = steps?.[at];

  // Steps on another page open it; the others come back to Home.
  useEffect(() => {
    if (!step) return;
    const want = step.path || "/";
    if (window.location.pathname !== want) navigate(want);
  }, [step]);

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
    // A page the tour just opened may still be loading, so look again.
    let scrolled = false;
    const look = () => {
      const found = step.targets ? findTarget(step.targets) : null;
      if (found && !scrolled) {
        scrolled = true;
        found.el.scrollIntoView({ block: "nearest", behavior: motionReduced() ? "auto" : "smooth" });
      }
      measure();
    };
    look();
    const timers = [350, 800, 1500].map((ms) => setTimeout(look, ms));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
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

  if (welcome) return <Welcome onClose={closeWelcome} />;
  if (!step) return null;

  const last = at === steps.length - 1;
  const body = typeof step.body === "string" ? step.body : step.body[matched] || Object.values(step.body)[0];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  const pad = 6;

  // Beside a narrow target at the right edge (the desktop sidebar), else
  // below it, or above when it sits low on the screen.
  let place;
  if (!rect) place = { left: (vw - cardW) / 2, top: vh / 2, transform: "translateY(-50%)" };
  else if (rect.left > vw * 0.7 && rect.height < vh * 0.5 && vw >= 768) {
    place = { left: rect.left - cardW - pad - 14, top: Math.min(Math.max(16, rect.top + rect.height / 2 - 90), vh - 240) };
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

// Touch screens get the swipe-left camera tip; it's a phone gesture.
const touch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** The short welcome: what's familiar in one line, then what's different. */
function Welcome({ onClose }) {
  return (
    <Dialog title="Welcome to Mesh" onClose={() => onClose(false)} size="sm"
      footer={(
        <div className="flex w-full gap-2">
          <Button variant="secondary" full onClick={() => onClose(true)}>Show me around</Button>
          <Button variant="primary" full onClick={() => onClose(false)}>Got it</Button>
        </div>
      )}>
      <p className="text-callout text-fg-muted">
        Mesh works like the apps you already know: a feed, stories, messages and calls, and videos in Flicks.
        Here&apos;s what&apos;s different.
      </p>
      <ul className="mt-4 space-y-3.5">
        {DIFFERENT.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-callout font-semibold">{title}</span>
              <span className="block text-caption text-fg-muted">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-fg-subtle">
        {touch() && "Tip: swipe left on Home to open the camera. "}The full tour is always in Settings.
      </p>
    </Dialog>
  );
}
