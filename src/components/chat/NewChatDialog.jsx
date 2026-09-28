// Starting a conversation or a group.
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createGroupChat, me, openDirectChat, searchUsers } from "../../lib/db";
import { LIMITS } from "../../lib/validate";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import { EmptyState, InlineMessage } from "../ui/States";
import { useToast } from "../ui/toast-context";

/* New message or new group. A message goes to one person; a group needs at
   least two others and takes an optional name. People who only accept
   messages from accounts they follow are skipped, with a note saying who. */
export function NewChatDialog({ onClose, onCreated, group = false }) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const needed = group ? 2 : 1;

  useEffect(() => {
    const t = setTimeout(async () => {
      if (term.trim().length >= 1) {
        const users = await searchUsers(term).catch(() => []);
        setResults(users.filter((u) => u.id !== me() && !selected.some((s) => s.id === u.id)));
      } else setResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [term, selected]);

  const pick = (u) => {
    setSelected(group ? [...selected, u] : [u]);
    setTerm("");
    inputRef.current?.focus();
  };

  const start = async () => {
    setError("");
    if (selected.length < needed) return setError(group ? "Pick at least two people for a group." : "Pick someone to message.");
    setBusy(true);
    try {
      if (!group) {
        onCreated(await openDirectChat(selected[0]));
        return;
      }
      const name = groupName.trim() || selected.map((s) => s.username).slice(0, 3).join(", ");
      const { id, skipped } = await createGroupChat(name.slice(0, LIMITS.chatName.max), selected);
      if (skipped.length) {
        toast({ tone: "info", title: `Group made without ${skipped.map((u) => `@${u.username}`).join(", ")}`, body: "They only accept group adds from people they follow." });
      }
      onCreated(id);
    } catch (err) {
      console.error(err);
      setError(err?.message?.startsWith("You can't message") ? err.message : "Couldn't start the conversation. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={group ? "New group" : "New message"} onClose={onClose} initialFocusRef={inputRef}
      footer={
        <div className="space-y-2">
          <div aria-live="polite"><InlineMessage>{error}</InlineMessage></div>
          <Button variant="primary" full loading={busy} disabled={selected.length < needed} onClick={start}>
            {group ? (selected.length >= 2 ? `Create group with ${selected.length} people` : "Pick at least two people") : "Start conversation"}
          </Button>
        </div>
      }>
      {group && (
        <Field label="Group name" optional className="mb-4">
          <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={LIMITS.chatName.max}
            placeholder={selected.length ? selected.map((s) => s.username).slice(0, 3).join(", ") : "e.g. Weekend plans"} />
        </Field>
      )}
      {selected.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Selected people">
          {selected.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => setSelected(selected.filter((s) => s.id !== u.id))}
                aria-label={`Remove @${u.username}`}
                className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft pl-1 pr-3 text-caption font-semibold text-accent-ring">
                <Avatar profile={u} size={24} /> @{u.username} <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="new-chat-search" className="sr-only">Search by handle</label>
      <Input id="new-chat-search" ref={inputRef} placeholder={group ? "Add people by handle" : "Search by handle"} value={term} autoCapitalize="none"
        onChange={(e) => setTerm(e.target.value)} />
      <ul className="mt-3 space-y-1">
        {results?.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => pick(u)}
              className="press flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2">
              <Avatar profile={u} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-callout font-medium">{u.name || u.username}</span>
                <span className="block truncate text-caption text-fg-subtle">@{u.username}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {results?.length === 0 && <EmptyState compact title={`No one called “${term.trim()}”`} body="Handles are exact, so check the spelling." />}
    </Dialog>
  );
}
