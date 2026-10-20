import { isCloudMedia, uploadMedia } from "./data/uploads.js";

/** Length of a local video file in seconds, or 0 if the browser can't tell. */
export function readDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const url = URL.createObjectURL(file);
    const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    v.src = url;
  });
}

// A JPEG of the frame at `at` seconds, used as the video's thumbnail. Phones
// (iPhones especially) show no frame for an unplayed video without one.
function capturePoster(file, at) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (blob) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    setTimeout(() => done(null), 8000);
    v.onloadeddata = () => { v.currentTime = Math.min(at, Math.max(0, (v.duration || 1) - 0.1)); };
    v.onseeked = () => {
      const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight, 1));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      if (!c.width || !c.height) return done(null);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(done, "image/jpeg", 0.82);
    };
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** Uploads a still from the video. Best effort: "" if it can't, and the video still works. */
export async function uploadPoster(file, at) {
  try {
    const blob = await capturePoster(file, at);
    if (!blob) return "";
    const { url } = await uploadMedia(new File([blob], "poster.jpg", { type: "image/jpeg" }), undefined, "posters");
    return url.startsWith("https://firebasestorage.googleapis.com/") || isCloudMedia(url) ? url : "";
  } catch {
    return "";
  }
}
