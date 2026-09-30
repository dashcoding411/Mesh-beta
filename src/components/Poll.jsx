import { useEffect, useState } from "react";
import { Check, Plus, X, ChartBar, Clock } from "lucide-react";
import { votePostPoll, fetchMyVote, POLL_DURATIONS, tsMillis } from "../lib/db";
import { plural } from "../lib/format";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { Input } from "./ui/Field";
import { useToast } from "./ui/toast-context";
import { useShell } from "./shell/ShellContext";

function timeLeft(endsAt) {
  const ms = tsMillis(endsAt) - Date.now();
  if (ms <= 0) return "Final results";
  const h = Math.floor(ms / 3600e3);
  if (h >= 24) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.round(ms / 60e3))}m left`;
}

// Options until voted or closed, then results. Votes are anonymous and final.
export function PollCard({ post }) {
  const toast = useToast();
  const { needsAccount } = useShell();
  const options = post.poll.options;
  const [counts, setCounts] = useState(options.map((_, i) => post[`pollVotes${i}`] || 0));
  const [mine, setMine] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const closed = tsMillis(post.poll.endsAt) <= Date.now();
  const total = counts.reduce((a, b) => a + b, 0);
  const showResults = closed || mine !== null && mine !== undefined;

  useEffect(() => { fetchMyVote(post.id).then(setMine).catch(() => setMine(null)); }, [post.id]);

  const vote = async (i) => {
    if (busy || closed || needsAccount("vote in polls")) return;
    setBusy(true);
    setMine(i);
    setCounts((c) => c.map((n, j) => (j === i ? n + 1 : n)));
    try { await votePostPoll(post, i); }
    catch {
      setMine(null);
      setCounts((c) => c.map((n, j) => (j === i ? n - 1 : n)));
      toast({ tone: "error", title: "Your vote didn't go through", body: "Check your connection and try again." });
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 space-y-2" role="group" aria-label="Poll">
      {options.map((opt, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const leading = showResults && counts[i] === Math.max(...counts) && total > 0;
        return showResults ? (
          <div key={i} className="relative overflow-hidden rounded-control border border-line bg-surface-2">
            <span className={`absolute inset-y-0 left-0 ${leading ? "bg-accent/40" : "bg-surface-3"}`} style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="relative flex min-h-11 items-center justify-between gap-3 px-3.5">
              <span className={`flex items-center gap-2 text-callout ${leading ? "font-semibold" : ""}`}>
                {mine === i && <Check size={15} aria-label="Your vote" />}
                {opt}
              </span>
              <span className="tabular text-callout font-semibold">{pct}%</span>
            </span>
          </div>
        ) : (
          <button key={i} type="button" disabled={busy || mine === undefined} onClick={() => vote(i)}
            className="press flex min-h-11 w-full items-center justify-center rounded-control border border-accent-text px-3.5 text-callout font-semibold text-accent-text hover:bg-accent-soft disabled:opacity-60">
            {opt}
          </button>
        );
      })}
      <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
        <ChartBar size={13} aria-hidden="true" /> {plural(total, "vote")}
        <span aria-hidden="true">·</span>
        <Clock size={13} aria-hidden="true" /> {timeLeft(post.poll.endsAt)}
      </p>
    </div>
  );
}

export function PollBuilder({ value, onChange, onRemove }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <fieldset className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <legend className="flex items-center gap-2 text-callout font-semibold"><ChartBar size={16} aria-hidden="true" /> Poll</legend>
        <IconButton icon={X} label="Remove poll" size={16} onClick={onRemove} />
      </div>
      <div className="space-y-2">
        {value.options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <Input value={o} maxLength={50} aria-label={`Choice ${i + 1}`} placeholder={`Choice ${i + 1}${i > 1 ? " (optional)" : ""}`}
              onChange={(e) => set({ options: value.options.map((x, j) => (j === i ? e.target.value : x)) })} />
            {value.options.length > 2 && (
              <IconButton icon={X} label={`Remove choice ${i + 1}`} onClick={() => set({ options: value.options.filter((_, j) => j !== i) })} />
            )}
          </div>
        ))}
      </div>
      {value.options.length < 4 && (
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => set({ options: [...value.options, ""] })}>Add a choice</Button>
      )}
      <div className="mt-4">
        <p className="mb-2 text-caption text-fg-subtle">Runs for</p>
        <div role="radiogroup" aria-label="Poll length" className="flex flex-wrap gap-2">
          {POLL_DURATIONS.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={value.hours === d.hours} onClick={() => set({ hours: d.hours })}
              className={`press min-h-9 rounded-full px-3.5 text-caption font-semibold ${
                value.hours === d.hours ? "bg-fg text-canvas" : "bg-surface-2 text-fg-muted hover:bg-surface-3"
              }`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-caption text-fg-subtle">Votes are anonymous and can't be changed.</p>
    </fieldset>
  );
}
