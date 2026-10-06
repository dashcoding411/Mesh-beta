// lib/auth.js readies Google's sign-in popup on the sign-in page through
// Firebase's own resolver. If an upgrade renames these, this fails, rather
// than the first popup quietly opening late (and Safari blocking it).
import { describe, expect, it } from "vitest";
// The browser build: tests run in Node, where firebase/auth gives a stand-in.
import { browserPopupRedirectResolver } from "../../../node_modules/@firebase/auth/dist/esm/index.js";

describe("Firebase's popup resolver", () => {
  it("is a class we can extend, with the method that starts it", () => {
    expect(typeof browserPopupRedirectResolver).toBe("function");
    expect(typeof browserPopupRedirectResolver.prototype._initialize).toBe("function");
    expect(typeof browserPopupRedirectResolver.prototype._openPopup).toBe("function");
  });
});
