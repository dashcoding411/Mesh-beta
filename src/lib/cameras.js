// Choosing a camera by name, for calls. Kept apart from the call code so it
// can be tested without Firebase.

/* Which camera to open. Asking only for "the back camera" lets iPhones pick
   a virtual multi-lens camera (Dual Wide, Triple) that starts on the
   ultra-wide lens, so the picture jumps to a zoomed-out view. So once the
   cameras have names (after the first permission), pick the ordinary lens
   by name: "Back Camera", "Front Camera", or Android's "facing back". */
export function pickCamera(devices, facing) {
  const cams = devices.filter((d) => d.kind === "videoinput" && d.label);
  const wanted = facing === "user" ? /front|user|facetime|selfie/i : /back|rear|environment/i;
  const special = /ultra|wide|tele|dual|triple|depth|infrared|\bir\b|virtual/i;
  const matches = cams.filter((d) => wanted.test(d.label));
  return (matches.find((d) => !special.test(d.label)) || matches[0])?.deviceId || null;
}
