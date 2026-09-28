// A conversation's details: members, admins, names, theme, nicknames, blocking and leaving.
import { Ban, Check, LogOut, Mail, Palette, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { chatTitle } from "../../lib/chat";
import {
  addToGroup, blockUser, CHAT_THEMES, groupAdmins, leaveGroupChat, me, openUserProfile,
  removeFromGroup, renameGroupChat, searchUsers, setChatTheme, setGroupAdmin, setNickname,
  unblockUser,
} from "../../lib/db";
import { plural } from "../../lib/format";
import { navigate } from "../../lib/router";
import { LIMITS } from "../../lib/validate";
import { useShell } from "../shell/ShellContext";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import { Field, Input, Select } from "../ui/Field";
import IconButton from "../ui/IconButton";
import { MenuGroup, MenuItem } from "../ui/Menu";
import { EmptyState } from "../ui/States";
import { useToast } from "../ui/toast-context";

/* Conversation details. For a group: its name, who's in it, who runs it,
   adding people, and leaving. For one-to-one: nicknames and blocking. Theme
   for both. Every membership change is checked by the rules, not just here. */
export function ChatDetails({ chat, onClose }) {
  const toast = useToast();
  const { inbox, blocked, setBlocked } = useShell();
  const others = chat.members.filter((m) => m !== me());
  const admins = groupAdmins(chat);
  const amAdmin = admins.includes(me());
  const [target, setTarget] = useState(others[0] || "");
  const [nick, setNick] = useState("");
  const [name, setName] = useState(chat.name || "");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null); // add | leave | block
  const nameOf = (uid) => (uid === me() ? "You" : `@${chat.memberNames?.[uid] || "member"}`);
  const other = !chat.isGroup ? others[0] : null;
  const otherBlocked = other && blocked.has(other);

  const run = async (fn, done, fail = "That didn't work") => {
    try { await fn(); if (done) toast({ title: done }); }
    catch (e) { toast({ tone: "error", title: e?.code === "permission-denied" ? "Only group admins can do that" : fail }); }
  };

  const theme = (id) => run(() => setChatTheme(chat.id, id), `Theme: ${CHAT_THEMES[id].label}`, "Couldn't change the theme");

  const saveNick = async (e) => {
    e.preventDefault();
    try {
      await setNickname(chat.id, target, nick.trim());
      setNick("");
      setError("");
      toast({ title: nick.trim() ? "Nickname saved" : "Nickname cleared" });
    } catch { setError("Couldn't save the nickname."); }
  };

  const rename = async (e) => {
    e.preventDefault();
    const t = name.trim();
    if (t.length < LIMITS.chatName.min) return setError(`Group names need at least ${LIMITS.chatName.min} characters.`);
    setError("");
    run(() => renameGroupChat(chat.id, t.slice(0, LIMITS.chatName.max)), "Group renamed", "Couldn't rename the group");
  };

  const toggleBlock = async () => {
    const who = { id: other, username: chat.memberNames?.[other] };
    try {
      if (otherBlocked) {
        await unblockUser(other);
        setBlocked((prev) => { const n = new Set(prev); n.delete(other); return n; });
        toast({ title: `Unblocked ${nameOf(other)}` });
      } else {
        await blockUser(who);
        setBlocked((prev) => new Set(prev).add(other));
        toast({ title: `Blocked ${nameOf(other)}`, body: "They can't message you, follow you or comment on your posts." });
      }
      setDialog(null);
    } catch { toast({ tone: "error", title: "Couldn't update the block" }); }
  };

  return (
    <Dialog title={chat.isGroup ? chatTitle(chat) : "Conversation details"} onClose={onClose} size="lg">
      <div className="space-y-7">
        {chat.isGroup && (
          <form onSubmit={rename} className="flex items-end gap-2">
            <Field label="Group name" className="flex-1" error={error && dialog === null ? error : ""}>
              <Input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} maxLength={LIMITS.chatName.max} />
            </Field>
            <Button type="submit" disabled={name.trim() === (chat.name || "")}>Rename</Button>
          </form>
        )}

        {chat.isGroup && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle">
                <Users size={13} aria-hidden="true" /> {plural(chat.members.length, "member")}
              </h3>
              <Button size="sm" icon={UserPlus} onClick={() => setDialog("add")}>Add people</Button>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {chat.members.map((uid) => {
                const isAdmin = admins.includes(uid);
                return (
                  <li key={uid} className="flex min-h-14 flex-wrap items-center gap-3 px-3 py-2">
                    <button type="button" onClick={() => { if (uid !== me()) { onClose(); openUserProfile(uid); } }}
                      className="press flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Avatar profile={{ username: chat.memberNames?.[uid] || "?" }} size={36} />
                      <span className="truncate text-callout">{nameOf(uid)}</span>
                      {isAdmin && <Badge tone="accent" icon={ShieldCheck}>Admin</Badge>}
                    </button>
                    {amAdmin && uid !== me() && (
                      <span className="flex gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => run(() => setGroupAdmin(chat, uid, !isAdmin), isAdmin ? "No longer an admin" : "Made an admin")}>
                          {isAdmin ? "Remove admin" : "Make admin"}
                        </Button>
                        <IconButton icon={UserMinus} label={`Remove ${nameOf(uid)} from the group`} size={18}
                          onClick={() => run(() => removeFromGroup(chat, uid), `Removed ${nameOf(uid)}`)} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!amAdmin && <p className="mt-2 text-caption text-fg-subtle">Only admins can remove people. Anyone in the group can add people.</p>}
          </section>
        )}

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-fg-subtle"><Palette size={13} aria-hidden="true" /> Theme</h3>
          <div role="radiogroup" aria-label="Chat theme" className="flex flex-wrap gap-3">
            {Object.entries(CHAT_THEMES).map(([id, t]) => {
              const on = (chat.theme || "default") === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} aria-label={t.label} onClick={() => theme(id)}
                  className="press flex flex-col items-center gap-1.5">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full ${t.bubble} ${on ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}>
                    {on && <Check size={18} className="text-white" aria-hidden="true" />}
                  </span>
                  <span className="text-label text-fg-muted">{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-label font-semibold uppercase tracking-wider text-fg-subtle">Nicknames</h3>
          <form onSubmit={saveNick} className="space-y-3">
            {chat.isGroup && (
              <Field label="Who">
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {others.map((uid) => <option key={uid} value={uid}>@{chat.memberNames?.[uid] || uid.slice(0, 6)}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Nickname" hint="Only shown inside this conversation. Leave blank to clear it." error={!chat.isGroup ? error : ""}>
              <Input value={nick} onChange={(e) => { setNick(e.target.value); setError(""); }} maxLength={30}
                placeholder={chat.nicknames?.[target] || "Set a nickname"} />
            </Field>
            <Button type="submit" size="sm">Save nickname</Button>
          </form>
        </section>

        <MenuGroup>
          <MenuItem icon={Mail} onClick={async () => { await inbox.markChatUnread(chat.id); onClose(); navigate("/messages"); }}>
            Mark as unread
          </MenuItem>
          {chat.isGroup ? (
            <MenuItem icon={LogOut} danger onClick={() => setDialog("leave")}
              description={amAdmin && admins.length === 1 && others.length ? "Someone else will become the admin" : undefined}>
              Leave group
            </MenuItem>
          ) : (
            <MenuItem icon={Ban} danger={!otherBlocked} onClick={() => setDialog("block")}
              description={otherBlocked ? undefined : "They won't be able to message you, follow you or comment on your posts"}>
              {otherBlocked ? `Unblock ${nameOf(other)}` : `Block ${nameOf(other)}`}
            </MenuItem>
          )}
        </MenuGroup>
      </div>

      {dialog === "add" && <AddPeopleDialog chat={chat} onClose={() => setDialog(null)} />}
      {dialog === "leave" && (
        <ConfirmDialog title={`Leave ${chatTitle(chat)}?`} confirmLabel="Leave group"
          body="You'll stop getting its messages. Someone in the group would need to add you back."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try { await leaveGroupChat(chat); onClose(); navigate("/messages", { replace: true }); toast({ title: "You left the group" }); }
            catch { toast({ tone: "error", title: "Couldn't leave the group" }); }
          }} />
      )}
      {dialog === "block" && (
        <ConfirmDialog title={otherBlocked ? `Unblock ${nameOf(other)}?` : `Block ${nameOf(other)}?`}
          confirmLabel={otherBlocked ? "Unblock" : "Block"} tone={otherBlocked ? "accent" : "danger"}
          body={otherBlocked
            ? "They'll be able to follow you and message you again. They won't be told."
            : "They won't be told. They can't message you, follow you or comment on your posts, and you'll stop seeing their posts."}
          onClose={() => setDialog(null)} onConfirm={toggleBlock} />
      )}
    </Dialog>
  );
}

function AddPeopleDialog({ chat, onClose }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      if (term.trim().length >= 1) {
        const users = await searchUsers(term).catch(() => []);
        setResults(users.filter((u) => !chat.members.includes(u.id)));
      } else setResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [term, chat.members]);

  const add = async (u) => {
    setBusy(u.id);
    const skipped = await addToGroup(chat.id, [u]);
    setBusy("");
    if (skipped.length) toast({ tone: "error", title: `Couldn't add @${u.username}`, body: "They only accept messages and group adds from people they follow." });
    else {
      toast({ title: `Added @${u.username}` });
      setResults((r) => r?.filter((x) => x.id !== u.id) || null);
    }
  };

  return (
    <Dialog title="Add people" onClose={onClose}>
      <label htmlFor="add-people" className="sr-only">Search by handle</label>
      <Input id="add-people" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by handle" autoCapitalize="none" />
      <ul className="mt-3 space-y-1">
        {results?.map((u) => (
          <li key={u.id} className="flex min-h-14 items-center gap-3 rounded-control px-2">
            <Avatar profile={u} size={36} />
            <span className="min-w-0 flex-1 truncate text-callout">@{u.username}</span>
            <Button size="sm" variant="primary" icon={UserPlus} loading={busy === u.id} onClick={() => add(u)}>Add</Button>
          </li>
        ))}
      </ul>
      {results?.length === 0 && <EmptyState compact title={`No one to add called “${term.trim()}”`} body="Handles are exact, so check the spelling." />}
    </Dialog>
  );
}
