import { describe, expect, it } from "vitest";
import { pickCamera } from "../cameras";

const cam = (label, deviceId = label) => ({ kind: "videoinput", label, deviceId });

describe("picking a camera", () => {
  it("on an iPhone Pro, takes the ordinary back lens, not the zoomed-out multi-lens ones", () => {
    const devices = [
      cam("Front Camera"), cam("Back Triple Camera"), cam("Back Dual Wide Camera"),
      cam("Back Ultra Wide Camera"), cam("Back Telephoto Camera"), cam("Back Camera"),
      { kind: "audioinput", label: "iPhone Microphone", deviceId: "mic" },
    ];
    expect(pickCamera(devices, "environment")).toBe("Back Camera");
    expect(pickCamera(devices, "user")).toBe("Front Camera");
  });

  it("on Android, takes the first camera facing the right way", () => {
    const devices = [cam("camera2 1, facing front", "f"), cam("camera2 0, facing back", "b0"), cam("camera2 2, facing back", "b2")];
    expect(pickCamera(devices, "environment")).toBe("b0");
    expect(pickCamera(devices, "user")).toBe("f");
  });

  it("with only a special lens, still uses it rather than nothing", () => {
    expect(pickCamera([cam("Back Dual Wide Camera")], "environment")).toBe("Back Dual Wide Camera");
  });

  it("without names (no permission yet) or a match, leaves it to facingMode", () => {
    expect(pickCamera([{ kind: "videoinput", label: "", deviceId: "x" }], "environment")).toBeNull();
    expect(pickCamera([cam("FaceTime HD Camera")], "environment")).toBeNull();
    expect(pickCamera([cam("FaceTime HD Camera")], "user")).toBe("FaceTime HD Camera");
  });
});
