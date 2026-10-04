import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ auth: {}, db: {} }));
const { normalizePhone, normalizeEmail, parseVcf, contactKey, contactCodes } = await import("../contacts.js");

describe("contact sync", () => {
  it("normalises Australian and international numbers to E.164", () => {
    expect(normalizePhone("0412 345 678")).toBe("+61412345678");
    expect(normalizePhone("+61 412 345 678")).toBe("+61412345678");
    expect(normalizePhone("61412345678")).toBe("+61412345678");
    expect(normalizePhone("412345678")).toBe("+61412345678");
    expect(normalizePhone("0044 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("123")).toBe("");
  });

  it("normalises emails and drops junk", () => {
    expect(normalizeEmail(" Sam@Example.COM ")).toBe("sam@example.com");
    expect(normalizeEmail("not an email")).toBe("");
  });

  it("reads numbers and emails from a vCard, including folded lines", () => {
    const vcf = "BEGIN:VCARD\r\nFN:Sam\r\nTEL;TYPE=CELL:0412 345\r\n 678\r\nitem1.EMAIL;type=INTERNET:sam@example.com\r\nEND:VCARD\r\n";
    expect(parseVcf(vcf)).toEqual({ phones: ["0412 345678"], emails: ["sam@example.com"] });
  });

  it("makes the same lower-case SHA-256 code the rules compute, and de-duplicates", async () => {
    const code = await contactKey("+61412345678");
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    expect(await contactKey("+61412345678")).toBe(code);
    const codes = await contactCodes({ phones: ["0412 345 678", "+61412345678"], emails: ["SAM@example.com", "sam@example.com"] });
    expect(codes).toHaveLength(2);
  });
});
