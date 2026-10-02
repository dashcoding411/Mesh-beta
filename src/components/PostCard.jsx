import { useMemo, useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Send, Bookmark, Ellipsis, Lock, WandSparkles, EyeOff, MapPin,
} from "lucide-react";
import { toggleLike, toggleSave, toggleRepost, openUserProfile, me, isHeld } from "../lib/db";
import { navigate } from "../lib/router";
import { shortTime, fullTime, isoTime } from "../lib/format";
import { interestById } from "../lib/interests";
import { assessText } from "../lib/moderation";
import { useInView } from "../lib/useInView";
import { useShell } from "./shell/ShellContext";
import LiveAvatar from "./ui/LiveAvatar";
import { BadgeMark } from "./ui/Badges";
import { useLiveCard } from "../lib/profileCache";
import IconButton from "./ui/IconButton";
import Badge from "./ui/Badge";
import { useToast } from "./ui/toast-context";
import Comments from "./Comments";
import { ShareSheet, PostMenu } from "./PostActions";
import EditPostDialog from "./EditPost";
import { PostBody, Dots } from "./post/PostMedia";
import { Action, Caption, SocialProof, QuickComment } from "./post/PostFooter";

// Lists of posts space them apart rather than ruling lines between them; on
// wider screens each post is its own card.
export const POST_LIST = "flex flex-col gap-4 pt-3 md:gap-6 md:pt-5";

