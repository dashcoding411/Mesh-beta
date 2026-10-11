// Help: plain-language guides to everything in Mesh, for people of any
// technical experience. Steps name the buttons people actually see, in
// **bold**. Keep them true to the app: when a screen changes, change its guide.

import { searchSettings } from "./settingsSearch";
import { SHOTS_PER_PERSON } from "./data/rolls";
import { BUSINESS } from "../legal/business";

export const HELP_TOPICS = [
  { id: "start", title: "Getting started" },
  { id: "posting", title: "Posting and sharing" },
  { id: "together", title: "Rolls, circles and gatherings" },
  { id: "messages", title: "Messages and calls" },
  { id: "time", title: "Your time" },
  { id: "news", title: "News" },
  { id: "safety", title: "Privacy and safety" },
  { id: "account", title: "Your account" },
  { id: "fixes", title: "Fixing problems" },
];

// `go` is the button at the end of a guide: a page (`path`) or something
// the Help page opens itself (`run`: tour, install, interests).
export const GUIDES = [
  // Getting started
  {
    id: "what-is-mesh", topic: "start", title: "What Mesh is",
    summary: "A social app for people 16 and over, made in Brisbane, that's built to be put down.",
    steps: [
      "Post photos, videos and words, and see what your friends are up to.",
      "Message friends, in pairs or groups, and call them.",
      "Join **Circles** (communities) and go to **Gatherings** (meetups in real life).",
      "Read news written by journalists whose identity Mesh has checked.",
      "Choose a daily limit. When you reach it, that part of Mesh locks until midnight.",
    ],
    tips: [
      "AI-generated photos and videos aren't allowed, and your data is never sold.",
      "Words you haven't seen before? See **Words Mesh uses** at the bottom of Help.",
    ],
    go: { label: "Take the tour", run: "tour" },
    keywords: ["about", "what is", "intro", "new", "beginner"],
  },
  {
    id: "make-account", topic: "start", title: "Making an account",
    summary: "Sign up with Google or an email address. It's free and takes about a minute.",
    steps: [
      "Tap **Sign up**.",
      "Choose **Google**, or type your email address and make a password.",
      "Enter your real birth year. Mesh is only for people 16 and over.",
      "Pick a username and, if you like, a daily limit for Home and Flicks.",
      "Choose a few interests, so For you shows things you care about.",
    ],
    tips: [
      "Passwords need at least 8 characters, with a capital letter, a number and a symbol.",
      "You can change your limit and interests any time.",
    ],
    keywords: ["sign up", "register", "join", "create account", "new account", "username"],
  },
  {
    id: "find-your-way", topic: "start", title: "Finding your way around",
    summary: "Where everything is, on a phone and on a computer.",
    steps: [
      "**Home** shows posts. **For you** has everyone's, and **Following** has only people you follow.",
      "On a phone, the bar at the bottom has **Home**, **Messages** and your account.",
      "On a phone, the menu button (three lines, top left) opens everything else: Flicks, News, Circles, Brick mode, Settings and Help.",
      "On a computer, all of these are in the sidebar on the left. Settings, Brick mode and Help are under **More**.",
      "The magnifying glass searches for people, posts, circles and news. The bell shows your notifications.",
    ],
    tips: ["On a computer, point at any button to see its name."],
    go: { label: "Take the tour", run: "tour" },
    keywords: ["menu", "navigation", "where is", "lost", "sidebar", "tabs", "find"],
  },
  {
    id: "install", topic: "start", title: "Putting Mesh on your home screen",
    summary: "Mesh opens full screen like an app. On iPhone, this is also how you get notifications.",
    steps: [
      "**iPhone:** open joinmesh.social in Safari, tap **Share**, then **Add to Home Screen**, then **Add**.",
      "**Android:** in Chrome, open Settings in Mesh and tap **Install Mesh on this device**. Or use Chrome's menu and tap **Install app**.",
      "From now on, open Mesh from its new icon.",
    ],
    tips: ["There's nothing to download from an app store, and it updates itself."],
    go: { label: "Install Mesh", run: "install" },
    keywords: ["app", "download", "install", "home screen", "icon", "iphone", "android", "pwa", "app store"],
  },
  {
    id: "notifications", topic: "start", title: "Turning on notifications",
    summary: "Hear about messages, calls, comments and more, even when Mesh is closed.",
    steps: [
      "On iPhone, put Mesh on your home screen first and open it from there.",
      "Open **Settings**, find **Notifications** and tap **Turn on**.",
      "When your phone or browser asks, tap **Allow**.",
      "Choose which kinds you want, like Messages or Gatherings.",
    ],
    tips: [
      "Likes and reposts never buzz you.",
      "While Brick mode is locking Mesh, only messages and calls come through.",
    ],
    go: { label: "Open Settings", path: "/account/settings" },
    keywords: ["notifications", "alerts", "push", "buzz", "sound", "ping", "remind"],
  },

  // Posting and sharing
  {
    id: "post", topic: "posting", title: "Making a post",
    summary: "Share photos, a video or just words, with everyone or only your followers.",
    steps: [
      "Tap **Create** (the + button). On a phone it's at the top right of Home; on a computer it's in the sidebar.",
      "Choose a **Still** (photos), a **Flick** (a video) or a **Strand** (just words).",
      "Add your photos, video or words. For photos: **Camera** (on a phone, your phone's own camera, for the best quality), **Library**, or **From a roll**.",
      "With several photos, hold one in the row underneath and drag it to change the order. The first is the **Cover**.",
      "Under **Who can see this**, choose **Everyone** or **Followers**.",
      "Tap **Post**.",
    ],
    tips: [
      "Up to 10 photos in one post, swiped through in order.",
      "Editing your own photos is fine. AI-generated photos and videos aren't allowed.",
      "If your wording might break a rule, Mesh tells you which one before it posts.",
    ],
    keywords: ["post", "make", "new post", "posting", "share", "upload", "photo", "picture", "video", "text", "caption", "create", "still", "flick", "strand", "order", "reorder", "cover", "carousel", "roll"],
  },
  {
    id: "stories", topic: "posting", title: "Sharing a story",
    summary: "A photo or video that disappears after 24 hours.",
    steps: [
      "On a phone, swipe left on Home to open the camera. Or tap the **+** on your own picture at the start of the stories row.",
      "Take a photo or video, or pick one. It opens in the story editor.",
      "Tap the photo to add a caption. Swipe left or right for filters.",
      "Down the right: **Text** (tap **Aa** for other styles), **Draw**, **Stickers** (emoji, the time, a date stamp and GIFs), **Fill** or **Fit**, and how long a photo shows.",
      "Drag things to move them. Pinch, or scroll on a computer, to resize and turn them. Drag one to the bin to remove it.",
      "Choose **Everyone** or **Followers**, then tap **Your story**.",
    ],
    tips: [
      "It shows at the top of your friends' Home for 24 hours, then disappears.",
      "Replying to someone's story sends them a private message. An **echo** is a public reply everyone who sees the story can read.",
      "Your old stories are kept in your story archive, which only you can see.",
      "Point the camera at a Mesh QR code (a roll's invite, a profile) and a button appears to open it.",
    ],
    keywords: ["story", "stories", "24 hours", "disappear", "echo", "echoes", "archive", "editor", "filter", "filters", "caption", "draw", "sticker", "text on photo", "swipe", "camera", "qr", "scan"],
  },
  {
    id: "edit-delete", topic: "posting", title: "Editing or deleting a post",
    summary: "Change a caption, or take a post down.",
    steps: [
      "Find your post and tap **More options** (the three dots).",
      "Choose **Edit** to change it, or **Delete** to remove it.",
    ],
    tips: [
      "A deleted post is gone for everyone, with its likes and comments.",
      "Posts in a circle can't be edited, but you can delete them.",
    ],
    keywords: ["edit", "delete", "remove", "change", "mistake", "typo", "undo"],
  },
  {
    id: "repost-save", topic: "posting", title: "Liking, saving and reposting",
    summary: "The buttons under every post.",
    steps: [
      "The heart likes a post. Tap twice on a photo to like it too.",
      "The speech bubble opens comments.",
      "The two arrows repost it, so your followers see it too.",
      "The paper plane (**Share**) sends it to someone in Messages, or copies its link.",
      "The bookmark saves it. Your saved posts are on your profile, and only you can see them.",
    ],
    keywords: ["like", "heart", "save", "bookmark", "repost", "share", "send", "comment"],
  },

  // Rolls, circles and gatherings
  {
    id: "rolls", topic: "together", title: "How Rolls work",
    summary: "A shared disposable camera for a night out. It develops at 9am the next morning.",
    steps: [
      "On a phone, tap the **Rolls** button at the top of Home. It looks like a camera shutter.",
      "Tap **Start a roll**, give it a name and choose when it develops. 9am the next morning is the default.",
      "Send the link to everyone who's coming, so they can join.",
      `Everyone gets ${SHOTS_PER_PERSON} shots and no previews, not even of their own photos.`,
      "When it develops, everyone gets every photo at once.",
    ],
    tips: [
      "Rolls only work on phones, because the camera is the point.",
      "Planning a gathering? You can add a roll to it.",
      "Whoever started the roll can develop it early.",
      "Once it's developed, tap **Pick photos to post**, tap the ones you want in order, then **Post**. Or, when making a post, tap **From a roll**.",
      "A roll link asking you to log in even though you're on Mesh? Links open in Safari or the app you tapped them in, not Mesh on your home screen. In Mesh, tap **Scan QR code** in Rolls and point it at the code on your friend's phone, or copy the link and tap **Paste link**.",
    ],
    go: { label: "Open Rolls", path: "/rolls" },
    keywords: ["roll", "rolls", "camera", "disposable", "film", "party", "photos", "develop", "9am", "digicam"],
  },
  {
    id: "circles", topic: "together", title: "Joining a circle",
    summary: "Circles are communities, each with its own rules and the gatherings they plan.",
    steps: [
      "Open **Circles** from the menu.",
      "Open one you like and tap **Join**. If it says **Ask to join**, its admins let you in.",
      "Read its rules. Each circle has its own, on top of Mesh's Community Guidelines.",
      "Post in the circle from its page.",
    ],
    tips: ["You can start your own circle and write its rules."],
    go: { label: "Open Circles", path: "/circles" },
    keywords: ["circle", "circles", "community", "group", "club", "join"],
  },
  {
    id: "gatherings", topic: "together", title: "Going to a gathering",
    summary: "Runs, dinners, gigs and meetups people are putting on.",
    steps: [
      "See what's coming up in **What's on**, or on a circle's page.",
      "Open a gathering and reply **Going**, **Interested**, **Maybe** or **Can't go**.",
      "You'll see which of your friends are going.",
      "To plan your own, open What's on and tap **Plan a gathering**.",
    ],
    tips: [
      "Add a gathering to your calendar from its page.",
      "Turn on Gatherings notifications to get a reminder 2 hours before.",
    ],
    go: { label: "See what's on", path: "/whats-on" },
    keywords: ["gathering", "gatherings", "event", "events", "meetup", "rsvp", "going", "what's on", "plan"],
  },

  // Messages and calls
  {
    id: "messages", topic: "messages", title: "Sending messages",
    summary: "Chat with one person or a group, with words, photos, GIFs and voice messages.",
    steps: [
      "Open **Messages** and tap **New message**, then choose someone.",
      "For a group chat, tap **New group**.",
      "Type and send. Tap the microphone to record a voice message.",
      "Messages from people you don't follow wait in **Requests** until you accept them.",
    ],
    tips: ["Choose who can message you in Settings, under **Privacy**."],
    go: { label: "Open Messages", path: "/messages" },
    keywords: ["message", "messages", "dm", "chat", "text", "group chat", "voice note", "requests"],
  },
  {
    id: "calls", topic: "messages", title: "Calling someone",
    summary: "Voice and video calls, from any chat.",
    steps: [
      "Open a chat with the person.",
      "Tap the phone button for a voice call, or the video camera for a video call.",
      "They get the call in Mesh, and as a notification if they've turned notifications on.",
    ],
    tips: ["Calls still work while Brick mode is locking the rest of Mesh."],
    keywords: ["call", "calls", "phone", "video call", "facetime", "ring"],
  },
  {
    id: "thoughts", topic: "messages", title: "Sharing a thought",
    summary: "A short note at the top of Messages that people you chat with can see for 24 hours.",
    steps: [
      "Open **Messages**.",
      "Tap **Your thought** at the top, type it and share it.",
    ],
    tips: ["Tap a friend's thought to reply to it or like it."],
    keywords: ["thought", "thoughts", "note", "status"],
  },

  // Your time
  {
    id: "brick", topic: "time", title: "Brick mode and your daily limits",
    summary: "How Mesh helps you put your phone down.",
    steps: [
      "Open the menu and tap **Brick mode**.",
      "**Daily limits** set how long Home, Flicks and News get each day. When you reach one, that part locks until midnight.",
      "Lowering a limit works straight away. Raising one takes 24 hours, so it can't be undone in a weak moment.",
      "**Brick me now** locks Mesh to messages and calls for a few hours or days, like exam week.",
      "**Scheduled times** lock it at the same times every week, say before 10am.",
    ],
    tips: [
      "Messages and calls always work, even when Mesh is locked.",
      "The Leaderboard shows who's kept Mesh bricked the longest.",
    ],
    go: { label: "Open Brick mode", path: "/account/brick" },
    keywords: ["brick", "limit", "limits", "screen time", "time", "lock", "locked", "focus", "exam", "addiction", "leaderboard"],
  },
  {
    id: "parental", topic: "time", title: "Parental controls",
    summary: "A parent or carer can add limits to a teenager's account, if the teenager agrees.",
    steps: [
      "The parent (19 or over, with their own Mesh account) opens **Settings**, then **Parental controls**, and invites the teen's account.",
      "Nothing happens until the teen accepts.",
      "The parent sets daily limits and locked times. Whichever is stricter, the parent's or the teen's own, always wins.",
    ],
    tips: [
      "Parents see the limits and today's minutes, never messages, private posts or who the teen talks to.",
      "Controls end on 1 January of the year the teen turns 18, or sooner if the parent removes them.",
    ],
    keywords: ["parent", "parents", "parental", "family", "teen", "child", "kid", "guardian", "carer"],
  },

  // News
  {
    id: "news", topic: "news", title: "Reading the news",
    summary: "Stories from journalists whose identity Mesh has checked, with a 60-second version of each.",
    steps: [
      "Open **News** from the menu.",
      "Every story starts with **the 60-second version**: three points the journalist writes, so you get the gist fast.",
      "**Today's brief** picks five recent stories. Tap **Quick read** to go through just their 60-second versions.",
      "Spot a mistake? Tap **Suggest a correction** on the story.",
    ],
    tips: [
      "Corrections stay on the story, with the date.",
      "No AI writes or summarises the news on Mesh.",
    ],
    go: { label: "Open News", path: "/news" },
    keywords: ["news", "article", "journalist", "60 second", "quick read", "brief", "correction"],
  },

  // Privacy and safety
  {
    id: "privacy", topic: "safety", title: "Choosing who sees and contacts you",
    summary: "Make your account private, and choose who can message you or comment.",
    steps: [
      "Open **Settings** and find **Privacy**.",
      "Turn on **Private account** so only followers you approve see your posts and stories.",
      "Use **Who can message you** and **Who can comment on your posts** to narrow those down.",
    ],
    tips: ["Accounts for 16 and 17 year olds start private."],
    go: { label: "Open Settings", path: "/account/settings" },
    keywords: ["privacy", "private", "public", "followers", "who can see", "stalker", "safe"],
  },
  {
    id: "block-mute-report", topic: "safety", title: "Blocking, muting and reporting",
    summary: "Stop seeing someone, stop them contacting you, or tell Mesh about something wrong.",
    steps: [
      "Open the person's profile and tap **More options** (the three dots).",
      "**Mute** hides their posts from you. They aren't told.",
      "**Block** stops them contacting you.",
      "**Report** tells Mesh about the account. To report a post, tap its three dots and choose **Report post**. For a comment, tap its flag.",
    ],
    tips: [
      "A person at Mesh reviews every report.",
      "Everyone you've blocked or muted is listed in Settings, under **Blocked and muted**.",
    ],
    keywords: ["block", "mute", "report", "harass", "bully", "bullying", "abuse", "spam", "creep", "unsafe"],
  },
  {
    id: "hidden-words", topic: "safety", title: "Hiding words and AI edits",
    summary: "Keep posts and comments with certain words out of your way.",
    steps: [
      "Open **Settings** and find **What you see**.",
      "Tap **Hidden words** and add any words or phrases you don't want to see.",
      "Turn on **Hide posts edited with AI** to hide those too.",
    ],
    tips: ["Only you can see your hidden words."],
    keywords: ["hidden words", "filter", "spoilers", "triggers", "hide", "ai"],
  },
  {
    id: "appeals", topic: "safety", title: "If something of yours is removed",
    summary: "You can always ask a person to look again.",
    steps: [
      "Mesh tells you what was removed or stopped, and which rule it broke.",
      "Tap **Appeal to a person** on that message and say why you think it's wrong.",
      "A person at Mesh reviews it. AI never decides an appeal.",
    ],
    go: { label: "Read the Community Guidelines", path: "/legal/guidelines" },
    keywords: ["appeal", "removed", "taken down", "banned", "suspended", "blocked post", "unfair"],
  },

  // Your account
  {
    id: "profile", topic: "account", title: "Changing your profile",
    summary: "Your photo, name, bio and more.",
    steps: [
      "Open your profile. On a phone, it's on the right of the bottom bar.",
      "Tap **Edit profile**, make your changes and save.",
    ],
    go: { label: "Open your profile", path: "/account" },
    keywords: ["profile", "photo", "picture", "avatar", "bio", "name", "edit profile"],
  },
  {
    id: "password", topic: "account", title: "Forgotten or changing your password",
    summary: "Get back in, or pick a new password.",
    steps: [
      "**Forgotten it?** On the Log in page, tap **Forgot password?** and Mesh emails you a link to make a new one.",
      "**Changing it?** Open **Settings**, find **Account** and tap **Password**.",
    ],
    tips: ["If you signed up with Google, you sign in with Google and there's no Mesh password."],
    keywords: ["password", "forgot", "reset", "log in", "login", "sign in", "locked out", "change password"],
  },
  {
    id: "data-delete", topic: "account", title: "Downloading your data or deleting your account",
    summary: "Take a copy of everything, or leave Mesh for good.",
    steps: [
      "Open **Settings**.",
      "Under **Your data**, tap **Download your data** for a copy of what Mesh has about you.",
      "Under **Sign out or leave**, tap **Delete account**. This permanently deletes your account and everything you've posted.",
    ],
    go: { label: "Open Settings", path: "/account/settings" },
    keywords: ["delete", "deactivate", "close account", "leave", "download", "data", "export", "copy"],
  },

  // Fixing problems
  {
    id: "fix-notifications", topic: "fixes", title: "I'm not getting notifications",
    summary: "Four things to check.",
    steps: [
      "In Settings, check **Notifications** says **On for this device**. If it doesn't, tap **Turn on**.",
      "On iPhone, open Mesh from its home screen icon, not from Safari.",
      "Check your phone's own settings allow notifications from Mesh.",
      "Check Brick mode: while it's locking Mesh, only messages and calls come through.",
    ],
    go: { label: "Open Settings", path: "/account/settings" },
    keywords: ["no notifications", "not working", "silent", "missing"],
  },
  {
    id: "fix-locked", topic: "fixes", title: "Part of Mesh is locked",
    summary: "You've reached a daily limit, or Brick mode is on.",
    steps: [
      "A daily limit unlocks at midnight.",
      "Messages and calls always work in the meantime.",
      "To change your limits, open **Brick mode**. Raising a limit takes 24 hours.",
    ],
    go: { label: "Open Brick mode", path: "/account/brick" },
    keywords: ["locked", "can't open", "limit reached", "blocked", "come back tomorrow"],
  },
  {
    id: "fix-upload", topic: "fixes", title: "A photo won't upload",
    summary: "Usually the connection, or a very large photo.",
    steps: [
      "Check you're connected to the internet, then try again.",
      "Very large or detailed photos can be too big. Try a smaller one.",
      "Still no luck? Close Mesh completely, open it again and retry.",
    ],
    keywords: ["upload", "photo", "error", "failed", "too big", "won't post"],
  },
  {
    id: "fix-rolls", topic: "fixes", title: "I can't find Rolls",
    summary: "Rolls are on phones only.",
    steps: [
      "Open Mesh on your phone.",
      "Tap the **Rolls** button at the top of Home. It looks like a camera shutter.",
    ],
    keywords: ["rolls missing", "no rolls", "computer", "laptop", "desktop"],
  },
  {
    id: "fix-update", topic: "fixes", title: "Something looks broken or out of date",
    summary: "Get the newest version of Mesh.",
    steps: [
      "When a new version is ready, Mesh shows a banner. Tap **Reload**.",
      "Or close Mesh completely and open it again.",
      `Still broken? Email ${BUSINESS.supportEmail} and say what you tapped and what happened.`,
    ],
    keywords: ["broken", "bug", "glitch", "slow", "update", "crash", "not loading", "blank"],
  },
  {
    id: "fix-signin", topic: "fixes", title: "I can't log in",
    summary: "Most often it's the way you signed up.",
    steps: [
      "Log in the same way you signed up: with **Google**, or with your email address.",
      "Forgotten your password? Tap **Forgot password?** on the Log in page.",
      `Still stuck? Email ${BUSINESS.supportEmail} from the address you signed up with.`,
    ],
    keywords: ["can't log in", "login", "sign in", "locked out", "wrong password"],
  },
];

