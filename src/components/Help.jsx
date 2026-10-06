import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, LifeBuoy, Lightbulb, Mail, Search, X } from "lucide-react";
import { GLOSSARY, GUIDES, HELP_TOPICS, guideById, searchGuides, topicById } from "../lib/helpGuides";
import { BUSINESS } from "../legal/business";
import { pushState } from "../lib/push";
import { useInstallState } from "../lib/install";
import { replayTour } from "../lib/tour";
import { navigate } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import HomeHeader from "./shell/HomeHeader";
import InstallDialog from "./InstallDialog";
import Button from "./ui/Button";
import { Input } from "./ui/Field";
import { EmptyState } from "./ui/States";

/** "**Tap** this" with the button names in bold. */
function Rich({ text }) {
  return String(text).split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold text-fg">{part}</strong> : part));
}

/** Help: guides to everything in Mesh, in plain words (lib/helpGuides.js). */
export default function Help({ guideId }) {
  const [installing, setInstalling] = useState(false);
  const { openInterests } = useShell();
  const run = (go) => {
    if (go.path) return navigate(go.path);
    if (go.run === "tour") return replayTour();
    if (go.run === "install") return setInstalling(true);
    if (go.run === "interests") return openInterests?.();
    return undefined;
  };
  const guide = guideId ? guideById(guideId) : null;

  return (
    <>
      <HomeHeader section="help" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-4 md:px-6">
          {guideId && !guide && (
            <EmptyState icon={BookOpen} title="That guide isn't here any more"
              action={<Button onClick={() => navigate("/help")}>See all help</Button>} />
          )}
          {guide ? <Guide guide={guide} onGo={run} /> : !guideId && <HelpHome onGo={run} />}
        </div>
      </div>
      {installing && <InstallDialog onClose={() => setInstalling(false)} />}
    </>
  );
}

function HelpHome({ onGo }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query.trim() ? searchGuides(query) : null), [query]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="help-h">
        <h2 id="help-h" className="font-display text-title-1">How can we help?</h2>
        <p className="mt-1 text-callout text-fg-muted">Short guides to everything in Mesh, in plain words. Type a question or a word, or pick a topic below.</p>
        <div role="search" className="relative mt-4">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <Input id="help-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search help"
            placeholder="Type a question or a word" className="!pl-11 !pr-11" autoComplete="off" enterKeyHint="search" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear the search"
              className="press absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {results && (
          <div className="mt-3" aria-live="polite">
            {results.length ? (
              <GuideList guides={results} label={`${results.length} matching guide${results.length === 1 ? "" : "s"}`} />
            ) : (
              <p className="rounded-card border border-line bg-surface p-4 text-callout text-fg-muted">
                No guide matches that yet. Try fewer or different words, or <a className="font-semibold text-accent-text underline underline-offset-2" href={`mailto:${BUSINESS.supportEmail}`}>email us</a> at {BUSINESS.supportEmail}.
              </p>
            )}
          </div>
        )}
      </section>

      {!results && (
        <>
          <FirstSteps onGo={onGo} />
          {HELP_TOPICS.map((t) => (
            <section key={t.id} aria-labelledby={`topic-${t.id}`}>
              <h2 id={`topic-${t.id}`} className="mb-2 text-title-3">{t.title}</h2>
              <GuideList guides={GUIDES.filter((g) => g.topic === t.id)} />
            </section>
          ))}
          <Glossary />
          <StillStuck />
        </>
      )}
    </div>
  );
}

