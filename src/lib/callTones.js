// Call tones synthesised with Web Audio (ringback uses the Australian
// cadence). Silently skipped when autoplay is blocked.

let ctx = null;

function audio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Short ramps avoid clicks.
function burst(ac, out, freqs, start, length, volume) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + length - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(out);
  for (const f of freqs) {
    const osc = ac.createOscillator();
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + length + 0.01);
  }
}

const PATTERNS = {
  // 0.4s on, 0.2s off, 0.4s on, 2s off.
  ringback: { every: 3000, play: (ac, o, t) => { burst(ac, o, [400, 450], t, 0.4, 0.06); burst(ac, o, [400, 450], t + 0.6, 0.4, 0.06); } },
  ring: {
    every: 2200,
    play: (ac, o, t) => {
      burst(ac, o, [659], t, 0.18, 0.12); burst(ac, o, [880], t + 0.2, 0.28, 0.12);
      burst(ac, o, [659], t + 0.6, 0.18, 0.12); burst(ac, o, [880], t + 0.8, 0.28, 0.12);
    },
  },
};

/** Returns a stop function. */
export function startTone(name) {
  const ac = audio();
  const pattern = PATTERNS[name];
  if (!ac || !pattern) return () => {};
  // Shared gain so stopping also silences already-scheduled notes.
  const out = ac.createGain();
  out.connect(ac.destination);
  const tick = () => { try { pattern.play(ac, out, ac.currentTime + 0.05); } catch { /* closed */ } };
  tick();
  const id = setInterval(tick, pattern.every);
  return () => {
    clearInterval(id);
    try { out.gain.setValueAtTime(0, ac.currentTime); setTimeout(() => out.disconnect(), 1500); } catch { /* closed */ }
  };
}

export function endTone() {
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime + 0.02;
    burst(ac, ac.destination, [480], t, 0.15, 0.08);
    burst(ac, ac.destination, [360], t + 0.18, 0.22, 0.08);
  } catch { /* closed */ }
}
