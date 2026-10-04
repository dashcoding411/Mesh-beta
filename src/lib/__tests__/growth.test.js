import { describe, expect, it } from "vitest";
import { areaChoices, groupWhatsOn, inArea, isOnline, whenGroup } from "../whatson.js";
import { BRIEF_SIZE, pickBrief } from "../newsBrief.js";
import { activeCounts, retention, signupsByDay } from "../stats.js";
import { addTime, dayStamp, secondsBetween } from "../timeMeter.js";
import { friendsGoingLabel, photosOpen } from "../data/events.js";
import { comparedLabel, durationLabel, recapRows, weekStartOf } from "../data/week.js";
import { eventLd, injectMeta } from "../../../cloudflare/edge/src/worker.js";

const DAY = 86400000;
// Wednesday 7 October 2026, 3pm local time.
const WED = new Date(2026, 9, 7, 15, 0).getTime();
const at = (d, h = 12) => new Date(2026, 9, d, h, 0).getTime();

describe("What's on", () => {
  it("groups by today, this weekend, the next week and later", () => {
    expect(whenGroup(at(7, 19), WED)).toBe("today");
    expect(whenGroup(at(8), WED)).toBe("week"); // Thursday
    expect(whenGroup(at(10), WED)).toBe("weekend"); // Saturday
    expect(whenGroup(at(11), WED)).toBe("weekend"); // Sunday
    expect(whenGroup(at(13), WED)).toBe("week"); // next Tuesday
    expect(whenGroup(at(19), WED)).toBe("later");
  });

  it("on a Saturday, the weekend is just Sunday, and on a Sunday next weekend isn't 'this weekend'", () => {
    const sat = at(10, 10);
    expect(whenGroup(at(10, 20), sat)).toBe("today");
    expect(whenGroup(at(11), sat)).toBe("weekend");
    const sun = at(11, 10);
    expect(whenGroup(at(17), sun)).toBe("week");
  });

  it("drops gatherings that finished, keeps ones that just started, and sorts each group", () => {
    const events = [
      { id: "late", startsMs: at(19) },
      { id: "old", startsMs: WED - 5 * 3600000 },
      { id: "now", startsMs: WED - 3600000 },
      { id: "sun", startsMs: at(11) },
      { id: "sat", startsMs: at(10) },
    ];
    const groups = groupWhatsOn(events, WED);
    expect(groups.map((g) => g.id)).toEqual(["today", "weekend", "later"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["sat", "sun"]);
    expect(groups.flatMap((g) => g.events).some((e) => e.id === "old")).toBe(false);
  });

  it("matches the typed area anywhere in the location, and Online", () => {
    expect(inArea("Victoria Park, Herston, Brisbane", "brisbane")).toBe(true);
    expect(inArea("Victoria Park, Herston, Brisbane", "  Herston ")).toBe(true);
    expect(inArea("Southbank, Brisbane", "Sydney")).toBe(false);
    expect(inArea("anything", "")).toBe(true);
    expect(inArea("https://meet.example.com/abc", "online")).toBe(true);
    expect(isOnline("Zoom call")).toBe(true);
    expect(isOnline("Zoo entrance")).toBe(false);
  });

  it("offers the most common towns, without numbers or states", () => {
    const choices = areaChoices([
      "12 Main St, Fortitude Valley, Brisbane, QLD",
      "Victoria Park, Brisbane",
      "Bondi Beach, Sydney, NSW, Australia",
      "https://zoom.us/j/1",
    ]);
    expect(choices[0]).toBe("Brisbane");
    expect(choices).toContain("Sydney");
    expect(choices).not.toContain("QLD");
    expect(choices.some((c) => /\d/.test(c))).toBe(false);
    expect(choices.at(-1)).toBe("Online");
  });
});

describe("Today's brief", () => {
  const story = (id, hoursAgo, topic = "world", live = false) => ({ id, topic, live, publishedMs: WED - hoursAgo * 3600000 });

  it("takes five recent stories, live first, at most two per topic", () => {
    const stories = [
      story("a", 1, "world"), story("b", 2, "world"), story("c", 3, "world"),
      story("d", 4, "sport"), story("e", 5, "local", true), story("f", 6, "tech"), story("g", 40, "tech"),
    ];
    const brief = pickBrief(stories, WED);
    expect(brief).toHaveLength(BRIEF_SIZE);
    expect(brief[0].id).toBe("e");
    expect(brief.map((s) => s.id)).not.toContain("c");
    expect(brief.map((s) => s.id)).not.toContain("g");
  });

  it("reaches back three days when it's quiet, and fills from any topic if it has to", () => {
    expect(pickBrief([story("a", 1), story("b", 50), story("c", 60)], WED).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(pickBrief([story("a", 1), story("b", 2), story("c", 3)], WED).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(pickBrief([story("old", 100)], WED)).toEqual([]);
  });
});

describe("Your week on Mesh", () => {
  it("starts the week on Monday at midnight", () => {
    const start = new Date(weekStartOf(WED));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(5);
    expect(start.getHours()).toBe(0);
    expect(new Date(weekStartOf(at(11, 23))).getDate()).toBe(5); // Sunday still belongs to that week
  });

  it("labels time and the change from last week", () => {
    expect(durationLabel(45 * 60)).toBe("45 min");
    expect(durationLabel(3 * 3600)).toBe("3 h");
    expect(durationLabel(3 * 3600 + 20 * 60)).toBe("3 h 20 min");
    expect(comparedLabel(3600, 0)).toBe("");
    expect(comparedLabel(3600, 3700)).toBe("About the same as last week");
    expect(comparedLabel(3600, 7200)).toBe("1 h less than last week");
    expect(comparedLabel(7200, 3600)).toBe("1 h more than last week");
  });

  it("keeps device time by day, for three weeks", () => {
    let map = addTime({}, 30, WED);
    map = addTime(map, 45, WED);
    expect(map[dayStamp(WED)]).toBe(75);
    map = addTime({ "2026-01-01": 100, ...map }, 10, WED);
    expect(map["2026-01-01"]).toBeUndefined();
    const week = addTime(addTime({}, 600, at(6)), 300, at(4)); // Tuesday, and last Sunday
    expect(secondsBetween(week, weekStartOf(WED), WED + DAY)).toBe(600);
  });

  it("only shows what happened, with time on Mesh always first", () => {
    const rows = recapRows({ timeSeconds: 600, compared: "", brickedSeconds: 0, gatherings: [{ id: "g", title: "Park run" }], posts: 1, newFollowers: 0, storiesRead: 2 });
    expect(rows.map((r) => r.label)).toEqual(["Time on Mesh", "Gatherings", "Posted", "News"]);
    expect(rows[1]).toMatchObject({ value: "1 gathering", note: "Park run" });
    expect(rows[3].value).toBe("2 stories read");
  });
});

describe("Gatherings", () => {
  it("names friends going", () => {
    expect(friendsGoingLabel([{ username: "ana" }])).toBe("@ana is going");
    expect(friendsGoingLabel([{ username: "ana" }, { username: "ben" }])).toBe("@ana and @ben are going");
    expect(friendsGoingLabel([{ username: "ana" }, { username: "ben" }, { username: "cy" }])).toBe("@ana and 2 others you follow are going");
  });

  it("opens photos when it starts, for 30 days", () => {
    const start = { toMillis: () => WED };
    expect(photosOpen({ startsAt: start }, WED - 60000)).toBe(false);
    expect(photosOpen({ startsAt: start }, WED + DAY)).toBe(true);
    expect(photosOpen({ startsAt: start }, WED + 31 * DAY)).toBe(false);
  });

  it("describes a public gathering as a schema.org Event", () => {
    const meta = {
      url: "https://joinmesh.social/gatherings/g1", image: "https://joinmesh.social/og-image.png", description: "Sat · Run",
      event: { name: "Park run", startsAt: "2026-10-11T23:00:00Z", when: "Sun 12 Oct", location: "Victoria Park, Brisbane", description: "5k, all paces", host: "ana", ticketUrl: "" },
    };
    const ld = eventLd(meta, "https://joinmesh.social");
    expect(ld).toMatchObject({ "@type": "Event", name: "Park run", startDate: "2026-10-11T23:00:00.000Z", endDate: "2026-10-12T01:00:00.000Z" });
    expect(ld.location).toEqual({ "@type": "Place", name: "Victoria Park, Brisbane", address: "Victoria Park, Brisbane" });
    expect(ld.eventAttendanceMode).toContain("Offline");
    expect(ld.organizer.url).toBe("https://joinmesh.social/@ana");
    const online = eventLd({ ...meta, event: { ...meta.event, location: "https://meet.example.com/x" } }, "https://joinmesh.social");
    expect(online.location).toEqual({ "@type": "VirtualLocation", url: "https://meet.example.com/x" });

    const html = injectMeta("<html><head><title>Mesh</title></head><body><div id=\"root\"></div></body></html>",
      { ...meta, title: "Park run", event: { ...meta.event, description: "Bring <water>" } }, "https://joinmesh.social");
    expect(html).toContain('"@type":"Event"');
    expect(html).toContain("<noscript><article><h1>Park run</h1>");
    expect(html).toContain("Bring &lt;water&gt;");
    expect(html).not.toContain("Bring <water>");
  });
});

describe("Staff stats", () => {
  const rec = (joinedDaysAgo, lastDaysAgo, days) => ({ joined: WED - joinedDaysAgo * DAY, last: WED - lastDaysAgo * DAY, days });

  it("counts people active today, this week and this month", () => {
    const records = [rec(40, 0, []), rec(40, 3, []), rec(40, 20, []), rec(40, 45, [])];
    expect(activeCounts(records, WED)).toEqual({ daily: 1, weekly: 2, monthly: 3, stickiness: 33 });
    expect(activeCounts([], WED).stickiness).toBe(null);
  });

  it("measures who came back, only among people old enough to tell", () => {
    const records = [rec(40, 0, [0, 1, 8, 31]), rec(40, 30, [0, 2]), rec(1, 0, [0])];
    const r = retention(records, WED);
    expect(r.day1).toEqual({ rate: 50, of: 2 });
    expect(r.week2).toEqual({ rate: 50, of: 2 });
    expect(r.month).toEqual({ rate: 50, of: 2 });
    expect(retention([], WED).day1).toEqual({ rate: null, of: 0 });
    // People who joined before counting began aren't counted.
    expect(retention(records, WED, WED - 30 * DAY).day1).toEqual({ rate: null, of: 0 });
  });

  it("buckets sign-ups by day for 30 days", () => {
    const days = signupsByDay([WED, WED - 3600000, WED - 2 * DAY, WED - 40 * DAY], WED);
    expect(days).toHaveLength(30);
    expect(days.at(-1).count).toBe(2);
    expect(days.at(-3).count).toBe(1);
    expect(days.reduce((s, d) => s + d.count, 0)).toBe(3);
  });
});