function GuideList({ guides, label }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {guides.map((g) => (
        <li key={g.id}>
          <button type="button" onClick={() => navigate(`/help/${g.id}`)}
            className="press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block text-callout font-semibold">{g.title}</span>
              <span className="block text-caption text-fg-muted">{g.summary}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// A new member's first few steps, ticked off as they're done. Steps this
// device can't do (installing where the browser can't) are left out.
function FirstSteps({ onGo }) {
  const { profile, guest, interests, following, openInterests } = useShell();
  const install = useInstallState();
  const [push, setPush] = useState(null);
  useEffect(() => {
    let live = true;
    pushState().then((s) => { if (live) setPush(s); }).catch(() => { if (live) setPush("unsupported"); });
    return () => { live = false; };
  }, []);
  if (guest || !profile) return null;

  const steps = [
    { id: "photo", label: "Add a profile photo", done: !!profile.photoURL, go: () => navigate("/account") },
    { id: "interests", label: "Pick a few interests", done: (interests || []).length > 0, go: () => openInterests?.() },
    { id: "follow", label: "Follow 3 people you know", done: (following?.size || 0) >= 3, go: () => navigate("/search") },
    push && push !== "unsupported" && { id: "push", label: "Turn on notifications", done: push === "on", go: () => onGo({ path: "/help/notifications" }) },
    install !== "unavailable" && { id: "install", label: "Put Mesh on your home screen", done: install === "installed", go: () => onGo({ run: "install" }) },
  ].filter(Boolean);
  const done = steps.filter((s) => s.done).length;
  const all = done === steps.length;

  return (
    <section aria-labelledby="first-h" className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="first-h" className="text-title-3">{all ? "You're all set" : "Your first steps"}</h2>
          <p className="text-caption text-fg-muted">{all ? "You've done everything here. Enjoy Mesh, and put it down sometimes." : "A few things that make Mesh feel like yours."}</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-caption font-semibold tabular text-fg-muted">{done} of {steps.length}</span>
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={s.go} disabled={s.done}
              className="press flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2 disabled:hover:bg-transparent">
              <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-accent text-white" : "border-2 border-line-strong"}`}>
                {s.done && <Check size={14} />}
              </span>
              <span className={`min-w-0 flex-1 text-callout ${s.done ? "text-fg-muted line-through decoration-fg-subtle" : "font-medium"}`}>
                {s.label}<span className="sr-only">{s.done ? ", done" : ""}</span>
              </span>
              {!s.done && <ChevronRight size={16} className="shrink-0 text-fg-subtle" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={replayTour} className="mt-2 px-2 text-caption font-semibold text-accent-text hover:underline">
        Or take the 30-second tour
      </button>
    </section>
  );
}

function Glossary() {
  return (
    <section aria-labelledby="words-h">
      <h2 id="words-h" className="text-title-3">Words Mesh uses</h2>
      <p className="mt-0.5 text-caption text-fg-muted">Some things in Mesh have their own names. Here's what they mean.</p>
      <dl className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {GLOSSARY.map((w) => (
          <div key={w.term} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-callout font-semibold">{w.term}</dt>
            <dd className="text-callout text-fg-muted">
              {w.meaning}{" "}
              <button type="button" onClick={() => navigate(`/help/${w.guide}`)} className="font-semibold text-accent-text hover:underline">
                More<span className="sr-only"> about {w.term}</span>
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StillStuck() {
  return (
    <section aria-labelledby="stuck-h" className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
      <LifeBuoy size={22} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="stuck-h" className="text-title-3">Still stuck?</h2>
        <p className="mt-0.5 text-callout text-fg-muted">
          Email <span className="select-all font-semibold text-fg">{BUSINESS.supportEmail}</span>. Say what you tapped and what happened, and a person will write back.
        </p>
        <Button size="sm" icon={Mail} className="mt-3" onClick={() => { window.location.href = `mailto:${BUSINESS.supportEmail}`; }}>Email Mesh</Button>
      </div>
    </section>
  );
}

function Guide({ guide, onGo }) {
  const topic = topicById(guide.topic);
  const related = GUIDES.filter((g) => g.topic === guide.topic && g.id !== guide.id);
  return (
    <article aria-labelledby="guide-h" className="space-y-6">
      <div>
        <button type="button" onClick={() => navigate("/help")}
          className="press -ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-caption font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg">
          <ArrowLeft size={16} aria-hidden="true" /> All help
        </button>
        <p className="mt-3 text-label font-semibold uppercase tracking-wider text-fg-subtle">{topic?.title}</p>
        <h2 id="guide-h" className="mt-1 font-display text-title-1">{guide.title}</h2>
        <p className="mt-1 text-body text-fg-muted">{guide.summary}</p>
      </div>

      <ol className="space-y-3">
        {guide.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-callout font-bold tabular text-accent-text">{i + 1}</span>
            <p className="min-w-0 flex-1 pt-0.5 text-body leading-relaxed text-fg-muted"><Rich text={s} /></p>
          </li>
        ))}
      </ol>

      {guide.tips?.length > 0 && (
        <aside aria-label="Good to know" className="rounded-card border border-line bg-surface p-4">
          <p className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">
            <Lightbulb size={14} aria-hidden="true" /> Good to know
          </p>
          <ul className="mt-2 space-y-1.5">
            {guide.tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-callout text-fg-muted">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-text" aria-hidden="true" /><span><Rich text={t} /></span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {guide.go && (
        <Button variant="primary" onClick={() => onGo(guide.go)}>
          {guide.go.label}<ArrowRight size={16} aria-hidden="true" />
        </Button>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-h">
          <h3 id="related-h" className="mb-2 text-callout font-semibold text-fg-muted">More about {topic?.title.toLowerCase()}</h3>
          <GuideList guides={related} />
        </section>
      )}
      <StillStuck />
    </article>
  );
}
