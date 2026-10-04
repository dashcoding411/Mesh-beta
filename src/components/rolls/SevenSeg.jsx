import { segmentsFor } from "../../lib/digicam";

/** Seven-segment readout, like a digicam's LCD and date stamp. */
export default function SevenSeg({ text, height = 16, color = "#fff", glow = false }) {
  const w = height * 0.54;
  const t = Math.max(1.6, height * 0.15);
  const gap = height * 0.2;
  const half = height / 2;
  const widthOf = (ch) => (ch === " " ? gap * 1.6 : ch === "'" ? t * 2.2 : w + gap);
  const rects = {
    a: [t * 0.6, 0, w - t * 1.2, t], g: [t * 0.6, half - t / 2, w - t * 1.2, t], d: [t * 0.6, height - t, w - t * 1.2, t],
    f: [0, t * 0.6, t, half - t * 0.9], b: [w - t, t * 0.6, t, half - t * 0.9],
    e: [0, half + t * 0.3, t, half - t * 0.9], c: [w - t, half + t * 0.3, t, half - t * 0.9],
  };
  let x = 0;
  const parts = [];
  [...text].forEach((ch, i) => {
    if (/\d/.test(ch)) for (const s of segmentsFor(ch)) { const [rx, ry, rw, rh] = rects[s]; parts.push(<rect key={`${i}${s}`} x={x + rx} y={ry} width={rw} height={rh} rx={t * 0.3} />); }
    else if (ch === "'") parts.push(<rect key={i} x={x + t * 0.6} y={0} width={t * 0.9} height={height * 0.32} rx={t * 0.3} />);
    x += widthOf(ch);
  });
  return (
    <svg width={x} height={height} viewBox={`0 0 ${x} ${height}`} fill={color} className="block -skew-x-6 overflow-visible"
      style={glow ? { filter: `drop-shadow(0 0 ${height * 0.25}px ${color})` } : undefined}>
      {parts}
    </svg>
  );
}
