# Mesh

**Making Every Story Heard.**

One app for the whole social stack — quick video, long-form video, photo posts,
communities, gatherings, fact-checked news and messaging, woven into a single
fabric.

Built with React 19 + Vite + Tailwind on Firebase (Auth, Firestore, Storage).
Firebase project: `mesh-a293c`, Firestore in `australia-southeast1` (Sydney).

## Run it

```bash
npm install
npm run dev
```

## Surfaces

Names are deliberately our own — "Shorts" belongs to YouTube, "Groups" to
Facebook, and "Posts" says nothing at all. Flicks and Features pair as a film
metaphor (quick vs. long); Circles and Sourced describe what they actually do.

| Surface | What it is |
| --- | --- |
| **Weave** | The For You feed — every format mixed and ranked, stories rail on top |
| **Flicks** | Quick vertical video, snap-scrolled, autoplay on visibility |
| **Features** | Long-form video with titles, judged on retention |
| **Stills** | Photos and thoughts |
| **Circles** | Communities, with **Gatherings** (events) nested inside them |
| **Sourced** | Fact-checked news — see below |
| **Chats** | Realtime 1:1 and group messaging — see below |
| **Discover** | Search everything, plus suggested people |
| **Profile** | Public identity |
| **Account** | Private settings |

Profile and Account live in the avatar menu at the foot of the rail rather than
as their own rows, which keeps the navigation to eight items in four groups.

### Handles vs names

Your **handle** (`@nishil`) is unique across Mesh and rate-limited: once changed,
you must wait 30 days before changing it again. Your **display name** is
free-form, can repeat — two people can both be "Alex Nguyen" — and can be edited
any time. The cooldown is enforced in `firestore.rules` against `request.time`,
not just in the UI.

### Account vs Profile

Deliberately separate layers:

- **Account** (`AccountPage.jsx`) is private: sign-in methods, password, account
  ID, data export, and deletion. Only you ever see it.
- **Profile** (`Profile.jsx`) is public: how you appear to everyone else.

Changing your avatar never touches your credentials, and vice versa.

## The ranking engine

Each of the big four optimises for one thing, and each is right about something
different. `src/lib/algorithm.js` blends all four rather than picking one:

| Borrowed from | What it contributes |
| --- | --- |
| **TikTok** | Interest graph. Affinity built from watch signals can outweigh follows, so a brand-new account still surfaces. |
| **Instagram** | The sends economy. A save is worth double a like, a send to a friend nearly triple — they cost the user something. |
| **Facebook** | Meaningful social interaction. Comment threads beat taps, and count for more between people who are connected. |
| **YouTube** | Retention over impressions. Long-form is scored on completion rate, with new uploads spared until there's data. |

Signal weights live in `SIGNAL` in `src/lib/db.js`: hide −8, skip −1,
view +0.25, complete +1, replay +1.5, like +1, comment +2, save +3, send +4,
follow +5. They accumulate per author in `users/{uid}/affinity/{authorId}`,
readable only by that user.

Two rulings that cut against the obvious approach:

- **No percentile normalisation.** Mapping each format's engagement onto its own
  CDF and comparing percentiles erases magnitude — finishing a 15-second clip
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

## Chats

Modelled closely on Instagram DMs, because that interaction model is the one
people already know.

**Chat engine** — 1:1 and group threads, reply threading with quoted context,
emoji reactions (double-tap to heart, long-press for the picker), a 15-minute
edit window with an "edited" marker, unsend that leaves a tombstone rather than
silently reshuffling the thread, live typing indicators, presence ("Active now",
"Active 12m ago"), read receipts, and mark-as-unread.

**Inbox** — Primary / General / Requests. A thread lands in Requests when it was
started by someone you don't follow; muting moves a thread to General. Up to
three chats can be pinned to the top.

**Personalisation** — five chat themes, and per-thread nicknames that only
display inside that conversation.

**Extras** — group polls with live percentages, posts shared into a thread from
the feed's Send button, and 60-character Notes that sit above the inbox for 24
hours.

Every per-user field is enforced server-side: you can only write your own
reaction, your own read marker, your own typing indicator, your own pin and
mute. Verified by probing the live rules — reacting as another user, faking
someone's typing indicator, writing their read receipt, pinning on their behalf,
setting their note, removing yourself from a chat while editing it, and
enumerating all chats are each rejected.

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
- **No contacts, location or IP harvesting** for friend suggestions — see above.

## Suggested people

`src/lib/suggest.js` builds two graphs, the way the big platforms do:

- **Social graph** — mutual-follow overlap (friends-of-friends), damped so one
  hyper-connected account can't dominate.
- **Interest graph** — collaborative filtering. People who follow accounts you
  engage with form a taste cluster; what else that cluster follows is a candidate.
- **Cold start** — a brand-new account has neither graph, so it falls back to the
  most-followed and newest accounts.

