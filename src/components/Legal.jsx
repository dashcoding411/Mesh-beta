import { useEffect, useRef, useState } from "react";
import { DOCUMENTS } from "../legal/content";
import { BUSINESS, missingFields } from "../legal/business";

/* One surface for every policy. It works signed-out too, because the signup
   page has to link here before an account exists. */
export default function Legal({ doc = "privacy", onBack }) {
  const [active, setActive] = useState(doc);
  const headingRef = useRef(null);
  const mounted = useRef(false);

  // Switching document is a navigation, so send focus to the new title rather
  // than leaving it stranded on the tab just left. Not on first render, though
  // — arriving on the page should not yank focus out of wherever it was.
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [active]);

  const current = DOCUMENTS.find((d) => d.id === active) || DOCUMENTS[0];
  const gaps = missingFields();

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {onBack && (
          <button onClick={onBack}
            className="mb-4 min-h-[44px] -ml-2 px-2 text-sm text-zinc-400 hover:text-zinc-100 transition">
            ← Back
          </button>
        )}

        <h1 className="text-2xl font-bold">Legal</h1>
        <p className="text-sm text-zinc-400 mt-1">
          The full set, in plain English. Last updated {BUSINESS.lastUpdated}.
        </p>

        {gaps.length > 0 && (
          <div role="alert"
            className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-semibold text-amber-300">These policies are not ready to publish</p>
            <p className="text-amber-200/90 mt-1 leading-relaxed">
              {gaps.length} business detail{gaps.length === 1 ? "" : "s"} still unset
              in <code className="text-xs">src/legal/business.js</code>: {gaps.join(", ")}.
              Australian Consumer Law expects a real trader to be identifiable, and a policy
              naming "TODO" as its operator is worse than none.
            </p>
          </div>
        )}

        <nav aria-label="Policies" className="mt-5 flex flex-wrap gap-1.5">
          {DOCUMENTS.map((d) => (
            <button key={d.id} onClick={() => setActive(d.id)}
              aria-current={d.id === active ? "page" : undefined}
              className={`min-h-[40px] rounded-xl px-3.5 text-sm font-medium transition ${
                d.id === active
                  ? "bg-violet-600/20 text-violet-200 border border-violet-500/40"
                  : "border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
              }`}>
              {d.title}
            </button>
          ))}
        </nav>

        <article className="mt-6 anim-fade" key={current.id}>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            {current.title}
          </h2>
          <p className="text-sm text-zinc-300 mt-1.5 leading-relaxed">{current.summary}</p>

          <div className="mt-6 space-y-7">
            {current.sections.map((s) => (
              <section key={s.h}>
                <h3 className="font-semibold text-zinc-100">{s.h}</h3>
                {s.p?.map((para, i) => (
                  <p key={i} className="text-sm text-zinc-300 leading-relaxed mt-2">{para}</p>
                ))}
                {s.list && (
                  <dl className="mt-3 space-y-2.5">
                    {s.list.map(([term, def]) => (
                      <div key={term} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5">
                        <dt className="text-sm font-medium text-zinc-100">{term}</dt>
                        <dd className="text-sm text-zinc-300 leading-relaxed mt-1">{def}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
          </div>

          <footer className="mt-10 border-t border-zinc-800 pt-5 text-sm text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">{BUSINESS.legalName}</p>
            <p>ABN {BUSINESS.abn}</p>
            <p>{BUSINESS.address}</p>
            <p>
              General: {BUSINESS.supportEmail} · Privacy: {BUSINESS.privacyEmail} · Copyright:{" "}
              {BUSINESS.copyrightEmail}
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
