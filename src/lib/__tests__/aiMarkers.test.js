import { describe, expect, it } from "vitest";
import { aiMarker, markerIn } from "../aiMarkers.js";

const IRI = "http://cv.iptc.org/newscodes/digitalsourcetype/";
const fileOf = (text, type = "image/jpeg") => new File([new Uint8Array([0xff, 0xd8]), text, new Uint8Array(64)], "x", { type });

describe("AI markers", () => {
  it("spots a generated image's digital source type", () => {
    expect(markerIn(`c2pa.actions ... ${IRI}trainedAlgorithmicMedia ...`)).toBe("generated");
    expect(markerIn(`<Iptc4xmpExt:DigitalSourceType>${IRI}trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>`)).toBe("generated");
  });

  it("treats AI edits of real photos as edits, even with generated ingredients", () => {
    expect(markerIn(`${IRI}compositeWithTrainedAlgorithmicMedia`)).toBe("edited");
    expect(markerIn(`${IRI}algorithmicallyEnhanced`)).toBe("edited");
    expect(markerIn(`${IRI}trainedAlgorithmicMedia ${IRI}compositeWithTrainedAlgorithmicMedia`)).toBe("edited");
  });

  it("recognises Stable Diffusion settings left in a PNG", () => {
    expect(markerIn("parameters\0a cat, Steps: 30, Sampler: Euler a, CFG scale: 7")).toBe("generated");
    expect(markerIn('prompt\0{"3":{"class_type":"KSampler"}}')).toBe("generated");
  });

  it("leaves ordinary photos and camera captures alone", () => {
    expect(markerIn(`Exif Canon ${IRI}digitalCapture`)).toBe("none");
    expect(markerIn("just some bytes, steps and samplers in prose")).toBe("none");
  });

  it("reads markers from a file, and ignores other file types", async () => {
    expect(await aiMarker(fileOf(`${IRI}trainedAlgorithmicMedia`))).toBe("generated");
    expect(await aiMarker(fileOf(`${IRI}compositeWithTrainedAlgorithmicMedia`, "video/mp4"))).toBe("edited");
    expect(await aiMarker(fileOf("nothing here"))).toBe("none");
    expect(await aiMarker(new File(["x"], "a.txt", { type: "text/plain" }))).toBe("none");
  });
});
