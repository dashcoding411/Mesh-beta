import { describe, expect, it } from "vitest";
import { suggestTopics } from "../interests";

describe("working out a post's topics", () => {
  it("doesn't tag a passing word that means something else", () => {
    expect(suggestTopics("calls not working, video call camera is bugged and zooms out after flipping")).toEqual([]);
    expect(suggestTopics("quick run to the shops, back soon")).toEqual([]);
    expect(suggestTopics("that's so funny lol")).toContain("comedy"); // two weak words together
  });

  it("tags clear words, and weak ones backed up by them", () => {
    expect(suggestTopics("gig tonight at the corner hotel")).toContain("music");
    expect(suggestTopics("golden hour shot on my new camera")).toEqual(["photography"]);
    expect(suggestTopics("new lens came in the mail")).toEqual(["photography"]);
    expect(suggestTopics("morning run before the marathon")[0]).toBe("fitness");
  });

  it("always honours a hashtag", () => {
    expect(suggestTopics("#photography")).toEqual(["photography"]);
  });

  it("keeps the three strongest", () => {
    expect(suggestTopics("gym, then a hike, then cooking dinner and a gig").length).toBe(3);
  });
});
