// Search for Settings: every setting, including ones on other pages, with
// the words people actually use for them. Results are ranked by where the
// match is (the name beats synonyms beats the description), whole words beat
// the start of a word beats the middle, and small typos still find things.

// `go`: { scroll } a row on the Settings page, { dialog } one of its dialogs,
// { path } another page, or { run } an action Settings knows.
export const SETTINGS_INDEX = [
  // Account
  { id: "profile", label: "Edit profile", group: "Account", keywords: ["name", "bio", "photo", "picture", "avatar", "pronouns", "town", "profile pic"], desc: "Your name, bio, photo and pronouns", go: { path: "/account" } },
  { id: "username", label: "Change your handle", group: "Account", keywords: ["username", "handle", "@", "rename"], desc: "Once every 30 days, from your profile", go: { path: "/account" } },
  { id: "email", label: "Email", group: "Account", keywords: ["email address", "verify", "verification", "mail"], desc: "Your sign-in email, and verifying it", go: { scroll: "email" } },
  { id: "phone", label: "Phone number", group: "Account", keywords: ["mobile", "sms", "number"], desc: "The number you sign in with", go: { scroll: "phone" } },
  { id: "signin", label: "Sign-in methods", group: "Account", keywords: ["google", "apple", "login", "log in", "provider"], desc: "How you sign in", go: { scroll: "signin" } },
  { id: "password", label: "Change password", group: "Account", keywords: ["password", "reset password", "forgot password", "security", "pw"], desc: "Set or change your password", go: { dialog: "password", scroll: "password" } },
  { id: "birthyear", label: "Birth year", group: "Account", keywords: ["age", "birthday", "dob", "date of birth", "16"], desc: "Used only for age rules", go: { scroll: "birthyear" } },

  // Your time
  { id: "brick", label: "Brick mode", group: "Your time", keywords: ["screen time", "limits", "daily limit", "time limit", "lock", "focus", "addiction", "doomscrolling", "break"], desc: "Daily limits, schedules and instant bricks", go: { path: "/account/brick" } },
  { id: "brick-now", label: "Brick me now", group: "Your time", keywords: ["lock now", "exam", "study", "detox", "pause"], desc: "Lock Mesh to messages and calls for a while", go: { path: "/account/brick" } },
  { id: "brick-schedule", label: "Scheduled brick times", group: "Your time", keywords: ["schedule", "bedtime", "night", "morning", "weekly"], desc: "Lock Mesh at the same times every week", go: { path: "/account/brick" } },
  { id: "brick-groups", label: "Brick groups and leaderboard", group: "Your time", keywords: ["leaderboard", "friends", "streak", "compete", "bricked time"], desc: "Compare bricked time with friends", go: { path: "/leaderboard" } },
  { id: "family", label: "Parental controls", group: "Your time", keywords: ["parent", "family", "teen", "child", "kid", "guardian", "supervision"], desc: "A parent's limits for an under-18 account", go: { path: "/account/family" } },
  { id: "week", label: "Your week on Mesh", group: "Your time", keywords: ["recap", "weekly", "summary", "stats", "usage", "time spent"], desc: "Time on Mesh, gatherings and more", go: { path: "/account/week" } },

  // Privacy
  { id: "private", label: "Private account", group: "Privacy", keywords: ["private", "public", "hide profile", "who can see", "visibility", "lock account"], desc: "Only followers you approve see your posts", go: { scroll: "private" } },
  { id: "requests", label: "Follow requests", group: "Privacy", keywords: ["approve", "pending", "requests", "followers"], desc: "People asking to follow you", go: { dialog: "requests" } },
  { id: "messages", label: "Who can message you", group: "Privacy", keywords: ["dm", "dms", "direct messages", "message requests", "inbox", "chat"], desc: "Everyone, or only people you follow", go: { dialog: "messages" } },
  { id: "comments", label: "Who can comment on your posts", group: "Privacy", keywords: ["comments", "replies", "turn off comments", "disable comments"], desc: "Everyone, people you follow, or no one", go: { dialog: "comments" } },
  { id: "contacts", label: "Contacts", group: "Privacy", keywords: ["find friends", "sync contacts", "address book", "phone contacts", "findable", "people you may know"], desc: "Find friends, and whether they can find you", go: { dialog: "contacts" } },

  { id: "notifications", label: "Notifications", group: "Activity", keywords: ["alerts", "push", "notify", "likes", "follows", "mentions"], desc: "Your notifications. There's nothing to switch on or off yet", go: { path: "/notifications" } },

  // What you see
  { id: "interests", label: "Your interests", group: "What you see", keywords: ["topics", "feed", "for you", "recommendations", "algorithm"], desc: "Shapes For you, Flicks and suggestions", go: { run: "interests" } },
  { id: "hidden", label: "Hidden words", group: "What you see", keywords: ["mute words", "filter", "block words", "spoilers", "keywords", "triggers"], desc: "Hide posts and comments with these words", go: { dialog: "hidden" } },
  { id: "hide-ai", label: "Hide posts edited with AI", group: "What you see", keywords: ["ai", "artificial intelligence", "edited", "generated", "filter"], desc: "Keep AI-edited posts out of your feeds", go: { scroll: "hide-ai" } },

  // Blocked and muted
  { id: "muted", label: "Muted accounts", group: "Blocked and muted", keywords: ["mute", "unmute", "silence", "hide someone"], desc: "People whose posts you don't see", go: { dialog: "muted" } },
  { id: "blocked", label: "Blocked accounts", group: "Blocked and muted", keywords: ["block", "unblock", "blocking", "harassment", "stop someone"], desc: "People who can't reach you", go: { dialog: "blocked" } },

  // Appearance and accessibility
  { id: "theme", label: "Theme", group: "Appearance", keywords: ["dark mode", "light mode", "night mode", "colours", "colors", "appearance"], desc: "Light, dark or follow your device", go: { scroll: "look-theme" } },
  { id: "text", label: "Text size", group: "Appearance", keywords: ["font size", "bigger text", "smaller text", "zoom", "readability", "large text"], desc: "Make all text bigger or smaller", go: { scroll: "look-text" } },
  { id: "contrast", label: "Contrast", group: "Appearance", keywords: ["high contrast", "accessibility", "visibility", "borders"], desc: "Stronger text and outlines", go: { scroll: "look-contrast" } },
  { id: "motion", label: "Motion", group: "Appearance", keywords: ["reduce motion", "animations", "accessibility", "vestibular"], desc: "Turn off animations", go: { scroll: "look-motion" } },
  { id: "autoplay", label: "Videos in feeds", group: "Appearance", keywords: ["autoplay", "data saver", "video", "mobile data", "sound"], desc: "Autoplay, or tap to play", go: { scroll: "look-autoplay" } },

  // Your data
  { id: "export", label: "Download your data", group: "Your data", keywords: ["export", "download", "backup", "copy of my data", "gdpr", "data request"], desc: "Everything Mesh holds about you, as a file", go: { scroll: "export" } },
  { id: "cookies", label: "Cookies and storage", group: "Your data", keywords: ["cookies", "consent", "tracking", "privacy choices", "storage", "ads choices"], desc: "What's allowed to load on this device", go: { run: "cookies" } },
  { id: "archive", label: "Story archive", group: "Your data", keywords: ["old stories", "past stories", "archive", "highlights"], desc: "Every story you've posted", go: { path: "/account/archive" } },
  { id: "saved", label: "Saved posts and albums", group: "Your data", keywords: ["saved", "bookmarks", "albums", "collections"], desc: "On your profile", go: { path: "/saved" } },

  // Help and policies
  { id: "tour", label: "Take the tour", group: "Help", keywords: ["tutorial", "help", "how to use", "guide", "walkthrough"], desc: "A quick look at where everything is", go: { run: "tour" } },
  { id: "contact", label: "Contact Mesh", group: "Help", keywords: ["support", "help", "email us", "report a problem", "bug", "feedback"], desc: "Email the Mesh team", go: { run: "contact" } },
  { id: "guidelines", label: "Community Guidelines", group: "Help", keywords: ["rules", "what's allowed", "appeals", "banned"], desc: "What's allowed, and how appeals work", go: { path: "/legal/guidelines" } },
  { id: "privacy-policy", label: "Privacy Policy", group: "Help", keywords: ["privacy", "data", "policy"], desc: "What Mesh collects and why", go: { path: "/legal/privacy" } },
  { id: "terms", label: "Terms of Service", group: "Help", keywords: ["terms", "tos", "conditions", "agreement"], desc: "The agreement for using Mesh", go: { path: "/legal/terms" } },

  // Staff
  { id: "moderation", label: "Moderation", group: "Mesh staff", staff: true, keywords: ["reports", "appeals", "suspend", "journalists", "moderators"], desc: "Reports, appeals and suspensions", go: { path: "/account/moderation" } },
  { id: "ads", label: "Ads", group: "Mesh staff", staff: true, keywords: ["advertising", "campaigns", "sponsored"], desc: "Create and track ads", go: { path: "/account/ads" } },
  { id: "stats", label: "Stats", group: "Mesh staff", staff: true, keywords: ["analytics", "signups", "users", "retention", "dashboard"], desc: "Sign-ups, active people and more", go: { path: "/account/stats" } },

  // Leaving
  { id: "signout", label: "Sign out", group: "Sign out or leave", keywords: ["log out", "logout", "sign off", "switch account"], desc: "Of Mesh on this device", go: { dialog: "signout" } },
  { id: "delete", label: "Delete account", group: "Sign out or leave", keywords: ["delete", "remove account", "close account", "deactivate", "leave mesh", "erase"], desc: "Permanently delete your account", go: { dialog: "delete" } },
];

