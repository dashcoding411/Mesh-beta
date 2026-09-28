import { describe, expect, it } from "vitest";
import { compact, formatDuration, plural } from "../format";

describe("format", () => {
  it("plural", () => {
    expect(plural(1, "like")).toBe("1 like");
    expect(plural(2, "like")).toBe("2 likes");
    expect(plural(3, "reply", "replies")).toBe("3 replies");
  });
  it("compact", () => {
    expect(compact(999)).toBe("999");
    expect(compact(1234)).toBe("1.2K");
    expect(compact(12000)).toBe("12K");
    expect(compact(3_400_000)).toBe("3.4M");
  });
  it("formatDuration", () => {
    expect(formatDuration(65)).toBe("1:05");
  });
});