/** Mesh's own words, in plain English, each with the guide that explains it. */
export const GLOSSARY = [
  { term: "Still", meaning: "A post of one or more photos.", guide: "post" },
  { term: "Flick", meaning: "A video. Short ones you swipe through, long ones you sit down with.", guide: "post" },
  { term: "Strand", meaning: "A post that's just words.", guide: "post" },
  { term: "Story", meaning: "A photo or video that disappears after 24 hours.", guide: "stories" },
  { term: "Echo", meaning: "A public reply to a story, which everyone who sees the story can read.", guide: "stories" },
  { term: "Thought", meaning: "A short note at the top of Messages, seen by people you chat with for 24 hours.", guide: "thoughts" },
  { term: "Roll", meaning: "A shared disposable camera. Nobody sees the photos until it develops.", guide: "rolls" },
  { term: "Circle", meaning: "A community with its own rules.", guide: "circles" },
  { term: "Gathering", meaning: "A meetup in real life: a run, a dinner, a gig.", guide: "gatherings" },
  { term: "Brick mode", meaning: "Your daily limits and locked times.", guide: "brick" },
  { term: "Requests", meaning: "Messages from people you don't follow, waiting for you to accept.", guide: "messages" },
  { term: "Repost", meaning: "Sharing someone's post with your followers.", guide: "repost-save" },
  { term: "Purple tick", meaning: "Mesh has checked who the account belongs to. Journalists have one too.", guide: "news" },
  { term: "New account", meaning: "Shown on comments written when the account was under a week old.", guide: "block-mute-report" },
  { term: "The 60-second version", meaning: "Three points at the top of a news story, written by its journalist.", guide: "news" },
];

