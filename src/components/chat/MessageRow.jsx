// One message in a conversation, and the things a message can carry: a call log, a shared post, a poll.
import {
  ChartBar, Check, Copy, Ellipsis, Flag, Pencil, Phone, PhoneMissed, Play, Reply, Undo2, Video,
} from "lucide-react";
import { useState } from "react";
import { mediaAlt } from "../../lib/a11y";
import {
  canEdit, groupReactions, kindLabel, me, openPost, openUserProfile, openWatch, QUICK_REACTIONS,
  reactToMessage, tsMillis, unsendMessage, votePoll,
} from "../../lib/db";
import { clockTime, fullTime, plural } from "../../lib/format";
import { navigate } from "../../lib/router";
import { GifView } from "../GifPicker";
import ReportDialog from "../ReportDialog";
import { VoiceNote } from "../Voice";
import Avatar from "../ui/Avatar";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import MediaImg from "../ui/MediaImg";
import { MenuGroup, MenuItem } from "../ui/Menu";
import { useToast } from "../ui/toast-context";
import { LinkedText } from "../ui/RichText";

export function MessageRow({ row, chat, theme, latest, onReply, onEdit }) {
  const { m, first, last } = row;
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const [reporting, setReporting] = useState(false);
  const mine = m.senderId === me();
  // Plain words with a web address in them: the address becomes a link.
  const withLink = !!m.text && !m.poll && !m.gif && !m.sharedPost && !m.call && !m.voice && /https?:\/\/|(^|[^\w.@/])www\./i.test(m.text);
  const name = chat.nicknames?.[m.senderId] || chat.memberNames?.[m.senderId] || "Someone";
  const reactions = groupReactions(m.reactions);
  const sent = tsMillis(m.createdAt); // 0 while the write is still in flight
  const when = sent ? clockTime(sent) : "sending";

  // Corners tighten on the side facing the rest of the run.
  const shape = mine
    ? `rounded-[20px] ${first ? "" : "rounded-tr-md"} ${last ? "" : "rounded-br-md"}`
    : `rounded-[20px] ${first ? "" : "rounded-tl-md"} ${last ? "" : "rounded-bl-md"}`;

  const react = async (emoji) => {
    setMenu(false);
    try { await reactToMessage(chat.id, m, emoji); }
    catch { toast({ tone: "error", title: "Couldn't add that reaction" }); }
  };

  const copy = async () => {
    setMenu(false);
    try { await navigator.clipboard.writeText(m.text || ""); toast({ title: "Copied" }); }
    catch { toast({ tone: "error", title: "Couldn't copy" }); }
  };

  const unsend = async () => {
    try { await unsendMessage(chat.id, m, { latest }); setConfirmUnsend(false); toast({ title: "Message unsent" }); }
    catch { toast({ tone: "error", title: "Couldn't unsend that" }); }
  };

  if (m.deleted) {
    return (
      <li className={`flex ${mine ? "justify-end" : "justify-start pl-9"} ${first ? "mt-3" : "mt-0.5"}`}>
        <span className="rounded-[20px] border border-line px-4 py-2 text-caption italic text-fg-subtle">
          {mine ? "You unsent a message" : `${name} unsent a message`}
        </span>
      </li>
    );
  }

  return (
    <li className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${first ? "mt-3" : "mt-0.5"}`}>
      {!mine && (
        <span className="w-7 shrink-0">
          {last && (
            <button type="button" onClick={() => openUserProfile(m.senderId)} aria-label={`${name}'s profile`}>
              <Avatar profile={{ username: chat.memberNames?.[m.senderId] || "?", name }} size={28} />
            </button>
          )}
        </span>
      )}

      <div className={`flex max-w-[78%] min-w-0 flex-col md:max-w-[65%] ${mine ? "items-end" : "items-start"}`}>
        {chat.isGroup && !mine && first && <span className="mb-1 px-3 text-label font-semibold text-fg-subtle">{name}</span>}

        {m.replyTo && (
          <span className={`mb-1 max-w-full truncate rounded-[16px] border border-line bg-surface px-3 py-1.5 text-caption text-fg-subtle ${mine ? "mr-1" : "ml-1"}`}>
            <Reply size={12} className="mr-1 inline" aria-hidden="true" />{m.replyTo.text}
          </span>
        )}

        <div className={`flex items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
          {withLink ? (
            // A bubble holding a link can't itself be a button (a link inside
            // a button can't be followed), so its actions get their own button.
            <div onClick={(e) => { if (!e.target.closest("a")) setMenu(true); }} onDoubleClick={() => react("❤️")}
              onContextMenu={(e) => { e.preventDefault(); setMenu(true); }} title={sent ? fullTime(sent) : "Sending…"}
              className={`min-w-0 cursor-pointer text-body ${shape} px-4 py-2 ${mine ? `text-white ${theme.bubble}` : "bg-surface-3 text-fg"}`}>
              <LinkedText text={m.text} className="block" />
              {m.editedAt && <span className="block text-right text-label opacity-75">Edited</span>}
            </div>
          ) : m.voice ? (
            // The player has its own buttons, so this bubble can't itself be one.
            <div onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
              className={`${shape} px-3 py-2 ${mine ? `text-white ${theme.bubble}` : "bg-surface-3 text-fg"}`}>
              <VoiceNote chatId={chat.id} voice={m.voice} mine={mine} />
            </div>
          ) : (
          <button type="button" onClick={() => setMenu(true)} onDoubleClick={() => react("❤️")}
            title={sent ? fullTime(sent) : "Sending…"}
            aria-label={`${mine ? "You" : name}${m.poll ? " sent a poll" : m.sharedPost ? " shared a post" : m.gif ? " sent a GIF" : ""}: ${m.call?.summary || m.poll?.question || m.text || m.gif?.title || m.sharedPost?.title || m.sharedPost?.text || ""}. ${when}${m.editedAt ? ", edited" : ""}. Open message actions`}
            className={`min-w-0 text-left text-body ${shape} ${(m.sharedPost || m.gif) && !m.text ? "p-1" : "px-4 py-2"} ${
              m.gif && !m.text ? "bg-transparent" : mine ? `text-white ${theme.bubble}` : "bg-surface-3 text-fg"
            }`}>
            {m.call && <CallLog call={m.call} />}
            {m.gif && <GifView gif={m.gif} className="max-w-[260px]" />}
            {m.poll && <PollView chatId={chat.id} msg={m} mine={mine} />}
            {m.sharedPost && <SharedPostCard post={m.sharedPost} />}
            {!m.poll && m.text && <span className={`block whitespace-pre-wrap break-words ${m.sharedPost ? "px-3 pb-1 pt-2" : ""}`}>{m.text}</span>}
            {m.editedAt && <span className="block text-right text-label opacity-75">Edited</span>}
          </button>
          )}
          {(m.voice || withLink) && <IconButton icon={Ellipsis} label="Message actions" size={16} className="shrink-0" onClick={() => setMenu(true)} />}
          {/* Quick actions appear beside the bubble on hover or keyboard focus. */}
          <span className="hidden shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:inline-flex">
            <IconButton icon={Reply} label="Reply" size={16} onClick={() => onReply(m)} />
          </span>
        </div>

        {reactions.length > 0 && (
          <ul className={`-mt-1.5 flex gap-1 ${mine ? "mr-2" : "ml-2"}`} aria-label="Reactions">
            {reactions.map((r) => (
              <li key={r.emoji}>
                <button type="button" onClick={() => react(r.emoji)} aria-pressed={r.mine}
                  aria-label={`${r.emoji} ${r.uids.length}${r.mine ? ", including you. Remove yours" : ". Add yours"}`}
                  className={`press inline-flex min-h-7 items-center gap-0.5 rounded-full border bg-surface-2 px-1.5 text-caption ${
                    r.mine ? "border-accent-text" : "border-line-strong"
                  }`}>
                  <span aria-hidden="true">{r.emoji}</span>
                  {r.uids.length > 1 && <span className="tabular text-label text-fg-muted" aria-hidden="true">{r.uids.length}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {menu && (
        <Dialog title="Message" hideTitle onClose={() => setMenu(false)}>
          <ul className="mb-3 flex justify-between gap-1" aria-label="React">
            {QUICK_REACTIONS.map((e) => (
              <li key={e}>
                <button type="button" onClick={() => react(e)} aria-label={`React with ${e}`}
                  className="press flex h-12 w-12 items-center justify-center rounded-full text-2xl hover:bg-surface-2">
                  {e}
                </button>
              </li>
            ))}
          </ul>
          <MenuGroup>
            <MenuItem icon={Reply} onClick={() => { setMenu(false); onReply(m); }}>Reply</MenuItem>
            {m.text && <MenuItem icon={Copy} onClick={copy}>Copy text</MenuItem>}
            {canEdit(m) && (
              <MenuItem icon={Pencil} description="For 15 minutes after sending" onClick={() => { setMenu(false); onEdit(m); }}>
                Edit
              </MenuItem>
            )}
            {mine && (
              <MenuItem icon={Undo2} danger description="Removes it for everyone" onClick={() => { setMenu(false); setConfirmUnsend(true); }}>
                Unsend
              </MenuItem>
            )}
            {!mine && m.senderId && (
              <MenuItem icon={Flag} danger description="Only this message is shared with moderators" onClick={() => { setMenu(false); setReporting(true); }}>
                Report message
              </MenuItem>
            )}
          </MenuGroup>
          <p className="mt-3 px-3 text-caption text-fg-subtle">{sent ? `Sent ${fullTime(sent)}` : "Sending…"}</p>
        </Dialog>
      )}
      {reporting && (
        <ReportDialog onClose={() => setReporting(false)}
          target={{ type: "message", id: m.id, authorId: m.senderId, chatId: chat.id, text: m.text || "" }} />
      )}
      {confirmUnsend && (
        <ConfirmDialog title="Unsend this message?" confirmLabel="Unsend message"
          body="It'll be removed for everyone in the conversation." onConfirm={unsend} onClose={() => setConfirmUnsend(false)} />
      )}
    </li>
  );
}

/* A call leaves a line in the conversation: how long it ran, or that it was missed. */
function CallLog({ call }) {
  const missed = !call.seconds;
  const Icon = missed ? PhoneMissed : call.video ? Video : Phone;
  return (
    <span className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${missed ? "bg-danger/20 text-danger-text" : "bg-black/15"}`}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="font-semibold">{call.summary}</span>
    </span>
  );
}

