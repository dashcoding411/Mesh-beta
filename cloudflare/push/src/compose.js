// What each notification says, who gets it, and whether a device wants it.
// Pure, so it can be tested without Firestore or a push service.

// The kinds a device can switch on or off. Likes and reposts are never
// pushed: Mesh doesn't buzz people to bring them back.
export const KINDS = ["messages", "calls", "comments", "follows", "gatherings", "rolls", "account"];
// Brick mode keeps a device quiet except for these.
const ALWAYS = new Set(["messages", "calls"]);

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const handle = (name) => (name ? `@${name}` : "Someone");

/** Whether a device should get a notification of `kind` right now. */
export function wants(device, kind, now = Date.now()) {
  let kinds = [];
  try { kinds = JSON.parse(device.kinds || "[]"); } catch { kinds = []; }
  if (!kinds.includes(kind)) return false;
  return ALWAYS.has(kind) || !(Number(device.quiet_until || 0) > now);
}

/** A short line for a message, without its content when `preview` is false. */
export function messageLine(msg, preview) {
  if (msg.voice) return "Voice message";
  if (msg.photo) return "Photo";
  if (msg.gif) return "GIF";
  if (msg.poll) return preview ? `Poll: ${clip(msg.poll.question, 80)}` : "Poll";
  if (msg.sharedPost) return "Shared a post";
  if (!preview) return "Sent you a message";
  if (msg.storyReply) return `Replied to your story: ${clip(msg.text, 100)}`;
  if (msg.thoughtReply) return `Replied to your note: ${clip(msg.text, 100)}`;
  return clip(msg.text, 120) || "Sent you a message";
}

/**
 * Notifications for a new chat message, one per member who should hear about
 * it: not the sender, and not people who muted or declined the chat. Content
 * is shown only when the chat isn't a request for them (they started it,
 * accepted it, or follow whoever started it: `followers`), so a stranger's
 * words never land on someone's lock screen.
 */
export function messagePushes(chat, msg, senderId, followers = new Set()) {
  if (!chat || !msg || msg.senderId !== senderId || msg.deleted || msg.call) return [];
  const muted = new Set([...(chat.mutedBy || []), ...(chat.declinedBy || [])]);
  const accepted = new Set(chat.acceptedBy || []);
  const from = handle(chat.memberNames?.[senderId]);
  const group = !!chat.isGroup || (chat.members || []).length > 2;
  return (chat.members || [])
    .filter((uid) => uid !== senderId && !muted.has(uid))
    .map((uid) => {
      const preview = chat.createdBy === uid || accepted.has(uid) || followers.has(uid);
      const line = messageLine(msg, preview);
      return {
        uid,
        kind: "messages",
        payload: {
          title: group ? clip(chat.name || "Group chat", 60) : from,
          body: group ? `${from}: ${line}` : line,
          url: `/messages/${chat.id}`,
          tag: `chat-${chat.id}`,
        },
      };
    });
}

/** A notice from someone's activity, or null for kinds Mesh doesn't push. */
export function noticePush(notice, to) {
  const who = handle(notice.actorName);
  const quote = notice.text ? `: ${clip(notice.text, 100)}` : "";
  const post = notice.postId ? `/p/${notice.postId}` : "/notifications";
  const make = (kind, title, body, url) => ({ uid: to, kind, payload: { title, body, url, tag: `notice-${notice.id}` } });
  switch (notice.type) {
    case "comment": return make("comments", who, `Commented${quote}`, post);
    case "reply": return make("comments", who, `Replied to your comment${quote}`, post);
    case "mention": return make("comments", who, `Mentioned you${quote}`, post);
    case "echo": return make("comments", who, `Echoed your story${quote}`, "/notifications");
    case "follow": return make("follows", who, "Started following you", `/@${notice.actorName}`);
    case "request": return make("follows", who, "Asked to follow you", "/notifications");
    case "accept": return make("follows", who, "Accepted your follow request", `/@${notice.actorName}`);
    case "invite": return make("gatherings", who, "Invited you to a gathering", `/gatherings/${notice.ref}`);
    case "joined": return make("account", "You're in", `${who} let you into a circle`, `/circles/${notice.ref}`);
    case "family": return make("account", who, "Wants to add parental controls to your account", "/account/brick");
    case "familyok": return make("account", who, "Accepted parental controls", "/account/brick");
    case "familyask": return make("account", who, `Asked you to change their limits${quote}`, "/account/brick");
    case "appeal": return make("account", "Mesh", notice.text === "overturned" ? "Your appeal was accepted" : "Your appeal was looked at", "/notifications");
    case "journalist": return notice.text === "approved"
      ? make("account", "Mesh", "You're a journalist on Mesh. Set up your byline to start writing.", "/news/desk")
      : make("account", "Mesh", "Your journalist application was looked at", "/account/settings");
    default: return null; // likes, reposts, story likes: in the app only
  }
}

export function callPush(call) {
  return {
    uid: call.calleeId,
    kind: "calls",
    payload: {
      title: handle(call.callerName),
      body: call.video ? "Video calling you" : "Calling you",
      url: call.chatId ? `/messages/${call.chatId}` : "/messages",
      tag: `call-${call.id}`,
    },
  };
}

export function rollAlert(roll, uid) {
  return {
    id: `roll:${roll.id}:${uid}`,
    uid,
    kind: "rolls",
    ref: roll.id,
    title: "Your roll has developed",
    body: `${clip(roll.title, 60)}: everyone's photos are in`,
    url: `/rolls/${roll.id}`,
  };
}

export const REMIND_BEFORE_MS = 2 * 3600000;

export function gatheringAlert(event, uid) {
  return {
    id: `gathering:${event.id}:${uid}`,
    uid,
    kind: "gatherings",
    ref: event.id,
    title: `${clip(event.title, 60)} starts in 2 hours`,
    body: event.location ? clip(event.location, 100) : "Tap to see the details",
    url: `/gatherings/${event.id}`,
  };
}

// Push services Mesh will deliver to. Anything else is refused, so the
// Worker can't be pointed at an arbitrary address.
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
export function pushEndpointOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch { return false; }
}
