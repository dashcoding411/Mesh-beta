// Name search matches the start of a display name, ignoring case and accents.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ auth: {}, db: {} }));
const { nameKey } = await import("../data/users.js");

describe("nameKey", () => {
  it("lower-cases and drops accents, so Zoë is found by zoe", () => {
    expect(nameKey("Zoë Martínez")).toBe("zoe martinez");
  });
  it("tidies spaces and caps the length the rules allow", () => {
    expect(nameKey("  Noah   Smith ")).toBe("noah smith");
    expect(nameKey("x".repeat(80))).toHaveLength(60);
  });
  it("copes with nothing", () => {
    expect(nameKey(undefined)).toBe("");
  });
});
