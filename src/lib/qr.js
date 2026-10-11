// QR codes seen by Mesh's cameras: reading them, and recognising Mesh links
// in them (only Mesh's own, so a code can't send someone somewhere else).

const READ_SIDE = 720; // frames are read at this size: plenty for a code on a phone screen

/**
 * Something that reads a QR code from a <video>, resolving to its text or
 * "": the browser's own BarcodeDetector where there is one (Android), else
 * jsQR (iPhones), loaded only now.
 */
export async function qrReader() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue || "";
      }
    } catch { /* fall back to jsQR */ }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const scale = Math.min(1, READ_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data || "";
  };
}

const MESH_HOSTS = ["joinmesh.social", "www.joinmesh.social", "mesh-a293c.web.app", "mesh-a293c.firebaseapp.com"];
const ID = "[A-Za-z0-9_-]{4,64}";
// Mesh's shareable pages, and what the button for each says.
const KINDS = [
  { re: new RegExp(`^/rolls/(${ID})/?$`), label: () => "Join this roll" },
  { re: /^\/@([a-z0-9_]{3,30})\/?$/i, label: (m) => `Open @${m[1].toLowerCase()}` },
  { re: new RegExp(`^/u/(${ID})/?$`), label: () => "Open their profile" },
  { re: new RegExp(`^/p/(${ID})/?$`), label: () => "Open the post" },
  { re: new RegExp(`^/gatherings/(${ID})/?$`), label: () => "Open the gathering" },
  { re: new RegExp(`^/circles/(${ID})/?$`), label: () => "Open the circle" },
  { re: new RegExp(`^/news/(${ID})/?$`), label: () => "Read the story" },
  { re: new RegExp(`^/leaderboard/g/(${ID})/?$`), label: () => "Join the Brick group" },
];

/**
 * The Mesh page a scanned (or pasted) link points to, as { path, label },
 * or null: only Mesh's own hosts and its shareable pages count. A link
 * inside other words ("join my roll https://…") is found.
 */
export function meshLink(text, origin = typeof window !== "undefined" ? window.location.origin : "https://joinmesh.social") {
  const s = String(text || "").trim();
  if (!s) return null;
  const link = s.match(/https?:\/\/\S+/)?.[0] || s;
  let url;
  try { url = new URL(link, origin); } catch { return null; }
  if (!MESH_HOSTS.includes(url.hostname) && url.host !== new URL(origin).host) return null;
  for (const kind of KINDS) {
    const m = url.pathname.match(kind.re);
    if (m) return { path: url.pathname.replace(/\/$/, ""), label: kind.label(m) };
  }
  return null;
}