/* A shared post is a real preview that opens the post, not a line of text. */
function SharedPostCard({ post }) {
  const isVideo = post.mediaType?.startsWith("video/");
  const open = (e) => {
    e.stopPropagation();
    if (post.kind === "video") openWatch(post.id);
    else if (post.kind === "short") navigate(`/flicks/${post.id}`);
    else openPost(post.id);
  };
  return (
    <span role="link" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(e); }}
      aria-label={`Open ${kindLabel(post).toLowerCase()} by @${post.authorName}`}
      className="block w-[240px] cursor-pointer overflow-hidden rounded-[16px] bg-surface text-left text-fg ring-1 ring-line-strong hover:ring-fg-subtle">
      {post.mediaUrl ? (
        <span className="relative block aspect-[4/3] bg-black">
          {isVideo ? (
            <>
              <video src={`${post.mediaUrl}#t=1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"><Play size={20} fill="currentColor" /></span>
              </span>
            </>
          ) : (
            <MediaImg src={post.mediaUrl} alt={mediaAlt(post)} loading="lazy" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
          )}
        </span>
      ) : (
        <span className="block border-l-2 border-accent bg-surface-3 px-3 py-4 text-callout">
          <span className="line-clamp-4">{post.text || "View post"}</span>
        </span>
      )}
      <span className="block px-3 py-2">
        <span className="block text-label font-semibold uppercase tracking-wide text-fg-subtle">{kindLabel(post)}</span>
        {(post.title || (post.mediaUrl && post.text)) && (
          <span className="block truncate text-caption font-semibold">{post.title || post.text}</span>
        )}
        <span className="block truncate text-label text-fg-subtle">@{post.authorName}</span>
      </span>
    </span>
  );
}

function PollView({ chatId, msg, mine }) {
  const toast = useToast();
  const votes = msg.poll.votes || {};
  const total = Object.keys(votes).length;
  const myVote = votes[me()];
  const vote = async (e, i) => {
    e.stopPropagation();
    try { await votePoll(chatId, msg, i); }
    catch { toast({ tone: "error", title: "Couldn't record your vote" }); }
  };
  return (
    <span className="block min-w-[220px] py-1">
      <span className="mb-2 flex items-center gap-1.5 font-semibold"><ChartBar size={15} aria-hidden="true" /> {msg.poll.question}</span>
      <span className="block space-y-1.5" role="group" aria-label="Poll options">
        {msg.poll.options.map((o, i) => {
          const count = Object.values(votes).filter((v) => v === i).length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <span key={i} role="button" tabIndex={0} aria-pressed={myVote === i}
              aria-label={`${o.text}, ${pct}%${myVote === i ? ", your vote" : ""}`}
              onClick={(e) => vote(e, i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") vote(e, i); }}
              className={`relative block min-h-10 cursor-pointer overflow-hidden rounded-[12px] border px-3 py-2 text-caption ${
                myVote === i ? (mine ? "border-white" : "border-accent-text") : mine ? "border-white/40" : "border-line-strong"
              }`}>
              <span className={`absolute inset-y-0 left-0 ${mine ? "bg-white/20" : "bg-accent-soft"}`} style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="relative flex justify-between gap-3">
                <span className="flex items-center gap-1.5">{myVote === i && <Check size={13} aria-hidden="true" />}{o.text}</span>
                <span className="tabular opacity-80" aria-hidden="true">{pct}%</span>
              </span>
            </span>
          );
        })}
      </span>
      <span className="mt-1.5 block text-label opacity-75">{plural(total, "vote")}</span>
    </span>
  );
}
