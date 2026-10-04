export const cameraSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** A camera stream facing `facing` ("user" or "environment"), preferring the plain lens. */
export async function openStream(facing, audio = false, size = { width: { ideal: 1920 }, height: { ideal: 1080 } }) {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const id = pickCamera(devices, facing);
  const byFacing = { facingMode: { ideal: facing }, ...size };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id }, ...size } : byFacing, audio });
  } catch (err) {
    if (!id || err?.name === "NotAllowedError") throw err;
    return navigator.mediaDevices.getUserMedia({ video: byFacing, audio });
  }
}

// facingMode: "environment" can select an iPhone virtual multi-lens camera
// that starts on the ultra-wide lens. Once labels are available (after the
// first permission grant), prefer the plain lens by name.
export function pickCamera(devices, facing) {
  const cams = devices.filter((d) => d.kind === "videoinput" && d.label);
  const wanted = facing === "user" ? /front|user|facetime|selfie/i : /back|rear|environment/i;
  const special = /ultra|wide|tele|dual|triple|depth|infrared|\bir\b|virtual/i;
  const matches = cams.filter((d) => wanted.test(d.label));
  return (matches.find((d) => !special.test(d.label)) || matches[0])?.deviceId || null;
}
