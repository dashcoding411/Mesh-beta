import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 60;
export const BARS = 40;

export const voiceSupported = () =>
  typeof window !== "undefined" && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
  return options.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
}

// ~24 kbps speech recording with a 10Hz level meter; auto-stops at MAX_VOICE_SECONDS.
export function useVoiceRecorder() {
  const [state, setState] = useState("idle"); // idle | recording
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState([]);
  const r = useRef({});

  const cleanup = useCallback(() => {
    const x = r.current;
    clearInterval(x.tick);
    x.stream?.getTracks().forEach((t) => t.stop());
    x.ctx?.close().catch(() => {});
    r.current = {};
    setState("idle");
    setSeconds(0);
    setLevels([]);
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const samples = [];
    const began = Date.now();
    const tick = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      samples.push(Math.min(1, Math.sqrt(sum / buf.length) * 3));
      setLevels(samples.slice(-BARS));
      const s = (Date.now() - began) / 1000;
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS) r.current.autoStop?.();
    }, 100);
    rec.start(250);
    r.current = { stream, rec, chunks, ctx, tick, samples, began, mimeType: rec.mimeType || mimeType };
    setState("recording");
  }, []);

  /** Resolves to { blob, duration, peaks } (40 bars, 0–100). */
  const stop = useCallback(() => new Promise((resolve) => {
    const x = r.current;
    if (!x.rec) return resolve(null);
    x.rec.onstop = () => {
      const duration = Math.min(MAX_VOICE_SECONDS, (Date.now() - x.began) / 1000);
      const blob = new Blob(x.chunks, { type: x.mimeType || "audio/webm" });
      const s = x.samples;
      const peaks = Array.from({ length: BARS }, (_, i) => {
        const slice = s.slice(Math.floor((i * s.length) / BARS), Math.floor(((i + 1) * s.length) / BARS));
        return Math.round((slice.length ? Math.max(...slice) : 0) * 100);
      });
      cleanup();
      resolve({ blob, duration, peaks });
    };
    x.rec.stop();
  }), [cleanup]);

  const cancel = useCallback(() => {
    const x = r.current;
    if (x.rec && x.rec.state !== "inactive") { x.rec.onstop = null; x.rec.stop(); }
    cleanup();
  }, [cleanup]);

  useEffect(() => () => cancel(), [cancel]);

  return { state, seconds, levels, start, stop, cancel, setAutoStop: (fn) => { r.current.autoStop = fn; } };
}

