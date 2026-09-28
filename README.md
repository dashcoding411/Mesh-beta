# Mesh

**Making Every Story Heard.**

One app for the whole social stack: short and long video, photos, text posts,
communities, gatherings, sourced news and messaging, woven into a single
fabric. Built for people, not advertisers.

Built with React 19 + Vite + Tailwind on Firebase (Auth, Firestore, Storage).
Firebase project: `mesh-a293c`, Firestore in `australia-southeast1` (Sydney).

## Run it

```bash
npm install
npm run dev
```

### Optional settings (`.env.local`)

| Variable | What it turns on |
|---|---|
| `VITE_GIPHY_API_KEY` | GIFs in posts, comments and messages. Get a free key at developers.giphy.com. Without it the GIF buttons are hidden. |
| `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | A TURN relay for calls. Without one, calls between some mobile and office networks fail to connect. |
| `VITE_APPLE_SIGNIN=on` | Shows "Continue with Apple". Only set it once Apple sign-in is configured in Firebase. |
| `VITE_STORAGE=on` | Uses Cloud Storage for uploads (and turns on video). Set it after enabling the Blaze plan and deploying `storage.rules`. Until then photos and voice messages are stored in Firestore. |

## Surfaces

Names are deliberately our own. "Shorts" belongs to YouTube, "Groups" to
Facebook, and "Posts" says nothing at all.

**Navigation has three levels.** On phones there are exactly three tabs, always:
**Home**, **Messages** and **Account**. Home's sidebar (a drawer on phones, a
rail on desktop) has five sections: **Search**, **For you**, **Flicks**,
**Circles** and **News**. The feed has its own tabs across the top: **For you**
and **Following**. Every screen has a real URL, so Back, refresh and
shared links all work.

| Section | What it is |
| --- | --- |
| **For you** | Flicks, Stills and Strands ranked together, stories rail and a quick Strand box on top |
| **Following** | Only people you follow (and what they repost), newest first, no ranking |
| **Flicks** | All video. Short Flicks play in full; long ones play a 30-second trailer and open the full-length player |
| **News** | Stories reviewed against their sources before publication (see below) |
| **Circles** | Communities, with **Gatherings** (events) as a second tab |
| **Search** | Explore mix before you type; relevance-ranked, sectioned results after |
| **Saved** | Your bookmarks, private to you |

Formats: a **Still** is a photo, a **Strand** is up to 500 characters of text, a
**Flick** is video. **Thoughts** are 60-character notes shown over the Messages
inbox for 24 hours. Posts can be liked, commented on, **reposted** to your
followers, saved, and shared by link or into a conversation.

### Handles vs names

Your **handle** (`@nishil`) is unique across Mesh and rate-limited: once changed,
you must wait 30 days before changing it again. Your **display name** is
free-form, can repeat (two people can both be "Alex Nguyen") and can be edited
any time. The cooldown is enforced in `firestore.rules` against `request.time`,
not just in the UI.

### Account vs Profile

Deliberately separate layers:

- **Profile** (`Profile.jsx`) is public: how you appear to everyone else. The
  Account tab opens on it.
- **Settings** (`Settings.jsx`, behind the gear) is private: sign-in methods,
  password, birth year, data export, agreements and deletion. Only you see it.

Changing your avatar never touches your credentials, and vice versa.

## The ranking engine

Each of the big four optimises for one thing, and each is right about something
different. `src/lib/algorithm.js` blends all four rather than picking one:

| Borrowed from | What it contributes |
| --- | --- |
| **TikTok** | Interest graph. Affinity built from watch signals can outweigh follows, so a brand-new account still surfaces. |
| **Instagram** | The sends economy. A save is worth double a like, a send to a friend nearly triple: they cost the user something. |
| **Facebook** | Meaningful social interaction. Comment threads beat taps, and count for more between people who are connected. |
| **YouTube** | Retention over impressions. Long-form is scored on completion rate, with new uploads spared until there's data. |

Signal weights live in `SIGNAL` in `src/lib/db.js`: hide −8, skip −1,
view +0.25, complete +1, replay +1.5, like +1, comment +2, save +3, send +4,
follow +5. They accumulate per author in `users/{uid}/affinity/{authorId}`,
readable only by that user.

Two rulings that cut against the obvious approach:

- **No percentile normalisation.** Mapping each format's engagement onto its own
  CDF and comparing percentiles erases magnitude: finishing a 15-second clip
  and finishing a 40-minute talk both read as "100% completion", which deletes
  exactly what makes long-form valuable. Everything is scored in one shared
  unit instead: expected value per minute of viewer attention.
- **Per-format floors are the anti-cannibalisation mechanism.** Short-form wins
  on throughput under almost any scoring, so floors reserve a minimum share of
  the first 20 slots per format (`FORMAT_FLOORS`: 25% stills, 20% flicks, 15%
  features). They are paid down *on pace* across the window rather than batched
  at the end, which would clump three videos in a row.

Also: retention is measured as attention actually delivered (completion ×
duration) so a well-watched long video isn't crushed by the division; engagement
is discounted by the position a post was previously served at, since prominence
inflates counts on its own; freshness decays with a ~20h half-life; per-session
jitter gives unproven accounts a test run; and a diversity pass caps any author
at twice per six slots.

## Formats and trailers

Stills need a photo and Flicks need a video; Strands are words only. This is
enforced in `firestore.rules` (a Strand must have no media and 1 to 500
characters; everything else must point at our own Storage bucket), not just in
the composer.

A video over three minutes becomes a **long Flick**: it needs a title, and the
creator picks which 30 seconds play as its trailer in the Flicks feed. The
trailer is a window into the same file (`trailerStart`), so there's no second
upload. Creators can tick **Made with AI**, which labels the post everywhere.

Because Storage needs the Blaze plan (below), the composer probes for it on open
and explains exactly why photo and video posting is blocked. Strands still work.

## Messages

Modelled closely on Instagram DMs, because that interaction model is the one
people already know.

**Chat engine**: 1:1 and group threads, reply threading with quoted context,
emoji reactions (double-tap to heart, long-press for the picker), a 15-minute
edit window with an "edited" marker, unsend that leaves a tombstone rather than
silently reshuffling the thread, live typing indicators, presence ("Active now",
"Active 12m ago"), read receipts, and mark-as-unread.

**Inbox**: General and Requests. A thread lands in Requests when it was
started by someone you don't follow. Up to three chats can be pinned to the top.

**Personalisation**: five chat themes, and per-thread nicknames that only
display inside that conversation.

**Voice messages**: tap the mic when the box is empty, talk, tap send. Up to a
minute, recorded at speech quality (about 180 KB a minute), with a live
waveform while recording and a scrubbable one on playback, at 1×, 1.5× or 2×.
Recordings are stored inside the conversation (`chats/{id}/media`), so only its
members can play them, and unsending deletes the recording too.

**GIFs** from GIPHY, in messages, comments and Strands.

**Calls**: voice and video, one-to-one, from the phone and camera buttons in a
chat. You can only ring someone who follows you, so strangers can't make
someone's phone ring. WebRTC carries the audio and video directly between the two devices;
Firestore only passes the setup messages, which are deleted when the call ends.
Each call leaves a line in the chat ("Video call · 3:12", "Missed voice call").
Group calls would need a media server (an SFU), so they're not included. Without
a TURN relay (see Optional settings) some network pairs can't connect.

**Extras**: group polls with live percentages, and 60-character **Thoughts**
that sit above the inbox for 24 hours. Sharing a post from the feed's Send
button produces a real preview card (thumbnail, format label and author) that
opens the full post, rather than a line of text saying something was shared.

Every per-user field is enforced server-side: you can only write your own
reaction, your own read marker, your own typing indicator, your own pin and
mute. Verified by probing the live rules: reacting as another user, faking
someone's typing indicator, writing their read receipt, pinning on their behalf,
setting their note, removing yourself from a chat while editing it, and
enumerating all chats are each rejected.

## Circles

Communities with their own admins, rules and limits, and the gatherings they
plan. Post straight into a circle from the box at the top of its Discussion
tab; Strands work without Storage, photos and Flicks open the full composer.

**Limits** (Manage → Limits, circle admin only). Every one is enforced in
`firestore.rules`, not just the app, and was attack-tested against the live
rules:

| Limit | What it does |
| --- | --- |
| Who can join | Anyone, or admins approve. Private and hidden circles always approve. Screening questions always mean approval. |
| Age limit | Everyone, 16+ or 18+. Under-age accounts can't join or even ask. |
| Who can post | All members, or admins and moderators only (this also covers planning gatherings). |
| Approve posts first | Members' posts wait as `pending`, visible only to the author and admins, until approved. |
| Block links | Posts with `http(s)://` or `www.` are refused. Admins exempt. |
| Hold back new accounts | Accounts under 7 days old can read but not post. Admins exempt. |
| Blocked words | Up to 40 words, refused for everyone, admins included. |