Deliberately **not** used: contacts, phone numbers, email hashes, IP addresses
or location. Those are what make suggestion engines feel invasive, and the
mutual-follow signal is honest enough without them.

## Moderation

`src/lib/moderation.js` runs on usernames, posts, comments, messages, group
names, news and profile fields.

- **Hate speech** — the slur list covers every group even-handedly: South Asian
  (including the anti-Indian slurs most filters skip), Black, East and Southeast
  Asian, Latino, Jewish, Muslim and Arab, Roma, Indigenous, white, LGBTQ+, and
  disabled people. Text is normalised first (lowercase, leetspeak folded,
  separators stripped) so `n1gg3r` and `p a j e e t` are caught too. Terms with
  innocent collocations are context-checked, so "cracker barrel" passes while
  the slur usage does not.
- **Spam** — link flooding, character mashing, all-caps walls, a 15-second
  posting cooldown, and duplicate-post detection.

This is the client-side layer. For production scale, mirror it in a Cloud
Function so writes from outside the app are covered too.

## News fact-checking

Anyone can submit, nobody can self-publish:

1. Submitting requires a headline, the **full script**, and **at least two
   source URLs** — enforced in `firestore.rules`, not just the UI.
2. The story is created with `status: 'pending'` and is invisible to everyone
   except its author and admins.
3. Only an admin (a document in `admins/{uid}`, writable only from the console)
   can move it to `approved` or `rejected`. Authors cannot approve their own.

To make yourself an admin, add a document at `admins/<your-uid>` in the Firebase
console. Your uid is on the Account page.

## Security

Server-side rules are the real gate; the client mirrors them for fast feedback.

- **Ownership** — you can only create content as yourself, and only edit or
  delete your own.
- **Counters** — likes, comments, members and follows may move by exactly ±1 per
  write. Writing `likeCount: 1000000` is rejected.
- **Queries** — Firestore evaluates list rules statically, so feed queries must
  constrain `visibility == 'public'` or `authorId == your uid`. Followers-only
  posts cannot be enumerated by anyone else; reaching one needs a direct read
  that runs the follower check.
- **Age gate** — under-16 accounts can post to groups and to followers, never to
  the public feed. Enforced in rules via `birthYear`.
- **Media** — post `mediaUrl`s must point at Firebase Storage; uploads are
  restricted to your own `uploads/{uid}/` folder, image/video only, 200 MB cap
  (8 MB for avatars).
- **Chats** — readable and writable only by members. A `get` on a chat that
  doesn't exist yet is allowed (so opening a new DM works) but reveals nothing.
- **Saves and hides** — private to the user, under `users/{uid}/`.
- **Reports** — anyone can file one; only admins can read them, so reporters
  can't see each other's reports.
- **Circles** — three privacy levels. Public is listed and readable; private is
  listed but members-only; hidden is never returned by a list query at all, only
  reachable by direct link. Only the owner assigns moderator, and nobody can
  promote themselves to owner.
- **Gatherings** — public ones are listable, private ones only via link or their
  circle. Only the host posts announcements.
- **Auth** — 8-character password minimum, "keep me signed in" chooses local vs
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

- Text posts, groups, events, news, messaging, follows and search all work.
- Photo/video uploads, stories and profile pictures show a clear message
  explaining that media uploads aren't enabled yet.

Enabling Blaze needs a payment method, so it's your call. Blaze still includes a
free tier (5 GB stored, 1 GB/day downloaded), so light use typically costs
nothing. Once enabled, deploy the storage rules:

```bash
npx firebase-tools deploy --only storage --project mesh-a293c
```

Note the free-tier Storage locations are US-only (`us-east1`, `us-central1`,
`us-west1`); Australian buckets are Blaze-only.

## Deploying

```bash
npx firebase-tools deploy --only firestore:rules --project mesh-a293c
npm run build && npx firebase-tools deploy --only hosting --project mesh-a293c
```

## Data model

- `users/{uid}` — profile, with `following/`, `followers/` and private `affinity/`
- `usernames/{name}` — uniqueness registry
- `posts/{id}` — all content; `kind` is `post` | `short` | `video`, with
  `likes/`, `saves/` and `comments/`, plus `saveCount` / `sendCount` /
  `viewCount` / `completeCount`. Kinds keep their internal names; the UI labels
  them Stills, Flicks and Features.
- `users/{uid}/saved/` and `users/{uid}/hidden/` — private per-user lists
- `reports/{id}` — admin-only queue
- `stories/{id}` — 24-hour media, filtered client-side
- `news/{id}` — script + sources + review status
- `chats/{id}` — with `messages/`
- `groups/{id}` (Circles) — `privacy`, `ownerId`, with `members/` carrying roles
- `events/{id}` (Gatherings) — `privacy`, optional `groupId`, with `rsvps/` and
  `announcements/`
- `spouseRequests/{id}`; `admins/{uid}`
