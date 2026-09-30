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
