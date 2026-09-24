import { useEffect, useState } from "react";
import { fetchComments, addComment, timeAgo, openUserProfile } from "../lib/db";
import { LIMITS, validateText } from "../lib/validate";
import { checkContent } from "../lib/moderation";

export default function Comments({ post, onClose, onCommentAdded }) {
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchComments(post.id).then(setComments).catch(() => setComments([]));
  }, [post.id]);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateText(text, LIMITS.comment, "Comment");
    if (v.error) return setError(v.error);
    if (!v.text) return;
    const mod = checkContent(v.text, { key: "comment", skipCooldown: true });
    if (mod.error) return setError(mod.error);
    setBusy(true);
    setError("");
    try {
      const comment = await addComment(post, v.text);
      setComments((prev) => [...(prev || []), comment]);
      setText("");
      onCommentAdded?.();
    } catch {
      setError("Couldn't post comment. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 anim-fade" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 anim-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="font-semibold text-sm">Comments</h3>
          <button onClick={onClose} aria-label="Close comments"
            className="min-h-[44px] px-2 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {comments === null && <p className="text-sm text-zinc-400">Loading…</p>}
          {comments?.length === 0 && <p className="text-sm text-zinc-400">No comments yet. Say something!</p>}
          {comments?.map((c, i) => (
            <div key={c.id || i} className="text-sm anim-fade">
              <button onClick={() => c.authorId && openUserProfile(c.authorId)} className="font-semibold hover:text-violet-300">
                @{c.authorName}
              </button>{" "}
              <span className="text-zinc-300 break-words">{c.text}</span>
              <span className="ml-2 text-xs text-zinc-400">{timeAgo(c.createdAt)}</span>
            </div>
          ))}
        </div>

        {post.locked ? (
          <p className="p-3 border-t border-zinc-800 text-center text-xs text-amber-400">
            A moderator has paused comments on this post.
          </p>
        ) : (
        <form onSubmit={submit} className="flex gap-2 p-3 border-t border-zinc-800">
          <input
            className="flex-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
            placeholder="Add a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LIMITS.comment}
          />
          <button disabled={busy} className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 text-sm font-semibold">
            Post
          </button>
        </form>
        )}
        {error && <p className="px-4 pb-3 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