Also enforced: muted members can't post until the mute ends; paused threads
take no new comments; private and hidden circles post with visibility
`circle`, readable only by members, and their comments are just as private;
members-only posts can't be reposted or sent into chats.

## Gatherings

Each gathering has its own page (`/gatherings/:id`) with replies, a
**discussion** and a guest list.

- **Public or private.** Private gatherings are visible only to the host,
  people they invite (Invite people, on the gathering page), and members of the
  circle they belong to. Invited people find them under Gatherings → You're
  invited.
- **Capacity.** Once it's full, Going closes. A reply of Going is only accepted
  in the same atomic write that raises the head count, which is what keeps the
  count honest and the limit real.
- **Who posts.** Everyone who has replied, or the host only (announcements).
- **Guest list.** Visible to guests, or to the host only; enforced on reads.

## Privacy controls

In Settings → Privacy and safety, all enforced in `firestore.rules`:

- **Private account.** New followers send a request you approve; locking
  switches your public posts to followers-only and the rules then refuse
  public posts and public stories from the account.
- **Who can message you.** Everyone (strangers land in Requests) or only
  people you follow. This also covers being added to group chats.
- **Who can comment.** Everyone, people you follow, or no one.
- **Blocked accounts.** A block ends follows both ways and stops the person
  following, requesting, messaging, adding you to groups or commenting.
  Their posts disappear from your feeds, search and stories.

