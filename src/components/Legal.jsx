import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { DOCUMENTS } from "../legal/content";
import { BUSINESS, missingFields } from "../legal/business";
import { navigate } from "../lib/router";
import TopBar from "./shell/TopBar";
import { LogoMark } from "./shell/Sidebar";

// Policies are public routes (/legal/:doc), readable signed out.
export default function Legal({ doc = "privacy", standalone = false }) {
  const headingRef = useRef(null);
  const current = DOCUMENTS.find((d) => d.id === doc) || DOCUMENTS[0];
  const gaps = missingFields();
  const first = useRef(true);

  // Focus the new title on document switch, but not on initial load.
  useEffect(() => {
    if (!first.current) headingRef.current?.focus();
    first.current = false;
  }, [doc]);

  const open = (id) => navigate(`/legal/${id}`, { replace: true });

  return (
    <>
      {standalone ? (
        <header className="sticky top-0 z-nav flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur">
          <button type="button" onClick={() => navigate("/")} className="press flex items-center gap-2 rounded-control" aria-label="Mesh, back to sign in">
            <LogoMark size={26} />
            <span className="font-display text-title-3 font-extrabold">Mesh</span>
          </button>
        </header>
      ) : (
        <TopBar title="Policies" back backTo="/account/settings" />
      )}

      <div data-scroll className={standalone ? "" : "min-h-0 flex-1 overflow-y-auto"}>
        <div className="mx-auto max-w-[760px] px-4 pb-16 pt-6 md:px-6">
          <p className="text-caption text-fg-subtle">Last updated {BUSINESS.lastUpdated}</p>
          <h1 className="mt-1 text-display font-display">Policies</h1>
          <p className="mt-2 text-body text-fg-muted">Written in plain English, and describing what Mesh actually does.</p>

          {gaps.length > 0 && (
            <div role="alert" className="mt-5 flex gap-3 rounded-card border border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning-text" aria-hidden="true" />
              <div>
                <p className="text-callout font-semibold text-warning-text">These policies aren't ready to publish</p>
                <p className="mt-1 text-caption text-fg-muted">
                  {gaps.length} business detail{gaps.length === 1 ? "" : "s"} still unset
                  in <code className="rounded bg-surface-3 px-1">src/legal/business.js</code>: {gaps.join(", ")}.
                  Australian Consumer Law expects a real trader to be identifiable. A policy naming "TODO" as its
                  operator is worse than none.
                </p>
              </div>
            </div>
          )}

          <nav aria-label="Policies" className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {DOCUMENTS.map((d) => {
                const on = d.id === current.id;
                return (
                  <li key={d.id}>
                    <a href={`/legal/${d.id}`} aria-current={on ? "page" : undefined}
                      onClick={(e) => { e.preventDefault(); open(d.id); }}
                      className={`press inline-flex min-h-10 items-center rounded-full px-4 text-callout font-medium transition-colors ${
                        on ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
                      }`}>
                      {d.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className="mt-8 anim-fade" key={current.id}>
            <h2 ref={headingRef} tabIndex={-1} className="text-title-1 outline-none">{current.title}</h2>
            <p className="mt-2 text-body text-fg-muted">{current.summary}</p>

            <div className="mt-8 space-y-9">
              {current.sections.map((s) => (
                <section key={s.h} aria-labelledby={`h-${current.id}-${s.h}`}>
                  <h3 id={`h-${current.id}-${s.h}`} className="text-title-3">{s.h}</h3>
                  {s.p?.map((para, i) => (
                    <p key={i} className="mt-3 max-w-[68ch] text-body text-fg-muted">{para}</p>
                  ))}
                  {s.list && (
                    <dl className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line">
                      {s.list.map(([term, def]) => (
                        <div key={term} className="bg-surface p-4">
                          <dt className="text-callout font-semibold text-fg">{term}</dt>
                          <dd className="mt-1 max-w-[68ch] text-callout text-fg-muted">{def}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              ))}
            </div>

            <footer className="mt-12 border-t border-line pt-6 text-caption text-fg-subtle">
              <p className="text-callout font-semibold text-fg">{BUSINESS.legalName}</p>
              <p className="mt-1">ABN {BUSINESS.abn}</p>
              <p>{BUSINESS.address}</p>
              <dl className="mt-3 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                <dt>General</dt><dd className="text-fg-muted">{BUSINESS.supportEmail}</dd>
                <dt>Privacy</dt><dd className="text-fg-muted">{BUSINESS.privacyEmail}</dd>
                <dt>Copyright</dt><dd className="text-fg-muted">{BUSINESS.copyrightEmail}</dd>
              </dl>
            </footer>
          </article>
        </div>
      </div>
    </>
  );
}
