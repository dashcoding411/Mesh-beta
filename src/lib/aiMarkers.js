// Mesh allows AI edits of real photos (a new background, an object taken out)
// but not pictures or videos an AI made from scratch. Most AI tools say which
// in the file itself: C2PA Content Credentials and IPTC metadata carry a
// "digital source type" (trainedAlgorithmicMedia for generated,
// compositeWithTrainedAlgorithmicMedia for AI edits), and Stable Diffusion
// tools leave their settings in PNG text. This reads those markers on the
// device, from the original file, before it's shrunk or uploaded. Stripped
// metadata gets past it, so reports and strikes back it up.

const IPTC = "digitalsourcetype/";
const EDITED = ["compositeWithTrainedAlgorithmicMedia", "algorithmicallyEnhanced", "compositeSynthetic"];
const GENERATED = ["trainedAlgorithmicMedia"];
// Image generators that write their settings into the file.
const GENERATOR_TRACES = [
  ["Steps: ", "Sampler: ", "CFG scale: "], // AUTOMATIC1111 / Forge "parameters"
  ['"class_type"', "KSampler"], // ComfyUI "prompt" / "workflow"
  ["NovelAI"],
];

// Markers sit in headers, but MP4s can keep metadata at the end.
const SCAN = 4 * 1024 * 1024;

async function headAndTail(file) {
  const parts = [file.slice(0, SCAN)];
  if (file.size > SCAN) parts.push(file.slice(Math.max(SCAN, file.size - SCAN)));
  const buffers = await Promise.all(parts.map((p) => p.arrayBuffer()));
  // latin1 maps every byte to one character, so ASCII markers survive.
  return buffers.map((b) => new TextDecoder("latin1").decode(b)).join("\n");
}

/** "generated", "edited" or "none" for the markers in `text`. */
export function markerIn(text) {
  const types = [...text.matchAll(/digitalsourcetype\/([A-Za-z]+)/gi)].map((m) => m[1]);
  // An edit's history can mention generated ingredients; the edit wins.
  if (types.some((t) => EDITED.some((e) => e.toLowerCase() === t.toLowerCase()))) return "edited";
  if (types.some((t) => GENERATED.some((g) => g.toLowerCase() === t.toLowerCase()))) return "generated";
  if (GENERATOR_TRACES.some((all) => all.every((s) => text.includes(s)))) return "generated";
  return "none";
}

/** What a photo or video's own metadata says about AI. Never throws. */
export async function aiMarker(file) {
  if (!file?.type || !(file.type.startsWith("image/") || file.type.startsWith("video/"))) return "none";
  try {
    const text = await headAndTail(file);
    if (!text.includes(IPTC) && !text.includes("Steps: ") && !text.includes("class_type") && !text.includes("NovelAI")) return "none";
    return markerIn(text);
  } catch {
    return "none";
  }
}
