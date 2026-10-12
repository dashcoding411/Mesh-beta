import { stampLayout } from "../../lib/stamp";

/**
 * Seven-segment readout, like a digicam's LCD and date stamp: the same LED
 * digits as the stamp baked into photos. `glow` lights it up the way the
 * stamp does, with a soft edge and a wider bleed.
 */
export default function SevenSeg({ text, height = 16, color = "#fff", glow = false }) {
  const { polys, width } = stampLayout(text, height, { stroke: 1.3 });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill={color} className="block overflow-visible"
      style={glow ? { filter: `drop-shadow(0 0 ${Math.max(0.4, height * 0.05)}px ${color}) drop-shadow(0 0 ${height * 0.22}px ${color})` } : undefined}>
      {polys.map((p, i) => <polygon key={i} points={p.join(" ")} />)}
    </svg>
  );
}
