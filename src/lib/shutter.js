// What a roll camera's shutter feels and sounds like: a short buzz as the
// button goes down, a two-part mechanical click as the frame is taken, and
// the whirr of the zoom motor, synthesised with Web Audio (no sound files).
// Sounds follow the phone's silent switch on iPhones; everything is skipped
// quietly where unsupported.
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

function noiseFor(ac) {
  if (!noise || noise.sampleRate !== ac.sampleRate) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.1), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// One burst of filtered noise, falling away fast: a blade hitting its stop.
function clack(ac, start, freq, length, volume) {
  const src = ac.createBufferSource();
  src.buffer = noiseFor(ac);
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

/**
 * A small zoom motor into `dest`, from now until the returned stop(): a
 * buzzy tone that spins up, with the ripple of gear teeth and a little
 * grit, which winds down when it stops.
 */
export function whirr(ac, dest) {
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5, t + 0.07);
  const motor = ac.createOscillator();
  motor.type = "sawtooth";
  motor.frequency.setValueAtTime(190, t);
  motor.frequency.exponentialRampToValueAtTime(300, t + 0.22);
  const gears = ac.createOscillator();
  gears.frequency.value = 26;
  const ripple = ac.createGain();
  ripple.gain.value = 14;
  gears.connect(ripple).connect(motor.frequency);
  const grit = ac.createBufferSource();
  grit.buffer = noiseFor(ac);
  grit.loop = true;
  const gritLevel = ac.createGain();
  gritLevel.gain.value = 0.18;
  const tone = ac.createBiquadFilter();
  tone.type = "bandpass";
  tone.frequency.value = 1300;
  tone.Q.value = 0.9;
  motor.connect(tone);
  grit.connect(gritLevel).connect(tone);
  tone.connect(out).connect(dest);
  motor.start(t);
  gears.start(t);
  grit.start(t);
  return () => {
    const e = ac.currentTime;
    out.gain.cancelScheduledValues(e);
    out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), e);
    out.gain.exponentialRampToValueAtTime(0.0001, e + 0.09);
    motor.frequency.cancelScheduledValues(e);
    motor.frequency.setValueAtTime(motor.frequency.value, e);
    motor.frequency.exponentialRampToValueAtTime(140, e + 0.09);
    for (const node of [motor, gears, grit]) node.stop(e + 0.1);
  };
}

const WHIRR_VOLUME = 0.2;

/** The zoom motor's whirr while the zoom moves. Returns a function that stops it. */
export function startWhirr() {
  const ac = audio();
  if (!ac) return () => {};
  try {
    const level = ac.createGain();
    level.gain.value = WHIRR_VOLUME;
    level.connect(ac.destination);
    const stop = whirr(ac, level);
    return () => { try { stop(); } catch { /* closed */ } setTimeout(() => level.disconnect(), 300); };
  } catch {
    return () => {};
  }
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
