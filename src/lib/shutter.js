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
 * A compact's zoom motor into `dest`: the thin whine of a small motor
 * through its gears, with the teeth ticking softly, and nothing low or
 * buzzy. `speed(f)` (0 to 1, every frame) sets how fast the lens is moving,
 * and the volume, pitch and ticking follow it, so the sound spins up, holds
 * and winds down with the zoom. `stop()` lets it fall silent. Zooming out
 * runs a little lower, as a motor does the other way under load.
 */
export function whirr(ac, dest, { out: outward = false } = {}) {
  const t = ac.currentTime;
  const base = outward ? 1220 : 1300;
  const level = ac.createGain();
  level.gain.setValueAtTime(0, t);
  const low = ac.createBiquadFilter(); // nothing low enough to buzz
  low.type = "highpass";
  low.frequency.value = 700;
  const soft = ac.createBiquadFilter(); // and no piercing top
  soft.type = "lowpass";
  soft.frequency.value = 5200;
  low.connect(soft).connect(level).connect(dest);

  // The whine: a soft tone and a quieter one a fifth above, a hair out of
  // tune so they shimmer, wavering slightly as the load changes.
  const tone = ac.createOscillator();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(base * 0.7, t);
  const fifth = ac.createOscillator();
  fifth.frequency.setValueAtTime(base * 0.7 * 1.5 + 2, t);
  const waver = ac.createOscillator();
  waver.frequency.value = 4.5;
  const waverDepth = ac.createGain();
  waverDepth.gain.value = 9;
  waver.connect(waverDepth);
  waverDepth.connect(tone.frequency);
  waverDepth.connect(fifth.frequency);
  const toneLevel = ac.createGain();
  toneLevel.gain.value = 0.5;
  const fifthLevel = ac.createGain();
  fifthLevel.gain.value = 0.16;
  tone.connect(toneLevel).connect(low);
  fifth.connect(fifthLevel).connect(low);

  // The gears: a fine hiss, ticking as the teeth mesh.
  const grit = ac.createBufferSource();
  grit.buffer = noiseFor(ac);
  grit.loop = true;
  const gritBand = ac.createBiquadFilter();
  gritBand.type = "bandpass";
  gritBand.frequency.value = 3600;
  gritBand.Q.value = 1.2;
  const gears = ac.createGain();
  gears.gain.value = 0.1;
  const teeth = ac.createOscillator();
  teeth.frequency.setValueAtTime(7, t);
  const teethDepth = ac.createGain();
  teethDepth.gain.value = 0.08;
  teeth.connect(teethDepth).connect(gears.gain);
  grit.connect(gritBand).connect(gears).connect(low);

  const nodes = [tone, fifth, waver, grit, teeth];
  for (const node of nodes) node.start(t);
  return {
    speed(f) {
      const now = ac.currentTime;
      const v = Math.max(0, Math.min(1, f));
      level.gain.setTargetAtTime(v, now, 0.04);
      tone.frequency.setTargetAtTime(base * (0.7 + 0.3 * v), now, 0.05);
      fifth.frequency.setTargetAtTime(base * (0.7 + 0.3 * v) * 1.5 + 2, now, 0.05);
      teeth.frequency.setTargetAtTime(7 + 9 * v, now, 0.05);
    },
    stop() {
      const now = ac.currentTime;
      level.gain.cancelScheduledValues(now);
      level.gain.setTargetAtTime(0, now, 0.03);
      for (const node of nodes) node.stop(now + 0.25);
    },
  };
}

const WHIRR_VOLUME = 0.22;
const SILENT = { speed() {}, stop() {} };

/** The zoom motor's sound while the zoom moves: { speed(f), stop() } (see whirr). */
export function startWhirr({ out = false } = {}) {
  const ac = audio();
  if (!ac) return SILENT;
  try {
    const volume = ac.createGain();
    volume.gain.value = WHIRR_VOLUME;
    volume.connect(ac.destination);
    const motor = whirr(ac, volume, { out });
    return {
      speed: (f) => { try { motor.speed(f); } catch { /* closed */ } },
      stop: () => { try { motor.stop(); } catch { /* closed */ } setTimeout(() => volume.disconnect(), 400); },
    };
  } catch {
    return SILENT;
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