export default function PostCard({
  post: original, viewer, onViewerChange, onRemoved, onChanged, canModerate = false, highlight, compact = false,
}) {
  const toast = useToast();
  // Local edits apply immediately, ahead of the parent list.
  const [edits, setEdits] = useState(null);
  const post = useMemo(() => (edits ? { ...original, ...edits } : original), [original, edits]);
  const [counts, setCounts] = useState({
    like: post.likeCount || 0, comment: post.commentCount || 0,
    repost: post.repostCount || 0, save: post.saveCount || 0,
  });
  const [sheet, setSheet] = useState(null); // "comments" | "share" | "menu" | "edit"
  const [burst, setBurst] = useState(false);
  const [slide, setSlide] = useState(0);
  // Any interaction disqualifies the post from a carousel second look.
  const engaged = useRef(false);
  const [preview, setPreview] = useState(null);
  const pending = useRef({});
  const cardRef = useRef(null);
  const seen = useInView(cardRef);
  const { hiddenAuthors, hiddenWords, guest, needsAccount, profile: viewerProfile } = useShell();
  const [revealed, setRevealed] = useState(false);
  const mineNow = post.authorId === me();
  // Content allowed on context is collapsed for others, never for the author.
  const cover = useMemo(() => {
    if (mineNow) return "";
    const level = assessText(`${post.title || ""}\n${post.text || ""}`).level;
    if (level === "quoted") return "This post quotes offensive language, to report or call it out.";
    if (level === "block") return "This post may break the Community Guidelines.";
    return "";
  }, [mineNow, post.title, post.text]);
  const titleId = `post-${post.id}-author`;
  const authorCard = useLiveCard(post.authorId, {});

  const liked = viewer?.liked.has(post.id) || false;
  const saved = viewer?.saved.has(post.id) || false;
  const reposted = viewer?.reposted.has(post.id) || false;
  const mine = post.authorId === me();

  // Optimistic toggle; reverted with a toast on failure.
  const optimistic = async (key, field, on, write, failMsg) => {
    if (pending.current[key]) return;
    pending.current[key] = true;
    onViewerChange?.(post.id, field, on);
    setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + (on ? 1 : -1)) }));
    try {
      await write();
      return true;
    } catch (err) {
      console.error(err);
      onViewerChange?.(post.id, field, !on);
      setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + (on ? -1 : 1)) }));
      toast({ tone: "error", title: failMsg, body: "Check your connection and try again." });
      return false;
    } finally {
      pending.current[key] = false;
    }
  };

  const like = () => {
    if (needsAccount("like posts")) return;
    optimistic("like", "liked", !liked, () => toggleLike(post, liked), "Couldn't update your like");
  };

  const likeFromDoubleTap = () => {
    if (needsAccount("like posts")) return;
    setBurst(true);
    setTimeout(() => setBurst(false), 900);
    if (!liked) like();
  };

  const save = async () => {
    if (needsAccount("save posts")) return;
    const ok = await optimistic("save", "saved", !saved, () => toggleSave(post, saved), "Couldn't update Saved");
    if (ok && !saved) toast({ title: "Saved", action: { label: "View saved", onClick: () => navigate("/saved") } });
  };

  const repost = async () => {
    if (needsAccount("repost")) return;
    if (mine) return toast({ tone: "info", title: "You can't repost your own post", body: "Share it instead, or send it to someone." });
    if (post.visibility !== "public") {
      return toast({ tone: "info", title: "Only public posts can be reposted", body: "Reposting would show it to people the author didn't choose." });
    }
    if (!reposted && viewerProfile?.isPrivate) {
      return toast({ tone: "info", title: "Private accounts can't repost", body: "Reposts are public. Share it or send it to someone instead." });
    }
    const on = !reposted;
    const ok = await optimistic("repost", "reposted", on, () => toggleRepost(post, reposted), "Couldn't update your repost");
    if (ok && on) {
      toast({
        title: "Reposted to your followers",
        action: { label: "Undo", onClick: () => optimistic("repost", "reposted", false, () => toggleRepost(post, true), "Couldn't undo the repost") },
      });
    }
  };

  const repostDisabled = mine || post.visibility !== "public";
  // Media posts show the caption below the actions; text posts render it as the body.
  const media = post.kind !== "text";
  const author = post.authorName;

  return (
    <article aria-labelledby={titleId} ref={cardRef} tabIndex={-1} onClickCapture={() => { engaged.current = true; }}
      className={`relative ${compact ? "pb-2 pt-3" : "pb-3 pt-3.5"} md:rounded-card md:border md:border-line md:bg-surface [container-type:inline-size]`}>
      {post.repostedBy?.length > 0 && (
        <p className="mb-2 flex items-center gap-1.5 px-4 text-caption font-medium text-fg-subtle">
          <Repeat2 size={14} aria-hidden="true" />
          <span className="truncate">
            {post.repostedBy[0].username ? `@${post.repostedBy[0].username}` : "Someone you follow"}
            {post.repostedBy.length > 1 && ` and ${post.repostedBy.length - 1} more`} reposted
          </span>
        </p>
      )}

      <header className="flex items-center gap-3 px-4">
        <button type="button" onClick={() => openUserProfile(post.authorId)} className="press shrink-0 rounded-full"
          aria-label={`${post.authorDisplayName || author}'s profile`}>
          <LiveAvatar uid={post.authorId} profile={{ name: post.authorDisplayName, username: author, photoURL: post.authorPhoto }} size={38} />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" onClick={() => openUserProfile(post.authorId)} id={titleId}
              className="truncate text-left text-callout font-semibold text-fg hover:opacity-70">
              {author}
            </button>
            <BadgeMark badges={authorCard.badges} />
            <span className="shrink-0 text-caption text-fg-subtle" aria-hidden="true">·</span>
            <time dateTime={isoTime(post.createdAt)} title={fullTime(post.createdAt)}
              className="shrink-0 text-caption text-fg-subtle tabular">
              {shortTime(post.createdAt)}
            </time>
            {post.editedAt && (
              <span className="shrink-0 text-caption text-fg-subtle" title={`Edited ${fullTime(post.editedAt)}`}>· Edited</span>
            )}
            {post.visibility === "followers" && (
              <span className="shrink-0 text-fg-subtle" title="Followers only">
                <Lock size={13} aria-hidden="true" />
                <span className="sr-only">Followers only</span>
              </span>
            )}
          </div>
          {post.location ? (
            <button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(post.location)}`)}
              className="flex max-w-full items-center gap-1 truncate text-caption text-fg-muted hover:text-fg">
              <MapPin size={11} className="shrink-0" aria-hidden="true" /><span className="truncate">{post.location}</span>
            </button>
          ) : post.authorDisplayName && post.authorDisplayName !== author && (
            <p className="truncate text-caption text-fg-subtle">{post.authorDisplayName}</p>
          )}
        </div>
        <IconButton icon={Ellipsis} label="More options" size={20} className="-mr-2 shrink-0" onClick={() => setSheet("menu")} />
      </header>

      {mine && isHeld(post) && (
        <p className="mx-4 mt-2 rounded-control bg-warning-text/10 px-3 py-2 text-caption text-warning-text">
          Several people reported this, so it's out of feeds while a moderator reviews it. If it follows the guidelines, it goes back up.
        </p>
      )}
      {cover && !revealed ? (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-3">
          <EyeOff size={18} className="shrink-0 text-fg-subtle" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-callout text-fg-muted">{cover}</p>
          <button type="button" onClick={() => setRevealed(true)}
            className="press min-h-9 rounded-full px-3 text-callout font-semibold text-accent-text hover:bg-surface-3">
            Show post
          </button>
        </div>
      ) : (
        <PostBody post={post} highlight={highlight} onDoubleTap={likeFromDoubleTap} burst={burst} onSlide={setSlide} engaged={engaged} />
      )}

      <div className="relative mt-1.5 flex items-center px-1.5" role="group" aria-label="Post actions">
        {post.media?.length > 1 && <Dots count={post.media.length} index={slide} />}
        <Action icon={Heart} label={liked ? "Unlike" : "Like"} pressed={liked} count={counts.like} noun="like"
          activeClass="text-like" onClick={like} className={burst ? "anim-heart" : ""} />
        <Action icon={MessageCircle} label="Comments" count={counts.comment} noun="comment"
          onClick={() => setSheet("comments")} />
        <Action icon={Repeat2} label={reposted ? "Undo repost" : "Repost"} pressed={reposted}
          count={counts.repost} noun="repost" activeClass="text-success-text" noFill
          disabled={repostDisabled} onClick={repost} />
        <Action icon={Send} label="Share" onClick={() => setSheet("share")} />
        <span className="flex-1" />
        <Action icon={Bookmark} label={saved ? "Remove from saved" : "Save"} pressed={saved}
          activeClass="text-fg" onClick={save} />
      </div>

      <div className="px-4">
        <SocialProof post={post} counts={counts} seen={seen} hiddenAuthors={hiddenAuthors} mine={mine} hiddenWords={hiddenWords}
          preview={preview} onOpenComments={() => setSheet("comments")} compact={compact}
          caption={media && !(cover && !revealed) && (post.title || post.text) ? <Caption post={post} highlight={highlight} /> : null}
          tags={(post.aiGenerated || post.topics?.length > 0) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {post.aiGenerated && <Badge icon={WandSparkles}>Made with AI</Badge>}
              {post.topics?.map((t) => {
                const it = interestById(t);
                if (!it) return null;
                return (
                  <button key={t} type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(it.label)}`)}
                    className="press inline-flex min-h-7 items-center gap-1 rounded-full px-1 text-label font-semibold text-accent-text hover:underline">
                    #{it.label.toLowerCase().replace(/[^a-z0-9]+/g, "")}
                  </button>
                );
              })}
            </div>
          ) : null} />
        {!compact && seen && !post.locked && !guest && (
          <QuickComment post={post} onAdded={(c) => {
            setPreview(c);
            setCounts((x) => ({ ...x, comment: x.comment + 1 }));
          }} />
        )}
      </div>

      {sheet === "comments" && (
        <Comments post={post} onClose={() => setSheet(null)} onAdded={setPreview}
          onCountChange={(d) => setCounts((c) => ({ ...c, comment: Math.max(0, c.comment + d) }))} />
      )}
      {sheet === "share" && <ShareSheet post={post} onClose={() => setSheet(null)} />}
      {sheet === "menu" && (
        <PostMenu post={post} mine={mine} canModerate={canModerate} onEdit={() => setSheet("edit")}
          onClose={() => setSheet(null)} onRemoved={(why) => onRemoved?.(post.id, why)} />
      )}
      {sheet === "edit" && (
        <EditPostDialog post={post} onClose={() => setSheet(null)}
          onSaved={(changes) => {
            setEdits((prev) => ({ ...prev, ...changes }));
            onChanged?.(post.id, changes);
            setRevealed(false);
            setSheet(null);
          }} />
      )}
    </article>
  );
}
