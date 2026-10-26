import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPending, listenLock, listenUsage, me, pingUsage, syncBrickStats, syncMyGroupEntries, syncTimeZone, tidyUsage,
} from "./db";
import { capFor, dayKey, lockState, pendingDueAt, unlockAt } from "./brick";

// Live brick policy and usage, re-evaluated every 15s. Separate context so
// the tick only re-renders consumers.
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

  useEffect(() => {
    if (!signedIn || offset === null) return undefined;
    return listenUsage(me(), offset, setUsage);
  }, [signedIn, offset, today]);

  // The tick re-renders the app, so it only runs while someone signed in is
  // looking, and catches up the moment Mesh is back on screen.
  useEffect(() => {
    if (!signedIn) return undefined;
    const tick = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    const t = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [signedIn]);

  // Apply due pending changes. 60s grace for fast clocks; one attempt per
  // change per session so a rejection can't loop.
  const due = pendingDueAt(policy);
  const tried = useRef(0);
  useEffect(() => {
    const stamp = raw?.pending?.requestedAt?.toMillis?.();
    if (!stamp || !due || now < due + 60000 || tried.current === stamp) return;
    tried.current = stamp;
    applyPending(raw).catch(() => {});
  }, [raw, due, now]);

  // Once per session: DST sync, usage pruning, stats claims.
  const tidied = useRef(false);
  const counted = useRef(0);
  useEffect(() => {
    if (!policy || tidied.current) return;
    tidied.current = true;
    syncTimeZone(policy).catch(() => {});
    tidyUsage(policy).catch(() => {});
    counted.current = policy.self?.until || 0;
    syncBrickStats(policy, raw).then(() => syncMyGroupEntries()).catch(() => {});
  }, [policy, raw]);

  // Claim an instant brick as soon as it ends.
  const brickEnd = policy?.self?.until || 0;
  useEffect(() => {
    if (!brickEnd || now < brickEnd || counted.current === brickEnd) return;
    counted.current = brickEnd;
    syncBrickStats(policy, raw).then(() => syncMyGroupEntries()).catch(() => {});
  }, [brickEnd, now, policy, raw]);

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

// Counts time while a capped section is visible and saves it about every two
// minutes, at once when it reaches the cap (so the lock is on time), and when
// Mesh is hidden. Uncapped sections aren't metered. The rules accept up to
// the seconds since the last save, and at most one save every 25 seconds.
const SAVE_EVERY = 120;
const MIN_GAP_MS = 26_000;

export function useUsageMeter(brick, section) {
  const ref = useRef(brick);
  useEffect(() => { ref.current = brick; }, [brick]);
  const capped = !!section && brick.cap(section) > 0;

  useEffect(() => {
    if (!capped) return undefined;
    let last = Date.now();
    let seconds = 0;
    let savedAt = 0;
    let saving = false;
    const save = (force) => {
      const b = ref.current;
      const whole = Math.floor(seconds);
      if (saving || !b.policy || whole < 1 || Date.now() - savedAt < MIN_GAP_MS) return;
      const used = b.usage?.[section] || 0;
      const atCap = used + whole >= b.cap(section) * 60;
      if (!force && !atCap && whole < SAVE_EVERY) return;
      saving = true;
      seconds -= whole;
      pingUsage(b.policy, section, whole)
        .then(() => { savedAt = Date.now(); })
        .catch(() => { seconds += whole; })
        .finally(() => { saving = false; });
    };
    const t = setInterval(() => {
      const b = ref.current;
      const n = Date.now();
      if (document.visibilityState === "visible" && !b.state(section)) seconds += (n - last) / 1000;
      last = n;
      save(false);
    }, 5000);
    const onHide = () => { if (document.visibilityState === "hidden") save(true); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      save(true);
    };
  }, [capped, section]);
}
