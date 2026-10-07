// Mesh's own Google sign-in (M.A.T.H): only an answer to this tab's request
// is accepted.
import { describe, expect, it } from "vitest";
import { googleAnswer, tokenClaims } from "../googleAnswer";

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (claims) => `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig`;
const now = Date.UTC(2027, 1, 17, 9);
const saved = { state: "s1", nonce: "n1", at: now - 60_000 };

describe("googleAnswer", () => {
  it("accepts the answer to this tab's request", () => {
    const t = token({ nonce: "n1", name: "Zoë" });
    expect(googleAnswer(`#id_token=${t}&state=s1`, saved, now)).toEqual({ idToken: t });
  });
  it("ignores an address with no answer", () => {
    expect(googleAnswer("", saved, now)).toBeNull();
    expect(googleAnswer("#u-123", saved, now)).toBeNull();
  });
  it("treats backing out as a cancel, not an error", () => {
    expect(googleAnswer("#error=access_denied&state=s1", saved, now)).toEqual({ cancelled: true });
  });
  it("refuses a token from another request, a replayed nonce, or a stale one", () => {
    expect(() => googleAnswer(`#id_token=${token({ nonce: "n1" })}&state=other`, saved, now)).toThrow();
    expect(() => googleAnswer(`#id_token=${token({ nonce: "nX" })}&state=s1`, saved, now)).toThrow();
    expect(() => googleAnswer(`#id_token=${token({ nonce: "n1" })}&state=s1`, { ...saved, at: now - 20 * 60_000 }, now)).toThrow();
    expect(() => googleAnswer(`#id_token=${token({ nonce: "n1" })}&state=s1`, null, now)).toThrow();
    expect(() => googleAnswer("#id_token=garbage&state=s1", saved, now)).toThrow();
  });

  it("names the check that failed, for the error's code", () => {
    const reason = (fragment, s) => { try { googleAnswer(fragment, s, now); } catch (err) { return err.reason; } return null; };
    expect(reason(`#id_token=${token({ nonce: "n1" })}&state=other`, saved)).toBe("state");
    expect(reason(`#id_token=${token({ nonce: "nX" })}&state=s1`, saved)).toBe("nonce");
    expect(reason(`#id_token=${token({ nonce: "n1" })}&state=s1`, { ...saved, at: now - 20 * 60_000 })).toBe("expired");
    expect(reason(`#id_token=${token({ nonce: "n1" })}&state=s1`, null)).toBe("not-started-here");
    expect(reason("#id_token=garbage&state=s1", saved)).toBe("bad-token");
    expect(reason("#error=server_error", saved)).toBe("google-server_error");
  });
  it("reads claims without padding", () => {
    expect(tokenClaims(token({ nonce: "abc" })).nonce).toBe("abc");
  });
});
