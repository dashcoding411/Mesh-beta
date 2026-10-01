import { describe, expect, it } from "vitest";
import { suggestTopics } from "../interests";

describe("working out a post's topics", () => {
  it("doesn't tag a passing word or a figure of speech", () => {
    expect(suggestTopics("calls not working, video call camera is bugged and zooms out after flipping")).toEqual([]);
    expect(suggestTopics("quick run to the shops, back soon")).toEqual([]);
    expect(suggestTopics("Because the internet is the greatest album")).toEqual([]);
    expect(suggestTopics("gig tonight at the corner hotel")).toEqual([]);
    expect(suggestTopics("that's so funny lol")).toEqual([]);
    expect(suggestTopics("album album album")).toEqual([]);
  });

  it("tags when more than one word points the same way", () => {
    expect(suggestTopics("the band's new album dropped and the gig was unreal")).toEqual(["music"]);
    expect(suggestTopics("golden hour shot on my new camera")).toEqual(["photography"]);
    expect(suggestTopics("morning run before the marathon")[0]).toBe("fitness");
  });

  it("always honours a hashtag", () => {
    expect(suggestTopics("#photography")).toEqual(["photography"]);
  });

  it("keeps the three strongest", () => {
    expect(suggestTopics("gym workout, then a hike to the waterfall, then cooking dinner, then a gig with the band").length).toBe(3);
  });
});
