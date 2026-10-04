import { Aperture, BrickWall, CalendarDays, Fingerprint, Lock, MessageCircle, Newspaper, ShieldCheck, Sprout } from "lucide-react";
import { authPath, navigate } from "../lib/router";
import { DOCUMENT_TITLES } from "../legal/titles.js";
import { LogoMark } from "./shell/Sidebar";
import Button from "./ui/Button";
import SevenSeg from "./rolls/SevenSeg";

const PILLARS = [
  { icon: Fingerprint, title: "Made by humans",
    body: "AI-generated photos and videos aren't allowed. Editing your own photos is fine. Fakes aren't." },
  { icon: Newspaper, title: "Real news",
    body: "Mesh News is written by journalists whose identity is verified. Every story cites its sources, and corrections stay on the story.",
    link: { label: "Read the news", to: "/news" } },
  { icon: CalendarDays, title: "Mesh together",
    body: "Circles are communities with their own rules. Gatherings get you off your phone: runs, dinners, gigs, study sessions.",
    link: { label: "See what's on", to: "/whats-on" } },
  { icon: ShieldCheck, title: "Hate stopped at the door",
    body: "Slurs and attacks are stopped before they post, not after they spread. Every block can be appealed to a person." },
  { icon: Sprout, title: "Not greedy",
    body: "Ads are labelled and never track what you do. Your data is never sold. Safety tools are never paid extras." },
];

const NEVER = [
  "Sell your data",
  "Target ads by tracking you",
  "Let you skip your own limits",
  "Allow AI-generated photos or videos",
  "Charge for safety tools",
  "Let AI decide your appeal",
];

/**
 * The front door for people who haven't used Mesh: what it is and why, then
 * sign up or look around. Shown at /welcome, and at / the first time a
 * signed-out visitor arrives.
 */
