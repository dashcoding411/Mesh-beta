import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ auth: {}, db: {} }));
vi.mock("firebase/firestore", async () => ({ Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) } }));
globalThis.window = { location: { origin: "https://mesh.example" }, addEventListener: () => {}, history: { state: null } };
const { eventIcs, googleCalendarUrl } = await import("../data/events.js");

const event = {
  id: "abc123",
  title: "Board games, snacks; and chat",
  location: "Brunswick Library, Room 2",
  description: "Bring a game.\nAll welcome",
  startsAt: { toMillis: () => Date.UTC(2026, 9, 3, 8, 0) },
};

describe("calendar export", () => {
  it("writes a valid event with a day's and two hours' warning", () => {
    const ics = eventIcs(event);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("DTSTART:20261003T080000Z");
    expect(lines).toContain("DTEND:20261003T100000Z");
    expect(lines).toContain("SUMMARY:Board games\\, snacks\\; and chat");
    expect(lines).toContain("LOCATION:Brunswick Library\\, Room 2");
    expect(lines.filter((l) => l.startsWith("TRIGGER:"))).toEqual(["TRIGGER:-PT24H", "TRIGGER:-PT2H"]);
    expect(ics).toContain("Bring a game.\\nAll welcome");
    expect(ics).not.toMatch(/[^\r]\n/); // no bare line breaks inside a field
  });
  it("links to Google Calendar with the same times", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.host).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261003T080000Z/20261003T100000Z");
    expect(url.searchParams.get("details")).toContain("https://mesh.example/gatherings/abc123");
  });
});