const normalise = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9@]+/g, " ").trim();
const words = (s) => normalise(s).split(" ").filter(Boolean);

/** Edit distance with swaps, stopping early once it's over `max`. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// How well one query word matches a list of words, 0 for not at all.
function wordScore(q, list) {
  let best = 0;
  for (const w of list) {
    if (w === q) return 1;
    if (w.startsWith(q)) best = Math.max(best, q.length >= 2 ? 0.8 : 0.5);
    else if (q.length >= 3 && w.includes(q)) best = Math.max(best, 0.45);
    else if (q.length >= 4) {
      const typo = editDistance(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))), q.length >= 7 ? 2 : 1);
      if (typo <= (q.length >= 7 ? 2 : 1)) best = Math.max(best, 0.55 - 0.1 * typo);
    }
  }
  return best;
}

const WEIGHTS = { label: 10, keywords: 7, group: 3, desc: 3 };

/** Settings matching `query`, best first. Every word has to match somewhere. */
export function searchSettings(query, { staff = false, index = SETTINGS_INDEX, limit = 8 } = {}) {
  const q = words(query);
  if (!q.length) return [];
  const phrase = normalise(query);
  const out = [];
  for (const item of index) {
    if (item.staff && !staff) continue;
    const fields = {
      label: words(item.label),
      keywords: item.keywords.flatMap(words),
      group: words(item.group),
      desc: words(item.desc),
    };
    let score = 0;
    let all = true;
    for (const w of q) {
      let best = 0;
      for (const [field, list] of Object.entries(fields)) best = Math.max(best, wordScore(w, list) * WEIGHTS[field]);
      if (!best) { all = false; break; }
      score += best;
    }
    if (!all) continue;
    // Whole-phrase bonuses: the name starts with it, or a synonym is exactly it.
    const label = normalise(item.label);
    if (label === phrase) score += 20;
    else if (label.startsWith(phrase)) score += 12;
    else if (label.includes(phrase) && q.length > 1) score += 6;
    if (item.keywords.some((k) => normalise(k) === phrase)) score += 10;
    // Settings you change beat documents you read, when they match as well.
    if (item.go.path?.startsWith("/legal")) score -= 3;
    out.push({ item, score });
  }
  return out.sort((a, b) => b.score - a.score || a.item.label.length - b.item.label.length).slice(0, limit).map((r) => r.item);
}

/** The parts of `text` that match the query, for highlighting: [{ text, match }]. */
export function highlightParts(text, query) {
  const q = words(query).filter((w) => w.length >= 2);
  if (!q.length) return [{ text, match: false }];
  const re = new RegExp(`(${q.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return String(text).split(re).filter(Boolean).map((part) => ({ text: part, match: q.some((w) => part.toLowerCase() === w) }));
}