export const guideById = (id) => GUIDES.find((g) => g.id === id) || null;
export const topicById = (id) => HELP_TOPICS.find((t) => t.id === id) || null;

// The guides in the shape settings search ranks (lib/settingsSearch.js), with
// the glossary's terms as extra keywords for the guide that explains them.
const INDEX = GUIDES.map((g) => ({
  id: g.id,
  label: g.title,
  group: topicById(g.topic)?.title || "",
  keywords: [...g.keywords, ...GLOSSARY.filter((w) => w.guide === g.id).map((w) => w.term)],
  desc: g.summary,
  go: { path: `/help/${g.id}` },
}));

// Words people put around a question ("how do I delete my account") that
// no guide needs to match.
const FILLER = new Set([
  "how", "do", "does", "did", "i", "im", "i'm", "to", "a", "an", "the", "my", "me", "can", "cant", "can't", "is", "it", "its",
  "on", "in", "of", "for", "what", "whats", "what's", "where", "why", "when", "with", "you", "your", "get", "want", "need",
  "please", "help", "someone", "somebody", "there", "this", "that", "be", "am", "are", "was", "and", "or", "if", "so",
]);

/** Guides matching `query`, best first. */
export function searchGuides(query, limit = 8) {
  const all = String(query).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const words = all.filter((w) => !FILLER.has(w));
  const q = words.length ? words : all;
  let found = searchSettings(q.join(" "), { index: INDEX, limit });
  // Nothing matches every word: take guides that match all but one, best rank first.
  if (!found.length && q.length > 1) {
    const rank = new Map();
    q.forEach((_, i) => {
      searchSettings(q.filter((__, j) => j !== i).join(" "), { index: INDEX, limit }).forEach((item, at) => {
        rank.set(item.id, Math.min(rank.get(item.id) ?? Infinity, at));
      });
    });
    found = [...rank.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([id]) => ({ id }));
  }
  return found.map((item) => guideById(item.id)).filter(Boolean);
}
