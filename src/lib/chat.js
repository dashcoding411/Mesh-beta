import { me } from "./db";

export function chatTitle(chat) {
  if (chat.isGroup) return chat.name || "Group chat";
  const other = chat.members.find((m) => m !== me());
  return chat.nicknames?.[other] || chat.memberNames?.[other] || "Unknown";
}

export function chatAvatar(chat) {
  if (chat.isGroup) return { name: chat.name || "Group" };
  const other = chat.members.find((m) => m !== me());
  return { username: chat.memberNames?.[other] || "?", name: chat.nicknames?.[other] };
}

/** The other member of a 1:1 chat, for their live profile photo. */
export function chatPeer(chat) {
  return chat.isGroup ? null : chat.members.find((m) => m !== me()) || null;
}
