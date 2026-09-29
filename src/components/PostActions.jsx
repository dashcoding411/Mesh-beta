import { useState } from "react";
import {
  Link2, Share2, EyeOff, Flag, Trash2, UserRound, Check, Send, ShieldAlert, Pencil, VolumeX,
} from "lucide-react";
import {
  sendPostTo, hidePost, reportPost, deletePost, openUserProfile, kindLabel, me,
} from "../lib/db";
import { postUrl } from "../lib/router";
import { useShell } from "./shell/ShellContext";
import Dialog, { ConfirmDialog } from "./ui/Dialog";
import { MenuItem, MenuGroup } from "./ui/Menu";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { EmptyState } from "./ui/States";
import { useToast } from "./ui/toast-context";
import ReportDialog from "./ReportDialog";

async function copyLink(post, toast) {
  try {
    await navigator.clipboard.writeText(postUrl(post));
    toast({ title: "Link copied" });
  } catch {
    toast({ tone: "error", title: "Couldn't copy the link", body: postUrl(post) });
  }
}

/* Share: out of Mesh (the phone's own share sheet, or a copied link), or to
   someone inside it. Sending to a person is the strongest signal the ranker
   has, so it gets a real picker, not an afterthought. */
export function ShareSheet({ post, onClose }) {
  const { inbox } = useShell();
  const toast = useToast();
  const [sent, setSent] = useState(new Set());
  const [busy, setBusy] = useState("");
  const chats = inbox.chats;
  // A chat preview copies the post's text and picture into the conversation,
  // which would carry a members-only post outside its circle.
  const membersOnly = post.visibility === "circle" || post.visibility === "pending";
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const nativeShare = async () => {
    try {
      await navigator.share({ title: post.title || `${kindLabel(post)} on Mesh`, url: postUrl(post) });
    } catch { /* dismissed, nothing to report */ }
  };

  const send = async (chat) => {
    setBusy(chat.id);
    try {
      await sendPostTo(post, chat.id);
      setSent((prev) => new Set(prev).add(chat.id));
    } catch (err) {
      console.error(err);
      toast({ tone: "error", title: "Couldn't send", body: "Try again in a moment." });
    } finally { setBusy(""); }
  };

  const titleOf = (c) => {
    if (c.isGroup) return c.name || "Group chat";
    const other = c.members.find((m) => m !== me());
    return c.nicknames?.[other] || c.memberNames?.[other] || "Unknown";
  };

  return (
    <Dialog title={`Share ${kindLabel(post).toLowerCase()}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {canNativeShare && (
          <Button icon={Share2} onClick={nativeShare} className="col-span-1">Share via…</Button>
        )}
        <Button icon={Link2} onClick={() => copyLink(post, toast)} className={canNativeShare ? "" : "col-span-2"}>
          Copy link
        </Button>
      </div>

      <p className="mb-2 mt-6 text-label font-semibold uppercase tracking-wider text-fg-subtle">Send in Messages</p>
      {membersOnly ? (
        <p className="flex gap-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          This is only for members of its circle, so it can't be sent into a conversation. The link works for members.
        </p>
      ) : (<>
      {chats === null && <p className="py-4 text-callout text-fg-muted">Loading conversations…</p>}
      {post.visibility === "followers" && (
        <p className="mb-2 flex gap-2 rounded-control bg-surface-2 p-3 text-caption text-fg-muted">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          This is followers-only. People in the chat who don't follow the author will see that it's unavailable.
        </p>
      )}
      {chats?.length === 0 && (
        <EmptyState compact icon={Send} title="No conversations yet"
          body="Start one from Messages or someone's profile, then share straight into it." />
      )}
      <ul className="space-y-1">
        {chats?.map((c) => {
          const done = sent.has(c.id);
          return (
            <li key={c.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
              <Avatar profile={{ username: titleOf(c) }} size={40} />
              <span className="min-w-0 flex-1 truncate text-callout font-medium">{titleOf(c)}</span>
              <Button size="sm" variant={done ? "ghost" : "primary"} loading={busy === c.id}
                disabled={done} icon={done ? Check : undefined} onClick={() => send(c)}>
                {done ? "Sent" : "Send"}
              </Button>
            </li>
          );
        })}
      </ul>
      </>)}
    </Dialog>
  );
}

/* The ⋯ menu. What's offered depends on whose post it is, and deleting
   always asks first, naming exactly what goes. */
export function PostMenu({ post, mine, canModerate, onClose, onRemoved, onEdit }) {
  const toast = useToast();
  const { toggleMute } = useShell();
  const [mode, setMode] = useState("menu"); // menu | report | delete
  const [busy, setBusy] = useState(false);
  const label = kindLabel(post);

  const hide = async () => {
    setBusy(true);
    try {
      await hidePost(post);
      onClose();
      onRemoved();
      toast({ title: "Got it. You'll see less like this" });
    } catch {
      setBusy(false);
      toast({ tone: "error", title: "Couldn't hide that post" });
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deletePost(post);
      onClose();
      onRemoved();
      toast({ title: `${label} deleted` });
    } catch {
      setBusy(false);
      toast({ tone: "error", title: `Couldn't delete the ${label.toLowerCase()}`, body: "Try again in a moment." });
    }
  };

  if (mode === "delete") {
    return (
      <ConfirmDialog title={`Delete this ${label.toLowerCase()}?`} confirmLabel={`Delete ${label.toLowerCase()}`}
        body="It'll be removed for everyone, including anywhere it was reposted. This can't be undone."
        busy={busy} onConfirm={remove} onClose={onClose} />
    );
  }

  if (mode === "report") {
    return (
      <ReportDialog target={{ type: "post", id: post.id, authorId: post.authorId }} onClose={onClose}
        report={(t, reason, details) => reportPost(post, reason, details)}
        // Reporting also hides it from your own feed straight away.
        onReported={onRemoved} />
    );
  }

  return (
    <Dialog title="Post options" onClose={onClose} hideTitle>
      <MenuGroup>
        {/* Circle posts aren't editable: an edit could slip past the circle's own rules. */}
        {mine && !post.groupId && onEdit && (
          <MenuItem icon={Pencil} onClick={onEdit}>Edit {label.toLowerCase()}</MenuItem>
        )}
        <MenuItem icon={Link2} onClick={() => { copyLink(post, toast); onClose(); }}>Copy link</MenuItem>
        {!mine && (
          <MenuItem icon={UserRound} onClick={() => { onClose(); openUserProfile(post.authorId); }}>
            View @{post.authorName}'s profile
          </MenuItem>
        )}
        {!mine && (
          <MenuItem icon={EyeOff} onClick={hide} disabled={busy} description="Hide it and show fewer posts like it">
            Not interested
          </MenuItem>
        )}
        {!mine && (
          <MenuItem icon={VolumeX} description="Stop seeing their posts without unfollowing. They won't know"
            onClick={() => { onClose(); toggleMute({ id: post.authorId, username: post.authorName }, true); }}>
            Mute @{post.authorName}
          </MenuItem>
        )}
        {!mine && <MenuItem icon={Flag} danger onClick={() => setMode("report")}>Report post</MenuItem>}
        {(mine || canModerate) && (
          <MenuItem icon={Trash2} danger onClick={() => setMode("delete")}>
            {mine ? `Delete ${label.toLowerCase()}` : "Remove from circle"}
          </MenuItem>
        )}
      </MenuGroup>
    </Dialog>
  );
}
