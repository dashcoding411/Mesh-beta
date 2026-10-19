import { useEffect, useMemo, useState } from "react";
import { BrickWall, Download, Share2 } from "lucide-react";
import { fetchWeekRecap, recapRows } from "../lib/db";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import TopBar from "./shell/TopBar";
import Button from "./ui/Button";
import { ErrorState, Skeleton } from "./ui/States";
import { useToast } from "./ui/toast-context";

const SIZE = { w: 1080, h: 1350 }; // 4:5, like a post

function rangeLabel(start, end) {
  const f = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return f(start) === f(end) ? `Today, ${f(end)}` : `${f(start)} to ${f(end)}`;
}

/** "Your week on Mesh": a Monday-to-now recap you can save or share as an image. */
export default function WeekRecap() {
  const { profile } = useShell();
  const toast = useToast();
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(false);
    fetchWeekRecap().then(setRecap).catch(() => setError(true));
  };
  useEffect(load, []);

  const rows = useMemo(() => (recap ? recapRows(recap) : []), [recap]);
  const range = recap ? rangeLabel(recap.start, recap.end) : "";

  const image = async () => {
    const blob = await drawRecap({ rows, range, handle: profile?.username });
    return new File([blob], "my-week-on-mesh.png", { type: "image/png" });
  };

  const save = async () => {
    setBusy(true);
    try {
      const file = await image();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast({ tone: "error", title: "Couldn't make the image" }); }
    finally { setBusy(false); }
  };

  const share = async () => {
    setBusy(true);
    try {
      const file = await image();
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "My week on Mesh" });
      else { setBusy(false); return save(); }
    } catch (err) {
      if (err?.name !== "AbortError") toast({ tone: "error", title: "Couldn't share the image", body: "Save it instead, then share it from your photos." });
    } finally { setBusy(false); }
  };

  return (
    <>
      <TopBar back backTo="/account/brick" desktop title={<p className="truncate text-title-3">Your week</p>} />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md px-4 pb-16 pt-5">
          {error && <ErrorState title="Couldn't put your week together" onRetry={load} />}
          {!error && !recap && <Skeleton className="aspect-[4/5] w-full !rounded-card" />}
          {recap && (
            <>
              <RecapCard rows={rows} range={range} handle={profile?.username} />
              <div className="mt-4 flex gap-2">
                <Button variant="primary" icon={Share2} className="flex-1" loading={busy} onClick={share}>Share</Button>
                <Button icon={Download} className="flex-1" disabled={busy} onClick={save}>Save image</Button>
              </div>
              <p className="mt-4 text-caption text-fg-subtle">
                Monday to now. Counted on this device only.
              </p>
              <button type="button" onClick={() => navigate("/account/brick")}
                className="press mt-5 flex min-h-14 w-full items-center gap-3 rounded-card border border-line bg-surface px-4 text-left hover:border-line-strong">
                <BrickWall size={18} className="shrink-0 text-accent-text" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-callout font-semibold">Want less time next week?</span>
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const CARD_BG = "radial-gradient(120% 80% at 100% 0%, rgba(232,121,249,.35), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(167,139,250,.35), transparent 60%), #18181c";

function RecapCard({ rows, range, handle }) {
  return (
    <figure aria-label={`Your week on Mesh, ${range}`} className="aspect-[4/5] w-full rounded-card p-6 text-white shadow-overlay"
      style={{ background: CARD_BG }}>
      <div className="flex h-full flex-col">
        <p className="font-display text-title-3 font-extrabold tracking-tight">Mesh</p>
        <p className="mt-6 font-display text-title-1 font-extrabold leading-tight">My week on Mesh</p>
        <p className="mt-1 text-callout text-white/70">{range}</p>
        <dl className="mt-6 grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-4">
          {rows.map((r, i) => (
            <div key={r.label} className={`min-w-0 ${i === 0 ? "col-span-2" : ""}`}>
              <dt className="text-caption font-semibold uppercase tracking-wider text-white/60">{r.label}</dt>
              <dd className={`${i === 0 ? "text-title-1" : "text-title-3"} font-bold leading-tight`}>{r.value}</dd>
              {r.note && <dd className="truncate text-caption text-white/70">{r.note}</dd>}
            </div>
          ))}
        </dl>
        <p className="flex items-end justify-between text-caption text-white/70">
          <span>{handle ? `@${handle}` : ""}</span>
          <span className="text-right"><span className="block font-semibold text-white">joinmesh.social</span>Get bored again.</span>
        </p>
      </div>
    </figure>
  );
}

// The same card, drawn at 1080 x 1350 for saving and sharing.
async function drawRecap({ rows, range, handle }) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const c = canvas.getContext("2d");
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  await document.fonts?.ready;

  c.fillStyle = "#18181c";
  c.fillRect(0, 0, SIZE.w, SIZE.h);
  const glow = (x, y, r, color) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(24,24,28,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE.w, SIZE.h);
  };
  glow(SIZE.w, 0, 900, "rgba(232,121,249,0.38)");
  glow(0, SIZE.h, 850, "rgba(167,139,250,0.38)");

  const pad = 88;
  const text = (s, x, y, size, weight = 400, color = "#fff", align = "left") => {
    c.font = `${weight} ${size}px ${font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(s, x, y);
  };
  const fit = (s, size, weight, max) => {
    c.font = `${weight} ${size}px ${font}`;
    let out = s;
    while (out.length > 1 && c.measureText(out).width > max) out = out.slice(0, -2);
    return out === s ? s : `${out.trimEnd()}…`;
  };

  text("Mesh", pad, 140, 52, 800);
  text("My week on Mesh", pad, 290, 84, 800);
  text(range, pad, 350, 40, 400, "rgba(255,255,255,0.72)");

  // Time on Mesh across the top, then the rest two to a row.
  const [first, ...rest] = rows;
  const full = SIZE.w - pad * 2;
  text(first.label.toUpperCase(), pad, 460, 28, 600, "rgba(255,255,255,0.6)");
  text(fit(first.value, 84, 800, full), pad, 548, 84, 800);
  if (first.note) text(fit(first.note, 32, 400, full), pad, 596, 32, 400, "rgba(255,255,255,0.72)");
  const gap = 40;
  const col = (full - gap) / 2;
  rest.forEach((r, i) => {
    const x = pad + (i % 2) * (col + gap);
    const y = 690 + Math.floor(i / 2) * 170;
    text(r.label.toUpperCase(), x, y, 26, 600, "rgba(255,255,255,0.6)");
    text(fit(r.value, 52, 700, col), x, y + 62, 52, 700);
    if (r.note) text(fit(r.note, 28, 400, col), x, y + 102, 28, 400, "rgba(255,255,255,0.72)");
  });

  if (handle) text(`@${handle}`, pad, SIZE.h - 96, 34, 500, "rgba(255,255,255,0.72)");
  text("joinmesh.social", SIZE.w - pad, SIZE.h - 136, 38, 700, "#fff", "right");
  text("Get bored again.", SIZE.w - pad, SIZE.h - 90, 32, 400, "rgba(255,255,255,0.72)", "right");

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}
