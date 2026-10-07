import { useCallback, useEffect, useRef, useState } from "react";
import { cameraSupported, openStream } from "./cameras";

/**
 * A live camera for a viewfinder <video> (`videoRef`), made to hold up on
 * iPhones, M.A.T.H especially:
 * - if asking for the camera with the microphone fails (refused, or busy),
 *   it asks for the camera alone, so photos (and silent video) still work;
 * - if the phone ends the camera (another app took it, or Mesh went to the
 *   background), it starts again when Mesh is back on screen;
 * - `frameReady()`, called first thing in a shutter tap, restarts a stalled
 *   preview (a tap may start playback when nothing else can) and waits
 *   briefly for a picture, so a shot is never taken from an empty frame.
 * `problem` is the browser's error name, shown as a code when it fails.
 * `size` is compared by value.
 */
export function useCamera({ facing, audio = false, size = null, active = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState(0);
  const sizeKey = JSON.stringify(size);
  // Each opening is keyed, so a new one (flip, retry) reads "starting" until it answers.
  const key = `${facing}|${audio}|${sizeKey}|${attempt}`;
  const [result, setResult] = useState({ key: "", status: "", problem: "", hasAudio: false });
  const status = !cameraSupported() ? "unavailable" : result.key === key ? result.status : "starting"; // starting | live | denied | unavailable

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!active || !cameraSupported()) return undefined;
    let alive = true;
    const wanted = JSON.parse(sizeKey) || undefined;
    openStream(facing, audio, wanted)
      .catch((err) => {
        if (!audio) throw err;
        return openStream(facing, false, wanted);
      })
      .then(async (stream) => {
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (alive && document.visibilityState === "visible") retry();
        });
        const el = videoRef.current;
        if (el) { el.srcObject = stream; await el.play().catch(() => {}); }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!alive) return;
        setCameras(devices.filter((d) => d.kind === "videoinput").length);
        setResult({ key, status: "live", problem: "", hasAudio: stream.getAudioTracks().length > 0 });
      })
      .catch((err) => {
        if (!alive) return;
        const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        setResult({ key, status: denied ? "denied" : "unavailable", problem: err?.name || "Error", hasAudio: false });
      });
    return () => { alive = false; stop(); };
  }, [key, facing, audio, sizeKey, active, stop, retry]);

  // Back on screen: start again if the phone ended the camera, else carry on playing.
  useEffect(() => {
    if (!active) return undefined;
    const onShow = () => {
      if (document.visibilityState !== "visible" || !streamRef.current) return;
      if (streamRef.current.getVideoTracks().some((t) => t.readyState === "ended")) retry();
      else videoRef.current?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [active, retry]);

  const frameReady = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return false;
    if (el.paused) await el.play().catch(() => {});
    if (el.videoWidth && el.readyState >= 2) return true;
    await new Promise((resolve) => {
      const done = () => { el.removeEventListener("loadeddata", done); resolve(); };
      el.addEventListener("loadeddata", done);
      setTimeout(done, 1500);
    });
    return el.videoWidth > 0 && el.readyState >= 2;
  }, []);

  const problem = result.key === key ? result.problem : "";
  return { videoRef, streamRef, status, problem, cameras, hasAudio: result.hasAudio, retry, stop, frameReady };
}
