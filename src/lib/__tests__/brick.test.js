import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({ Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) } }));
const {
  windowsToSlots, localParts, dayKey, lockState, unlockAt, isTighterOrSame, tightest, looseningParts,
  emptyLayer, windowLabel, capFor, parentActive, carryTightening, applyChange,
} = await import("../brick");

const SYD = 600; // UTC+10
// Wednesday 30 September 2026, 9:15pm in Sydney.
const WED_2115 = Date.UTC(2026, 8, 30, 11, 15);
const layer = (over = {}) => ({ ...emptyLayer(), ...over });
const policy = (self, extra = {}) => ({ tzOffset: SYD, self, pending: null, parent: null, ...extra });

describe("local time", () => {
  it("works out the day, slot and day key in the limits' own time zone", () => {
    const p = localParts(WED_2115, SYD);
    expect(p.dow).toBe(3); // Wednesday
    expect(p.slot).toBe(42); // 21:00-21:30
    expect(dayKey(WED_2115, SYD)).toBe("2026-273");
  });
});

describe("windows", () => {
  it("a window past midnight carries into the next day", () => {
    const slots = windowsToSlots([{ days: [3], from: 22 * 60, to: 7 * 60 }]);
    expect(slots.d3).toEqual([44, 45, 46, 47]);
    expect(slots.d4).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
  it("Sunday night wraps to Monday", () => {
    const slots = windowsToSlots([{ days: [7], from: 23 * 60, to: 60 }]);
    expect(slots.d7).toEqual([46, 47]);
    expect(slots.d1).toEqual([0, 1]);
  });
  it("labels read naturally", () => {
    expect(windowLabel({ days: [1, 2, 3, 4, 5], from: 0, to: 600 })).toBe("Weekdays, midnight to 10am");
    expect(windowLabel({ days: [7], from: 0, to: 0 })).toBe("Sun, all day");
    expect(windowLabel({ days: [1, 2, 3, 4, 5, 6, 7], from: 1350, to: 420 })).toBe("Every day, 10:30pm to 7am");
  });
});

describe("what's locked", () => {
  const nightly = layer({ windows: [{ days: [1, 2, 3, 4, 5, 6, 7], from: 21 * 60, to: 7 * 60 }] });
  nightly.slots = windowsToSlots(nightly.windows);

  it("a scheduled window locks everything, and says when it opens", () => {
    const p = policy(nightly);
    expect(lockState(p, {}, "feed", WED_2115)).toMatchObject({ reason: "schedule", by: "self" });
    expect(lockState(p, {}, "", WED_2115)).not.toBeNull();
    // Opens at 7am Thursday in Sydney, which is 9pm Wednesday UTC.
    expect(unlockAt(p, {}, "feed", WED_2115)).toBe(Date.UTC(2026, 8, 30, 21, 0));
  });
  it("an instant brick opens exactly when it ends", () => {
    const until = WED_2115 + 2 * 3600000 + 7 * 60000;
    const p = policy(layer({ until }));
    expect(lockState(p, {}, "flicks", WED_2115)).toMatchObject({ reason: "instant", until });
    expect(unlockAt(p, {}, "flicks", WED_2115)).toBe(until);
  });
  it("a used-up cap locks only that section, until midnight", () => {
    const p = policy(layer({ caps: { feed: 0, flicks: 30, news: 0 } }));
    expect(lockState(p, { flicks: 1800 }, "flicks", WED_2115)).toMatchObject({ reason: "cap", cap: 30 });
    expect(lockState(p, { flicks: 1800 }, "feed", WED_2115)).toBeNull();
    expect(lockState(p, { flicks: 1770 }, "flicks", WED_2115)).toBeNull();
    // Midnight Sydney = 14:00 UTC.
    expect(unlockAt(p, { flicks: 1800 }, "flicks", WED_2115)).toBe(Date.UTC(2026, 8, 30, 14, 0));
  });
  it("a parent's layer counts until the year the teen turns 18, then stops", () => {
    const par = { ...layer({ until: WED_2115 + 3600000 }), parentId: "p", parentName: "mum", untilYear: 2027 };
    expect(lockState(policy(layer(), { parent: par }), {}, "feed", WED_2115)).toMatchObject({ by: "parent" });
    const grownUp = { ...par, untilYear: 2026 };
    expect(parentActive(policy(layer(), { parent: grownUp }), WED_2115)).toBe(false);
    expect(lockState(policy(layer(), { parent: grownUp }), {}, "feed", WED_2115)).toBeNull();
  });
  it("the stricter of two caps applies", () => {
    const par = { ...layer({ caps: { feed: 20, flicks: 0, news: 0 } }), untilYear: 2030 };
    expect(capFor(policy(layer({ caps: { feed: 45, flicks: 0, news: 0 } }), { parent: par }), "feed", WED_2115)).toBe(20);
  });
});

describe("stricter or looser", () => {
  const base = layer({ caps: { feed: 30, flicks: 0, news: 0 }, slots: { d1: [0, 1] } });
  it("adding limits is tightening", () => {
    expect(isTighterOrSame(layer({ caps: { feed: 20, flicks: 15, news: 0 }, slots: { d1: [0, 1, 2] } }), base, WED_2115)).toBe(true);
  });
  it("raising or removing a cap, or dropping a slot, is loosening", () => {
    expect(isTighterOrSame(layer({ caps: { feed: 45, flicks: 0, news: 0 }, slots: { d1: [0, 1] } }), base, WED_2115)).toBe(false);
    expect(isTighterOrSame(layer({ caps: { feed: 0, flicks: 0, news: 0 }, slots: { d1: [0, 1] } }), base, WED_2115)).toBe(false);
    expect(isTighterOrSame(layer({ caps: { feed: 30, flicks: 0, news: 0 }, slots: { d1: [0] } }), base, WED_2115)).toBe(false);
  });
  it("ending a running brick early is loosening; an expired one doesn't matter", () => {
    expect(isTighterOrSame(layer({ until: 0 }), layer({ until: WED_2115 + 60000 }), WED_2115)).toBe(false);
    expect(isTighterOrSame(layer({ until: 0 }), layer({ until: WED_2115 - 60000 }), WED_2115)).toBe(true);
  });
  it("the strictest of both keeps every limit", () => {
    const t = tightest(base, layer({ caps: { feed: 45, flicks: 20, news: 0 }, slots: { d2: [5] } }));
    expect(t.caps).toEqual({ feed: 30, flicks: 20, news: 0 });
    expect(t.slots).toEqual({ d1: [0, 1], d2: [5] });
    expect(isTighterOrSame(t, base, WED_2115)).toBe(true);
  });
  it("says what a loosening would change", () => {
    const prev = layer({ caps: { feed: 30, flicks: 0, news: 0 }, windows: [{ days: [7], from: 0, to: 0 }] });
    expect(looseningParts(layer({ caps: { feed: 60, flicks: 0, news: 0 } }), prev, WED_2115))
      .toEqual(['Remove "Sun, all day"', "Feed from 30 to 60 minutes a day"]);
  });
  it("tightening while a loosening waits keeps the rest of what's waiting", () => {
    const now = layer({ caps: { feed: 25, flicks: 20, news: 5 } });
    const waiting = layer({ caps: { feed: 0, flicks: 0, news: 0 } }); // all limits off tomorrow
    const next = layer({ caps: { feed: 15, flicks: 20, news: 5 } }); // Feed down to 15 now
    const carried = carryTightening(waiting, now, next);
    expect(carried.caps).toEqual({ feed: 15, flicks: 0, news: 0 });
    expect(isTighterOrSame(carried, waiting, WED_2115)).toBe(true);
  });
  it("a second loosening adds to the one already waiting", () => {
    const sunday = { days: [7], from: 0, to: 0 };
    const nights = { days: [1, 2, 3, 4, 5], from: 22 * 60, to: 7 * 60 };
    const now = layer({ caps: { feed: 30, flicks: 0, news: 0 }, windows: [sunday, nights] });
    const waiting = layer({ caps: { feed: 30, flicks: 0, news: 0 }, windows: [nights] }); // Sunday removed tomorrow
    const next = layer({ caps: { feed: 60, flicks: 0, news: 0 }, windows: [sunday, nights] }); // now: Feed to 60
    const merged = applyChange(waiting, now, next);
    expect(merged.windows).toEqual([nights]);
    expect(merged.caps.feed).toBe(60);
    expect(merged.slots).toEqual(windowsToSlots([nights]));
  });
});
