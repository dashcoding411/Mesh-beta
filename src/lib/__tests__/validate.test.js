import { describe, expect, it } from "vitest";
import { validBirthYear, validateSources, validateText, validateUsername } from "../validate";

const year = new Date().getFullYear();

describe("validBirthYear", () => {
  it("accepts people 16 and over, flagging the year they may not have turned 16 yet", () => {
    expect(validBirthYear(String(year - 17))).toEqual({ year: year - 17, borderline: false });
    expect(validBirthYear(String(year - 16))).toEqual({ year: year - 16, borderline: true });
    expect(validBirthYear("1990").year).toBe(1990);
  });
  it("refuses under-16s, the future and nonsense", () => {
    expect(validBirthYear(String(year - 15)).error).toMatch(/16/);
    expect(validBirthYear(String(year - 13)).error).toMatch(/16/);
    expect(validBirthYear(String(year + 1)).error).toBeTruthy();
    expect(validBirthYear("1800").error).toBeTruthy();
    expect(validBirthYear("abc").error).toBeTruthy();
  });
});

describe("validateSources", () => {
  it("needs at least two web links", () => {
    expect(validateSources("https://a.example").error).toBeTruthy();
    expect(validateSources("https://a.example\nhttps://b.example").sources).toHaveLength(2);
  });
  it("refuses anything that isn't a link", () => {
    expect(validateSources("https://a.example\njavascript:alert(1)").error).toBeTruthy();
  });
});

describe("validateText", () => {
  it("trims, and enforces the maximum", () => {
    expect(validateText("  hi  ", 10, "Post").text).toBe("hi");
    expect(validateText("x".repeat(11), 10, "Post").error).toBeTruthy();
  });
});

describe("validateUsername", () => {
  it("allows lowercase letters, numbers and underscores", () => {
    expect(validateUsername("mesh_qa_1").error).toBeFalsy();
    expect(validateUsername("Mesh QA").error).toBeTruthy();
    expect(validateUsername("ab").error).toBeTruthy();
  });
});
