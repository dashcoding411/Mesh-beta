import { useEffect, useState } from "react";
import { fetchNews, fetchMyNews, submitNews, isAdmin, reviewNews, timeAgo, openUserProfile } from "../lib/db";
import { LIMITS, validateText, validateSources } from "../lib/validate";
import { checkContent, markPosted } from "../lib/moderation";

export default function Sourced() {
  const [items, setItems] = useState(null);
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  const load = async () => {
    await Promise.resolve(); // defer past the effect body (satisfies react-hooks lint)
    try {
      const [approved, myItems, amAdmin] = await Promise.all([
        fetchNews("approved"),
        fetchMyNews().catch(() => []),
        isAdmin().catch(() => false),
      ]);
      setItems(approved);
      setMine(myItems);
      setAdmin(amAdmin);
      if (amAdmin) setPending(await fetchNews("pending").catch(() => []));
    } catch (err) {
      console.error(err);
      setItems([]);
    }
  };

  useEffect(() => {
    (async () => { await load(); })();
  }, []);

  const review = async (id, status) => {
    await reviewNews(id, status);
    setPending((prev) => prev.filter((n) => n.id !== id));
    if (status === "approved") load();
  };

  return (
    <div className="h-full overflow-y-auto pb-24 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold">News</h2>
          <button onClick={() => setShowSubmit(true)}
            className="rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold">
            Submit a story
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
          Everything here is fact-checked before publication. Submissions must include the full script
          and at least two sources. No sources, no story.
        </p>

        {admin && pending.length > 0 && (
          <section className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 anim-rise">
            <h3 className="text-sm font-bold text-amber-400 mb-3">Awaiting fact-check ({pending.length})</h3>
            <div className="space-y-4">
              {pending.map((n) => (
                <NewsCard key={n.id} item={n} full
                  actions={
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => review(n.id, "approved")}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-semibold">
                        ✓ Verified — publish
                      </button>
                      <button onClick={() => review(n.id, "rejected")}
                        className="rounded-lg bg-red-600/80 hover:bg-red-500 px-4 py-1.5 text-xs font-semibold">
                        ✗ Reject
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </section>
        )}

        {mine.filter((n) => n.status !== "approved").length > 0 && (
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-zinc-500 mb-3">Your submissions</h3>
            <div className="space-y-3">
              {mine.filter((n) => n.status !== "approved").map((n) => (
                <div key={n.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <span className={`text-xs shrink-0 ml-3 px-2 py-1 rounded-full ${
                    n.status === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {n.status === "pending" ? "in fact-check" : "rejected"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {items === null && <p className="text-zinc-500">Loading news…</p>}
        {items?.length === 0 && (
          <div className="text-center text-zinc-500 mt-16">
            <p className="text-lg font-semibold text-zinc-300">No verified stories yet</p>
            <p className="text-sm mt-1">Submit one — with sources.</p>
          </div>
        )}
        <div className="space-y-5 stagger">
          {items?.map((n) => <NewsCard key={n.id} item={n} />)}
        </div>
      </div>

      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onSubmitted={() => { setShowSubmit(false); load(); }} />}
    </div>
  );
}

function NewsCard({ item, full = false, actions }) {
  const [expanded, setExpanded] = useState(full);
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700">
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
        {item.status === "approved" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 font-semibold">
            ✓ fact-checked
          </span>
        )}
        <button onClick={() => openUserProfile(item.authorId)} className="hover:text-violet-300">@{item.authorName}</button>
        <span>· {timeAgo(item.createdAt)}</span>
      </div>
      <h3 className="font-bold text-lg leading-snug">{item.title}</h3>
      <p className={`text-sm text-zinc-300 mt-2 whitespace-pre-wrap break-words ${expanded ? "" : "line-clamp-4"}`}>
        {item.script}
      </p>
      {!expanded && item.script.length > 300 && (
        <button onClick={() => setExpanded(true)} className="text-xs text-violet-400 hover:text-violet-300 mt-1">
          Read more
        </button>
      )}
      <div className="mt-3 pt-3 border-t border-zinc-800">
        <p className="text-[11px] uppercase tracking-wider text-zinc-600 mb-1">Sources</p>
        <ul className="space-y-0.5">
          {(item.sources || []).map((s, i) => (
            <li key={i}>
              <a href={s} target="_blank" rel="noopener noreferrer"
                className="text-xs text-violet-400 hover:text-violet-300 break-all">
                {s}
              </a>
            </li>
          ))}
        </ul>
      </div>
      {actions}
    </article>
  );
}

function SubmitModal({ onClose, onSubmitted }) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [sources, setSources] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const t = title.trim();
    if (t.length < LIMITS.newsTitle.min) return setError(`Headline must be at least ${LIMITS.newsTitle.min} characters.`);
    const vScript = validateText(script, LIMITS.newsScript.max, "Script");
    if (vScript.error) return setError(vScript.error);
    if (vScript.text.length < LIMITS.newsScript.min) {
      return setError(`The full script is required (at least ${LIMITS.newsScript.min} characters).`);
    }
    const vSources = validateSources(sources);
    if (vSources.error) return setError(vSources.error);
    const mod = checkContent(`${t}\n${vScript.text}`, { key: "news" });
    if (mod.error) return setError(mod.error);

    setBusy(true);
    try {
      await submitNews({ title: t, script: vScript.text, sources: vSources.sources });
      markPosted("news");
      onSubmitted();
    } catch (err) {
      console.error(err);
      setError(err?.code === "permission-denied"
        ? "Submission rejected — under-16 accounts can't submit news."
        : "Couldn't submit. Try again.");
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 anim-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-3 anim-pop">
        <h3 className="font-bold text-lg">Submit a news story</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Your story goes to fact-checking before anyone sees it. Provide the complete script and
          the sources backing every claim — at least two, one URL per line.
        </p>
        <input className={input} placeholder="Headline" value={title}
          onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.newsTitle.max} />
        <textarea className={`${input} h-40 resize-none`} placeholder="Full script — everything you plan to say"
          value={script} onChange={(e) => setScript(e.target.value)} maxLength={LIMITS.newsScript.max} />
        <textarea className={`${input} h-24 resize-none`} placeholder={"Sources (one URL per line)\nhttps://…\nhttps://…"}
          value={sources} onChange={(e) => setSources(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 py-3 font-semibold text-sm">
          {busy ? "Submitting…" : "Send to fact-check"}
        </button>
      </form>
    </div>
  );
}
