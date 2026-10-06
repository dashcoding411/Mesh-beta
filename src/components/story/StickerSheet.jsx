import { useState } from "react";
import { X } from "lucide-react";
import { gifsEnabled } from "../../lib/gifs";
import { infoLabel } from "../../lib/storyCanvas";
import SevenSeg from "../rolls/SevenSeg";

const EMOJI = [
  "😂", "😍", "🥹", "😭", "🔥", "❤️", "💀", "✨", "🎉", "🥳", "😎", "🤯", "😴", "🤔", "🙃", "😅",
  "👀", "💯", "🙌", "👏", "🫶", "💜", "🖤", "🤍", "☕", "🍕", "🍔", "🌮", "🍜", "🍦", "🍻", "🥂",
  "🎶", "🎧", "🎸", "📚", "✏️", "🏖️", "🌅", "🌧️", "☀️", "🌙", "⭐", "🌈", "🐶", "🐱", "🦘", "🐨",
  "🏉", "⚽", "🏀", "🚗", "✈️", "📍", "🎂", "🎓", "💪", "🧠", "🫠", "😤", "🥲", "🤝", "👋", "🙏",
];

/** Stickers for a story: emoji, the time and date, a digicam date stamp, and GIFs. */
export default function StickerSheet({ onPick, onGif, onClose }) {
  const [tab, setTab] = useState("emoji");
  const [now] = useState(() => new Date());
  const tabs = [["emoji", "Emoji"], ["info", "Stickers"], ...(gifsEnabled ? [["gif", "GIFs"]] : [])];
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Add a sticker" className="max-h-[70%] overflow-hidden rounded-t-sheet bg-[#18181c] pb-safe text-white anim-sheet">
        <div className="flex items-center gap-1 px-3 pt-3">
          <div role="tablist" aria-label="Sticker kinds" className="flex flex-1 gap-1">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id}
                onClick={() => (id === "gif" ? onGif() : setTab(id))}
                className={`min-h-9 rounded-full px-4 text-callout font-semibold ${tab === id ? "bg-white text-black" : "text-white/80 hover:bg-white/10"}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close stickers" className="press flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-3">
          {tab === "emoji" && (
            <ul className="grid grid-cols-8 gap-1">
              {EMOJI.map((e) => (
                <li key={e}>
                  <button type="button" onClick={() => onPick({ type: "emoji", char: e })} aria-label={`Add ${e}`}
                    className="press flex aspect-square w-full items-center justify-center rounded-control text-[1.75rem] hover:bg-white/10">
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === "info" && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[["time", "The time"], ["date", "Today's date"], ["stamp", "Date stamp"]].map(([kind, name]) => (
                <li key={kind}>
                  <button type="button" onClick={() => onPick({ type: "info", kind, label: infoLabel(kind, now) })}
                    className="press flex h-24 w-full flex-col items-center justify-center gap-2 rounded-card bg-white/5 hover:bg-white/10">
                    {kind === "stamp" ? (
                      <SevenSeg text={infoLabel("stamp", now)} height={20} color="#ff9b2f" glow />
                    ) : (
                      <span className="rounded-[10px] bg-white px-3 py-1 font-display text-callout font-extrabold text-[#111114]">{infoLabel(kind, now)}</span>
                    )}
                    <span className="text-caption text-white/70">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
