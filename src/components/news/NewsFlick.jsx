import { useEffect, useRef, useState } from "react";
import { ExternalLink, EyeOff, Newspaper, Pause, Play, Timer, Volume2, VolumeX } from "lucide-react";
import { recordNewsRead } from "../../lib/db";
import { outletOf, useJournalist } from "../../lib/journalists";
import { followLink } from "../../lib/links";
import { markStoryRead } from "../../lib/newsBrief";
import { navigate } from "../../lib/router";
import { newsTopicById } from "../../lib/interests";
import { useShell } from "../shell/ShellContext";
import { VerifiedTick } from "../ui/Badges";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { KindBadge } from "./parts";
import { hostOf, quickPoints } from "./text";

/** A journalist's video story in the Flicks player: the video is the article, with the 60-second brief a tap away. */
export default function NewsFlick({ story, index, total, muted, onToggleSound }) {
  const box = useRef(null);
  const video = useRef(null);
  const [near, setNear] = useState(index < 2);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [brief, setBrief] = useState(false);
  const [revealed, setRevealed] = useState(!story.graphic);
  const counted = useRef(false);
  const journalist = useJournalist(story.authorId);
  const year = useShell()?.profile?.birthYear;
  const minor = year > 0 && new Date().getFullYear() - year < 18;
  const topic = newsTopicById(story.topic);
  const username = (story.authorNames || [story.authorName])[0];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const nearIO = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "100% 0px" });
    const activeIO = new IntersectionObserver(([e]) => setActive(e.intersectionRatio >= 0.7), { threshold: [0, 0.7] });
    nearIO.observe(el);
    activeIO.observe(el);
    return () => { nearIO.disconnect(); activeIO.disconnect(); };
  }, []);

  // Unload far-away sources to free hardware decoders.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (near && revealed && !el.getAttribute("src")) {
      el.setAttribute("src", story.videoUrl);
      el.load();
    } else if (!near && el.getAttribute("src")) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [near, revealed, story.videoUrl]);

  useEffect(() => {
    const el = video.current;
    if (!el || !revealed) return;
    if (active) el.play().catch(() => {}); else el.pause();
  }, [active, revealed]);

  useEffect(() => { if (video.current) video.current.muted = muted; }, [muted]);

  // Watching most of it counts as reading the story, once.
  const onTime = () => {
    const el = video.current;
    if (!el || !(el.duration > 0)) return;
    const p = Math.min(1, el.currentTime / el.duration);
    setProgress(p);
    if (!counted.current && p >= 0.8) {
      counted.current = true;
      markStoryRead(story.id);
      recordNewsRead(story).catch(() => {});
    }
  };

  const togglePlay = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };

  const openBrief = () => { video.current?.pause(); setBrief(true); };

  return (
    <section ref={box} aria-roledescription="News Flick" aria-label={`${index + 1} of ${total}: news from @${username}, ${story.title}`}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center md:py-4">
      <div className="relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:h-full md:w-auto md:max-w-full md:rounded-card">
        <video ref={video} muted={muted} loop playsInline preload="none" poster={revealed ? story.videoPoster || undefined : undefined}
          aria-label={`Video: ${story.title}`} onTimeUpdate={onTime} onClick={togglePlay}
          onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
          className="h-full w-full cursor-pointer object-contain" />

        {!revealed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 p-6 text-center text-fg">
            <EyeOff size={28} className="text-fg-muted" aria-hidden="true" />
            <p className="text-callout font-semibold">Graphic content</p>
            <p className="text-caption text-fg-muted">This may show violence or injury.</p>
            {minor ? (
              <p className="text-caption text-fg-subtle">Hidden for under-18 accounts.</p>
            ) : (
              <button type="button" onClick={() => setRevealed(true)}
                className="press mt-1 min-h-9 rounded-full bg-surface-3 px-4 text-callout font-semibold text-fg">Show</button>
            )}
          </div>
        )}

        {revealed && (
          <div className="absolute right-2 top-[calc(64px+env(safe-area-inset-top))] flex flex-col gap-2 md:top-3">
            <button type="button" onClick={onToggleSound} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}
              className="press flex h-11 items-center gap-1.5 rounded-full bg-black/45 px-3 text-caption font-semibold text-white backdrop-blur">
              {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
              {muted && <span>Tap for sound</span>}
            </button>
            <button type="button" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}
              className="press flex h-11 w-11 items-center justify-center self-end rounded-full bg-black/45 text-white backdrop-blur">
              {paused ? <Play size={18} fill="currentColor" aria-hidden="true" /> : <Pause size={18} fill="currentColor" aria-hidden="true" />}
            </button>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-5 pt-28">
          <div className="pointer-events-auto text-white">
            <p className="flex min-w-0 items-center gap-1.5 text-caption font-semibold">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-label font-bold uppercase tracking-wider text-black">
                <Newspaper size={12} aria-hidden="true" /> News
              </span>
              {topic && <span className="shrink-0 uppercase tracking-wider text-white/80">{topic.label}</span>}
              <KindBadge id={story.label} />
            </p>
            <button type="button" onClick={() => navigate(`/news/${story.id}`)}
              className="mt-2 block text-left font-display text-title-3 leading-snug text-white hover:underline">
              {story.title}
            </button>
            <p className="mt-1 truncate text-caption text-white/75">
              @{username}
              {journalist && <VerifiedTick size={12} label="Verified journalist" className="ml-0.5 align-[-2px]" />}
              {` · ${outletOf(journalist)}`}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={openBrief}
                className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-callout font-semibold text-black">
                <Timer size={16} aria-hidden="true" /> 60-sec brief
              </button>
              <button type="button" onClick={() => navigate(`/news/${story.id}`)}
                className="press inline-flex min-h-9 items-center rounded-full bg-white/20 px-3.5 text-callout font-semibold text-white backdrop-blur">
                Full story
              </button>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20" aria-hidden="true">
          <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {brief && <BriefSheet story={story} onClose={() => setBrief(false)} />}
    </section>
  );
}

function BriefSheet({ story, onClose }) {
  const sources = (story.sources || []).filter(Boolean);
  return (
    <Dialog title="The 60-second version" onClose={onClose}
      footer={<Button variant="primary" full onClick={() => { onClose(); navigate(`/news/${story.id}`); }}>Full story</Button>}>
      <p className="font-display text-title-3 leading-snug">{story.title}</p>
      <ul className="mt-3 space-y-2">
        {quickPoints(story).map((k, i) => (
          <li key={i} className="flex gap-2 text-callout text-fg">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text" aria-hidden="true" />{k}
          </li>
        ))}
      </ul>
      {sources.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-label font-semibold uppercase tracking-wider text-fg-subtle">Sources</p>
          <ol className="space-y-1.5">
            {sources.map((s, i) => (
              <li key={i}>
                <a href={s} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => followLink(s, e)}
                  className="press flex min-h-11 items-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-callout font-semibold text-fg hover:bg-surface-3">
                  <span className="w-5 shrink-0 text-caption text-fg-subtle tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{hostOf(s)}</span>
                  <ExternalLink size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </Dialog>
  );
}
