// What a roll camera's shutter feels and sounds like: a short buzz as the
// button goes down and a two-part mechanical click as the frame is taken,
// synthesised with Web Audio (no sound file). The click follows the phone's
// silent switch on iPhones; everything is skipped quietly where unsupported.
import { isNativeApp, tap } from "./native";

let ctx = null;
let noise = null;

function audio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Call from the tap itself: browsers only start sound inside one. */
export const wakeShutter = () => { audio(); };

// One burst of filtered noise, falling away fast: a blade hitting its stop.
function clack(ac, start, freq, length, volume) {
  if (!noise) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.1), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(start);
  src.stop(start + length + 0.01);
}

/** The click: the shutter opening, then closing a moment later. */
export function shutterClick() {
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime + 0.005;
    clack(ac, t, 3400, 0.03, 0.55);
    clack(ac, t + 0.07, 1700, 0.06, 0.45);
  } catch { /* closed */ }
}

// iPhones have no vibrate(), but Safari (iOS 18 on) gives a haptic tick when
// a switch-style checkbox is toggled, including by a hidden label's click.
let switchLabel = null;
function switchTick() {
  if (!switchLabel) {
    switchLabel = document.createElement("label");
    switchLabel.setAttribute("aria-hidden", "true");
    switchLabel.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.tabIndex = -1;
    input.setAttribute("switch", "");
    switchLabel.appendChild(input);
    document.body.appendChild(switchLabel);
  }
  switchLabel.click();
}

/** A short buzz as the shutter goes down. Call from the tap itself. */
export function shutterBuzz() {
  if (isNativeApp) return tap();
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(15);
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) switchTick();
  } catch { /* unsupported */ }
}
