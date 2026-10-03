import { describe, expect, it } from "vitest";
import { legalRisks, newBlock } from "../storyDoc.js";

const story = (...paras) => ({ title: "", standfirst: "", blocks: paras.map((p) => newBlock("p", p)) });

describe("legal risk check", () => {
  it("flags a named person next to an unattributed allegation", () => {
    expect(legalRisks(story("John Smith stole money from the club."))).toHaveLength(1);
    expect(legalRisks(story("Acme Holdings is running a scam on renters."))).toHaveLength(1);
  });

  it("leaves attributed allegations and plain reporting alone", () => {
    expect(legalRisks(story("John Smith was charged with fraud on Monday."))).toHaveLength(0);
    expect(legalRisks(story("Police said John Smith assaulted a man."))).toHaveLength(0);
    expect(legalRisks(story("John Smith opened the new library on Friday."))).toHaveLength(0);
    expect(legalRisks(story("fraud is rising across the state."))).toHaveLength(0);
  });
});