## Group chats

Messages has two boxes: **General** and **Requests** (people you don't follow).
A group starts with its creator as admin; people are added one at a time so
the rules can check each add against that person's message setting and
blocks. Anyone in a group can add people and rename it; only admins remove
people or appoint admins; anyone can leave (a sole admin leaving hands the
role on).

## What Mesh deliberately doesn't do

The engagement playbook these mechanics come from also includes a set of
patterns designed to override judgement rather than serve it. Those are left
out on purpose:

- **No engineered variable-reward delay.** Refresh is as fast as the network
  allows. Artificial latency before revealing new content is a slot-machine
  mechanic.
- **No infinite scroll.** The feed pages in batches and ends with "You're all
  caught up". Infinite scroll works by removing the moment where you'd ask
  whether to keep going; Mesh hands that moment back.
- **No manufactured urgency.** Stories expire at 24 hours because that's what a
  story is, not to make you check back.
- **No contacts, location or IP harvesting** for friend suggestions (see above).

## Suggested people

`src/lib/suggest.js` builds two graphs, the way the big platforms do:

- **Social graph**: mutual-follow overlap (friends-of-friends), damped so one
  hyper-connected account can't dominate.
- **Interest graph**: collaborative filtering. People who follow accounts you
  engage with form a taste cluster; what else that cluster follows is a candidate.
- **Cold start**: a brand-new account has neither graph, so it falls back to the
  most-followed and newest accounts.

Deliberately **not** used: contacts, phone numbers, email hashes, IP addresses
or location. Those are what make suggestion engines feel invasive, and the
mutual-follow signal is honest enough without them.

## Moderation

One rule for everyone: the same checks apply whichever group is targeted
(majority or minority) and whichever political side is speaking. Criticising
ideas, religions as belief systems, countries, governments and policies is
allowed; attacking people for who they are is not. The public version of this
is in the Community Guidelines (`src/legal/content.js`).

**Context, not keywords.** Every match is read in its sentence before it's
judged: negated ("not all X are..."), called out ("saying X are dirty is
racist"), reported ("he called me a ..."), in-group ("we Indians are always
late lol"), or endorsed (a laugh, "facts", "not racist but..."). Endorsement
cancels the others, so "lol my mate said X are dirty 😂" is still blocked.

**What's checked:** everything other people read in public. Private messages,
group chat names and nicknames aren't filtered; people block and report.

**Four outcomes** (`src/lib/moderation.js`, `assessText`):

| Outcome | What it catches | What happens |
|---|---|---|
| block | Slurs against any group; dehumanising generalisations ("X are vermin / dirty / a disease"); calls for violence or exclusion ("kill all X", "deport every X"); "I hate X" about people; "go back to your country"; stereotype abuse phrases; telling someone to kill themselves | Not posted. The message says why, without teaching how to get round it. |
| borderline | Blanket insults about a group ("X are stupid"); a group, a stereotype and a laugh together (the "50 reels mocking Indians" pattern); coded terms | Posts after a second press. Not recommended to people who don't follow the author, never two within 8 slots, folded away behind a tap in comments and hidden from the comment preview. |
| quoted | Slurs or abuse quoted to report or call it out | Posts after a second press, behind a tap-to-read warning. Not demoted: that would bury the people it happened to. |
| ok | Everything else, including criticism, negation and calling hate out | Normal. |

Groups are one list (race, ethnicity, nationality, migration status, religion,
sexuality, gender, disability), so "white people are vermin" and "Indians are
vermin" are blocked by the same pattern. Political identities (leftists,
conservatives, zionists, feminists and so on) are protected only from violence
and dehumanising language: you can argue with any side, not call it vermin.
Text is normalised first: look-alike Unicode letters, accents, zero-width
characters, leetspeak, stretched letters, censoring asterisks, and dots or
spaces between letters. Words with innocent meanings are checked in context
("spic and span", "fag end", "tranny fluid", "coon cheese", "chink in the
armour", "ABO blood group"). It's English only.

The check runs on everything people write that others read: posts (text,
titles, image descriptions, poll options), comments, messages, names, bios,
circles, gatherings, news and chat names. GIF searches for slurs return
nothing, and GIFs whose titles fail the check are dropped.

**On the server** (`hateFree()` in `firestore.rules`): the slurs with no
innocent meaning are refused by the database itself on every public field.
Posts and comments can carry one only when labelled `sensitive: true` (the app
sets it for quoted and borderline text), and every viewer's app covers or
limits labelled text, so a slur can't reach anyone unwarned by going around
the app. Viewers' apps also re-check every post: anything that would be
blocked is left out of feeds and covered elsewhere. The rules language
can't read context, so this is the narrow core; the contextual checks run in
every viewer's app, including in the ranker, where they decide what that
viewer is shown. To change the server list, edit `scripts/rules-slur-regex.mjs`,
run it, paste the output into `hateFree()`, and deploy the rules.

**Reports**: posts, comments, messages and accounts, with nine reasons and
optional details. One report per person per thing (the document id enforces
it). A reported comment or message carries its exact text, which the rules
check against the original, so a report can't put words in someone's mouth,
and moderators see only that message, never the conversation. When three
accounts over a day old report a post, it leaves feeds and search until a
moderator reviews it; fresh accounts can report but don't count, so a brigade
of new accounts can't bury a post. A moderator who keeps a post up clears it
for good.

**Moderators** are the accounts listed in `admins/{uid}` (add one in the
Firebase console). They get Settings > Moderation: reports grouped by the thing
reported, the busiest first, with the automatic filter's opinion alongside.
Actions: remove it, keep it up, or suspend the author for 1, 7 or 30 days or
permanently. A suspension is enforced by the rules (`notSuspended()`): the
account can read but can't post, comment, message or create anything. The
person sees why, until when, and how to appeal. Every decision records who
made it and when.

**People's own controls**: block, hidden words (Settings > Hidden words; hides
posts and comments with those words or phrases from feeds, Flicks, search and
comments, private to them), who can comment, who can message, and "Not
interested".

**Spam**: link flooding, character mashing, all-caps walls, a 15-second
posting cooldown, and duplicate-post detection.

**Limits, honestly**: a word-and-pattern filter will miss new slang and
occasionally stop something harmless, and it can't read images, video or
voice. Reports and people fill that gap. A machine-learning classifier (such
as a hosted toxicity model) would catch more, but needs Cloud Functions, which
need the Blaze plan.

## Posts, interests and topics

Every post card shows who liked it ("Liked by @sam and 11 others"), the first
comment, a one-line reply box, and labelled Like, Comment, Repost, Share, Copy
link and Save actions. On your own posts you also see how many people saved or
sent it, which nobody else sees.

**Polls** on Strands: 2 to 4 options, open for an hour up to a week. Votes are
anonymous and final. The vote and the count are written together in one batch,
and the rules check both, so nobody can vote twice or inflate a count.

**Interests**: people pick up to 12 from a fixed list, first on sign-up and
later in Settings. They're stored in `users/{uid}/private/prefs`, readable only
by the owner. Sensitive categories (health, religion, politics, sexuality) are
deliberately not on the list. Posts carry up to 3 **topics** (suggested from the
text; the author decides), and circles up to 3 interests. For you and Flicks get
a chip row to filter by your interests, the ranker boosts matching topics, and
Circles has a "For your interests" section, interest filters and a search box.

## News review

Anyone can submit, nobody can self-publish:

1. Submitting requires a headline, the **full script**, and **at least two
   source URLs**, enforced in `firestore.rules`, not just the UI.
2. The story is created with `status: 'pending'` and is invisible to everyone
   except its author and admins.
3. Only an admin (a document in `admins/{uid}`, writable only from the console)
   can move it to `approved` or `rejected`, optionally with a note the author
   sees. Authors cannot approve their own.
4. Submitting requires ticking a declaration that the story is accurate and
   contains no AI-fabricated evidence; it's recorded server-side as `attestedAt`.

5. Sources are cited by number in the script (`[1]`, `[2]`). Citations become
   links to the numbered source list, and the form refuses a citation with no
   matching source. The rules also require every source to be an http(s) link.
6. Reviewers must tick a three-point checklist before Approve is enabled.
7. Readers can **suggest a correction** (only reviewers see these). Reviewers add
   **public corrections**, shown dated at the top of the story; the rules only
   allow appending, so a correction can never be quietly removed.

Stories have a topic, optional location, up to three key points and a cover
photo, and each has its own page at `/news/<id>`.

The app says "reviewed against sources", never "fact-checked": review is one
person checking a story against the sources given, not a guarantee of truth.

To make yourself an admin, add a document at `admins/<your-uid>` in the Firebase
console. Your uid is in Settings.

## Security

Server-side rules are the real gate; the client mirrors them for fast feedback.

- **Ownership**: you can only create content as yourself, and only edit or
  delete your own.
- **Counters**: likes, comments, members and follows may move by exactly ±1 per
  write. Writing `likeCount: 1000000` is rejected.
- **Queries**: Firestore evaluates list rules statically, so feed queries must
  constrain `visibility == 'public'` or `authorId == your uid`. Followers-only
  posts cannot be enumerated by anyone else; reaching one needs a direct read
  that runs the follower check.
- **Age gate**: under-16 accounts can post to groups and to followers, never to
  the public feed. Enforced in rules via `birthYear`.
- **Media**: post `mediaUrl`s must point at Firebase Storage; uploads are
  restricted to your own `uploads/{uid}/` folder, image/video only, 200 MB cap
  (8 MB for avatars).
- **Chats**: readable and writable only by members. A `get` on a chat that
  doesn't exist yet is allowed (so opening a new DM works) but reveals nothing.
- **Saves and hides**: private to the user, under `users/{uid}/`.
- **Reports**: anyone can file one; only admins can read them, so reporters
  can't see each other's reports.
- **Circles**: three privacy levels. Public is listed and readable; private is
  listed but members-only; hidden is never returned by a list query at all, only
  reachable by direct link. Only the owner assigns moderator, and nobody can
  promote themselves to owner.
- **Gatherings**: public ones are listable, private ones only via link or their
  circle. Only the host posts announcements.
- **Auth**: 8-character password minimum, "keep me signed in" chooses local vs
  session persistence, invisible reCAPTCHA on phone sign-in, and error copy that
  never reveals whether an account exists.

These were verified by probing the live rules with real attacks: impersonation,
counter inflation, self-approving news, posting to circles you're not in, reading
other people's chats, self-granting admin, enumerating hidden circles, promoting
yourself to circle owner, and bypassing the handle cooldown by writing to
Firestore directly. All are rejected server-side.

## Storage requires the Blaze plan

Firebase now requires the pay-as-you-go **Blaze** plan to create a Cloud Storage
bucket. Until it's enabled:

- Everything except video works. Photos (Stills, stories, profile pictures,
  news covers) are compressed in the browser to WebP or JPEG and stored in
  Firestore (`media/{id}`, under 900 KB, referenced as `mesh-media:<id>`).
  Voice messages are stored the same way inside their conversation.
- Video uploads show a clear message explaining they need Storage. When Storage
  is switched on, photos go there automatically too.

Enabling Blaze needs a payment method, so it's your call. Blaze still includes a
free tier (5 GB stored, 1 GB/day downloaded), so light use typically costs
nothing. Once enabled, deploy the storage rules:

```bash
npx firebase-tools deploy --only storage --project mesh-a293c
```

Then add `VITE_STORAGE=on` to `.env.local` (and to the environment you build
the hosted site from) so the app starts using the bucket.

Note the free-tier Storage locations are US-only (`us-east1`, `us-central1`,
`us-west1`); Australian buckets are Blaze-only.

## Deploying

```bash
npx firebase-tools deploy --only firestore:rules --project mesh-a293c
npm run build && npx firebase-tools deploy --only hosting --project mesh-a293c
```

Always pass `--project mesh-a293c`. The Firebase CLI's active project for this
folder can point somewhere else (it was `motopov-6f53d` in September 2026),
and a bare `firebase deploy` would overwrite that project instead.

## Data model

- `users/{uid}`: profile, with `following/`, `followers/` and private `affinity/`
- `usernames/{name}`: uniqueness registry
- `posts/{id}`: all content; `kind` is `post` (Still) | `text` (Strand) |
  `short` (Flick) | `video` (long Flick, with `duration` and `trailerStart`),
  with `likes/`, `saves/` and `comments/`, plus `saveCount` / `sendCount` /
  `repostCount` / `viewCount` / `completeCount` and an `aiGenerated` label.
- `reposts/{postId}_{uid}`: one per person per post; public posts by others only
- `users/{uid}/saved/` and `users/{uid}/hidden/`: private per-user lists
- `reports/{id}`: admin-only queue
- `stories/{id}`: 24-hour media, filtered client-side
- `news/{id}`: script + sources + review status
- `chats/{id}`: with `messages/`
- `groups/{id}` (Circles): `privacy`, `ownerId`, `rules`, `screeningQuestions`,
  `automod`, `pinnedPostId`, with `members/` (roles, penalties) and
  `joinRequests/` (screening answers)
- `events/{id}` (Gatherings): `privacy`, optional `groupId`, with `rsvps/` and
  `announcements/`
- `thoughts/{uid}`: 24-hour status above the inbox
- `presence/{uid}`: last-active timestamp
- `spouseRequests/{id}`; `admins/{uid}`
