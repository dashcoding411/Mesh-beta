import { describe, expect, it } from "vitest";
import { validBirthYear, validateSources, validateText, validateUsername } from "../validate";

const year = new Date().getFullYear();

describe("validBirthYear", () => {
  it("accepts people 13 and over", () => {
    expect(validBirthYear(String(year - 13)).year).toBe(year - 13);
    expect(validBirthYear("1990").year).toBe(1990);
  });
  it("refuses under-13s, the future and nonsense", () => {
    expect(validBirthYear(String(year - 12)).error).toMatch(/13/);
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
