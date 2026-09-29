// A live blog's stream of updates, newest first, arriving as they're posted.
import { useEffect, useState } from "react";
import { Radio, Send, Star, Trash2 } from "lucide-react";
import { deleteLiveUpdate, listenLiveUpdates, postLiveUpdate, setLive, tsMillis } from "../../lib/db";
import { fullTime, shortTime } from "../../lib/format";
import { checkContent } from "../../lib/moderation";
import RichText from "../ui/RichText";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { Checkbox, Textarea } from "../ui/Field";
import { InlineMessage } from "../ui/States";
import { useToast } from "../ui/toast-context";

/* Readers see each update the moment it's posted, with no refreshing: the
   page holds one live connection to the story's updates. Authors post from
   the top of the stream while the blog is live, and can mark an update as
   a key event so it stands out. */
export function LiveUpdates({ story, isAuthor, onLiveChange }) {
  const toast = useToast();
  const [updates, setUpdates] = useState(null);
  const [text, setText] = useState("");
  const [key, setKey] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => listenLiveUpdates(story.id, setUpdates), [story.id]);

  const post = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const mod = checkContent(t, { key: "live", skipCooldown: true, allowQuoted: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    setError("");
    try { await postLiveUpdate(story.id, t, key); setText(""); setKey(false); }
    catch { setError("Couldn't post that update. Is the blog still live?"); }
    finally { setBusy(false); }
  };

  const toggleLive = async () => {
    try { await setLive(story.id, !story.live); onLiveChange(!story.live); }
    catch { toast({ tone: "error", title: "Couldn't change that" }); }
  };

  const keyEvents = (updates || []).filter((u) => u.key);

  return (
    <section aria-labelledby="live-h" className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="live-h" className="flex items-center gap-2 text-title-3">
          {story.live
            ? <><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" /> Live updates</>
            : <>Updates <span className="text-callout font-normal text-fg-subtle">(no longer live)</span></>}
        </h2>
        {isAuthor && <Button size="sm" variant={story.live ? "secondary" : "primary"} icon={Radio} onClick={toggleLive}>{story.live ? "End live coverage" : "Go live"}</Button>}
      </div>

      {keyEvents.length > 0 && (
        <nav aria-label="Key events" className="mt-3 rounded-card border border-line bg-surface p-3">
          <p className="mb-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">Key events</p>
          <ul className="space-y-1">
            {keyEvents.map((u) => (
              <li key={u.id}><a href={`#u-${u.id}`} className="text-callout text-accent-text hover:underline">{shortTime(tsMillis(u.at))}: {u.text.slice(0, 90)}{u.text.length > 90 ? "…" : ""}</a></li>
            ))}
          </ul>
        </nav>
      )}

      {isAuthor && story.live && (
        <form onSubmit={post} className="mt-4 rounded-card border border-accent-text/40 bg-surface p-3">
          <label htmlFor="live-text" className="sr-only">New update</label>
          <Textarea id="live-text" autoGrow rows={2} maxRows={10} value={text} maxLength={1500}
            onChange={(e) => { setText(e.target.value); if (error) setError(""); }} placeholder="What's happening now? Cite sources as links." />
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <div className="mt-2 flex items-center gap-3">
            <Checkbox checked={key} onChange={setKey}>Key event</Checkbox>
            <span className="flex-1" />
            <Button type="submit" variant="primary" size="sm" icon={Send} loading={busy} disabled={!text.trim()}>Post update</Button>
          </div>
        </form>
      )}

      <ol className="mt-4 space-y-3" aria-live="polite">
        {updates?.length === 0 && <li className="text-callout text-fg-subtle">No updates yet.</li>}
        {(updates || []).map((u) => (
          <li key={u.id} id={`u-${u.id}`}
            className={`scroll-mt-24 rounded-card border p-4 ${u.key ? "border-accent-text/50 bg-accent-soft" : "border-line bg-surface"}`}>
            <p className="flex items-center gap-2 text-caption text-fg-subtle">
              {u.key && <Star size={13} className="text-accent-text" fill="currentColor" aria-label="Key event" />}
              <time dateTime={tsMillis(u.at) ? new Date(tsMillis(u.at)).toISOString() : undefined} title={tsMillis(u.at) ? fullTime(tsMillis(u.at)) : undefined}
                className="font-semibold text-fg-muted">{tsMillis(u.at) ? shortTime(tsMillis(u.at)) : "now"}</time>
              <span>@{u.byName}</span>
              <span className="flex-1" />
              {isAuthor && <IconButton icon={Trash2} label="Delete update" size={14} onClick={() => deleteLiveUpdate(story.id, u.id).catch(() => {})} />}
            </p>
            <RichText text={u.text} className="mt-1.5 text-body text-fg" />
          </li>
        ))}
      </ol>
    </section>
  );
}
