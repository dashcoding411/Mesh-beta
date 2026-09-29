import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPending, listenLock, listenUsage, me, pingUsage, syncTimeZone, tidyUsage,
} from "./db";
import { capFor, dayKey, lockState, pendingDueAt, unlockAt } from "./brick";

/* Brick mode, live, for the whole app: your limits and today's minutes from
   the server, re-checked every 15 seconds so a window opening or closing
   shows up without a reload. Its own context, so the ticking clock only
   re-renders the few places that care. */
export const BrickContext = createContext(null);

export function useBrick() {
  return useContext(BrickContext) || EMPTY;
}

const EMPTY = { policy: null, raw: null, usage: {}, now: Date.now(), loaded: false, state: () => null, opensAt: () => null, cap: () => 0 };

export function useBrickEngine(signedIn) {
  const [lock, setLock] = useState({ policy: null, raw: null, loaded: false });
  const [usage, setUsage] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const { policy, raw } = lock;
  const offset = policy?.tzOffset ?? null;
  const today = offset === null ? "" : dayKey(now, offset);

  useEffect(() => {
    if (!signedIn) return undefined;
    return listenLock(me(), (p, r) => setLock({ policy: p, raw: r, loaded: true }));
  }, [signedIn]);

  // Today's usage, re-subscribed when the local day changes.
  useEffect(() => {
    if (!signedIn || offset === null) return undefined;
    return listenUsage(me(), offset, setUsage);
  }, [signedIn, offset, today]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // A loosening that has waited its 24 hours takes effect on its own. A
  // minute's grace covers a device clock that runs fast, and each waiting
  // change is tried once per visit, so a refusal can't turn into a loop.
  const due = pendingDueAt(policy);
  const tried = useRef(0);
  useEffect(() => {
    const stamp = raw?.pending?.requestedAt?.toMillis?.();
    if (!stamp || !due || now < due + 60000 || tried.current === stamp) return;
    tried.current = stamp;
    applyPending(raw).catch(() => {});
  }, [raw, due, now]);

  // Once a visit: follow daylight saving, and drop usage older than a week.
  const tidied = useRef(false);
  useEffect(() => {
    if (!policy || tidied.current) return;
    tidied.current = true;
    syncTimeZone(policy).catch(() => {});
    tidyUsage(policy).catch(() => {});
  }, [policy]);

  return useMemo(() => ({
    policy,
    raw,
    usage,
    now,
    loaded: lock.loaded,
    state: (section) => lockState(policy, usage, section, now),
    opensAt: (section) => unlockAt(policy, usage, section, now),
    cap: (section) => capFor(policy, section, now),
  }), [policy, raw, usage, now, lock.loaded]);
}

/* Counts time on a capped section: while it's on screen and the tab is in
   front, every 30 seconds adds 30 to today's total on the server. Nothing
   is counted where there's no cap, so most people never send these. */
export function useUsageMeter(brick, section) {
  const ref = useRef(brick);
  useEffect(() => { ref.current = brick; }, [brick]);
  const capped = !!section && brick.cap(section) > 0;

  useEffect(() => {
    if (!capped) return undefined;
    let last = Date.now();
    let seconds = 0;
    const t = setInterval(() => {
      const b = ref.current;
      const n = Date.now();
      if (document.visibilityState === "visible" && !b.state(section)) seconds += (n - last) / 1000;
      last = n;
      if (seconds >= 30 && b.policy) {
        seconds -= 30;
        pingUsage(b.policy, section).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [capped, section]);
}