export default function Welcome({ signedIn, onBrowse }) {
  const signUp = () => navigate(authPath("signup"));
  const logIn = () => navigate(authPath("login"));

  const cta = (where) => (
    <div className={`flex flex-wrap items-center gap-3 ${where === "hero" ? "mt-8" : "mt-6 justify-center"}`}>
      {signedIn ? (
        <Button variant="primary" size="lg" onClick={onBrowse}>Back to Mesh</Button>
      ) : (
        <>
          <Button variant="primary" size="lg" onClick={signUp}>Sign up, it's free</Button>
          <Button variant="secondary" size="lg" onClick={onBrowse}>Look around first</Button>
        </>
      )}
    </div>
  );

  return (
    <div className="h-dvh overflow-y-auto bg-canvas text-fg" data-scroll>
      <header className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 pt-safe md:px-6">
        <LogoMark size={30} />
        <span className="font-display text-title-2 font-extrabold tracking-tight">Mesh</span>
        <span className="flex-1" />
        {!signedIn && <Button variant="ghost" onClick={logIn}>Log in</Button>}
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-10 md:px-6 md:pt-16">
          <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div>
              <h1 className="font-display text-[clamp(2.4rem,7vw,4.2rem)] font-extrabold leading-[1.02] tracking-tight">
                Social media for humans.
              </h1>
              <p className="mt-3 font-display text-title-1 font-bold text-accent-text">Get bored again.</p>
              <p className="mt-5 max-w-xl text-body text-fg-muted">
                A shared disposable camera for every night out, real news, and an app that knows when to stop.
              </p>
              {cta("hero")}
              <p className="mt-5 text-caption text-fg-subtle">16+ · Made in Brisbane · In beta, so things may change</p>
            </div>
            <RollsDemo />
          </div>
        </section>

        <section aria-labelledby="rolls-h" className="border-y border-line bg-[#111114] text-white">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 md:grid-cols-[auto_1fr] md:px-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-control bg-[#ff9b2f] text-black" aria-hidden="true">
              <Aperture size={24} />
            </span>
            <div>
              <h2 id="rolls-h" className="font-display text-title-1">Rolls: everyone shoots, nobody looks</h2>
              <p className="mt-3 max-w-2xl text-body text-white/75">
                Start a roll for a party, a trip or O-Week and send the link. Everyone gets 27 shots on one shared camera, with a
                2000s digicam look and no previews. At 9am the next morning it develops, and everyone wakes up to every photo from the night.
              </p>
              <p className="mt-3 flex items-center gap-2 text-callout font-medium">
                <Fingerprint size={16} className="text-[#ff9b2f]" aria-hidden="true" /> Camera only, so every photo is real.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="scroll-h" className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:px-6">
            <div>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-control bg-accent-soft text-accent-text" aria-hidden="true">
                <BrickWall size={24} />
              </span>
              <h2 id="scroll-h" className="font-display text-title-1">You control the scroll</h2>
              <p className="mt-3 max-w-2xl text-body text-fg-muted">
                Pick a daily limit when you sign up. When you hit it, Home and Flicks lock until midnight, with no ignore button.
                Loosening a limit takes 24 hours, so you can't talk yourself out of it at 1am. Lock everything for exam week with one tap.
              </p>
              <p className="mt-3 flex items-center gap-2 text-callout font-medium text-fg">
                <MessageCircle size={16} className="text-accent-text" aria-hidden="true" /> Messages and calls always work.
              </p>
            </div>
            <BrickDemo />
          </div>
        </section>

        <section aria-label="What Mesh stands for" className="mx-auto max-w-5xl px-4 py-14 md:px-6">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <li key={p.title} className="rounded-card border border-line bg-surface p-5">
                <p.icon size={22} className="text-accent-text" aria-hidden="true" />
                <h2 className="mt-3 text-title-3">{p.title}</h2>
                <p className="mt-2 text-callout text-fg-muted">{p.body}</p>
                {p.link && (
                  <button type="button" onClick={() => navigate(p.link.to)} className="mt-3 text-callout font-semibold text-accent-text hover:underline">
                    {p.link.label}
                  </button>
                )}
              </li>
            ))}
            <li className="rounded-card border border-line bg-surface p-5">
              <h2 className="text-title-3">Mesh will never</h2>
              <ul className="mt-3 space-y-2">
                {NEVER.map((n) => (
                  <li key={n} className="flex items-start gap-2 text-callout text-fg-muted">
                    <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{n}
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </section>

        <section className="border-t border-line bg-surface px-4 py-14 text-center md:px-6">
          <h2 className="font-display text-title-1">Ready to get bored again?</h2>
          <p className="mx-auto mt-3 max-w-lg text-body text-fg-muted">
            Boredom isn't wasted time. It's when your mind wanders, and a wandering mind is where ideas, plans and the big
            questions come from. Fill every spare second with a feed and you lose that. Mesh gives it back.
          </p>
          {cta("footer")}
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap gap-x-5 gap-y-2 px-4 py-8 pb-safe text-caption text-fg-subtle md:px-6">
        {Object.entries(DOCUMENT_TITLES).map(([id, title]) => (
          <a key={id} href={`/legal/${id}`} onClick={(e) => { e.preventDefault(); navigate(`/legal/${id}`); }} className="hover:text-fg hover:underline">{title}</a>
        ))}
      </footer>
    </div>
  );
}

// A developed roll: a few prints with their date stamps.
const PRINTS = [
  { g: "from-amber-400 via-rose-500 to-fuchsia-800", d: "17 02 '27", r: "-rotate-6" },
  { g: "from-sky-400 via-indigo-600 to-violet-900", d: "17 02 '27", r: "rotate-3" },
  { g: "from-emerald-300 via-teal-600 to-slate-900", d: "18 02 '27", r: "-rotate-2" },
  { g: "from-orange-300 via-red-500 to-rose-900", d: "18 02 '27", r: "rotate-6" },
];

function RollsDemo() {
  return (
    <figure aria-label="A roll that has developed: photos from the night with orange date stamps" className="mx-auto w-full max-w-sm">
      <div className="rounded-[28px] border border-line-strong bg-[#111114] p-5 text-white shadow-overlay">
        <div className="flex items-center justify-between text-caption font-semibold">
          <span className="flex items-center gap-2"><Aperture size={15} className="text-[#ff9b2f]" aria-hidden="true" /> O-Week night 2</span>
          <span className="rounded-full bg-[#ff9b2f] px-2.5 py-0.5 text-black">Developed 9:00</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 px-1" aria-hidden="true">
          {PRINTS.map((p) => (
            <div key={p.g} className={`rounded-[6px] bg-white p-1.5 pb-5 shadow-lg ${p.r}`}>
              <div className={`relative aspect-[3/4] overflow-hidden rounded-[2px] bg-gradient-to-br ${p.g}`}>
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_45%_38%,rgba(255,255,255,.45),transparent_55%)]" />
                <span className="absolute bottom-1.5 right-1.5"><SevenSeg text={p.d} height={8} color="#ff9b2f" glow /></span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-caption text-white/70">143 photos by 18 people</p>
      </div>
      <figcaption className="mt-3 text-center text-caption text-fg-subtle">What you wake up to</figcaption>
    </figure>
  );
}

// A still picture of a limit being hit: what Brick mode looks like.
function BrickDemo() {
  return (
    <figure aria-label="Brick mode: Home locked after a 45 minute daily limit" className="mx-auto w-full max-w-sm">
      <div className="rounded-[28px] border border-line-strong bg-surface p-5 shadow-overlay">
        <div className="flex items-center gap-2 text-caption font-semibold text-fg-muted">
          <BrickWall size={15} className="text-accent-text" aria-hidden="true" /> Brick mode
        </div>
        <div className="mt-4 space-y-3" aria-hidden="true">
          {[
            { label: "Home", used: 45, cap: 45 },
            { label: "Flicks", used: 18, cap: 30 },
            { label: "News", used: 9, cap: 0 },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-caption">
                <span className="font-semibold text-fg">{s.label}</span>
                <span className="tabular text-fg-subtle">{s.cap ? `${s.used} of ${s.cap} min` : "No limit"}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className={`h-full rounded-full ${s.cap && s.used >= s.cap ? "bg-danger" : "bg-accent"}`}
                  style={{ width: `${s.cap ? Math.min(100, (s.used / s.cap) * 100) : 12}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-card bg-surface-2 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fg text-canvas" aria-hidden="true"><Lock size={18} /></span>
          <span>
            <span className="block text-callout font-semibold">Home is locked until midnight</span>
            <span className="block text-caption text-fg-muted">You hit your 45 minutes. Messages still work.</span>
          </span>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-caption text-fg-subtle">What hitting your limit looks like</figcaption>
    </figure>
  );
}
