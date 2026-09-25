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

**Inbox**: Primary / General / Requests. A thread lands in Requests when it was
started by someone you don't follow; muting moves a thread to General. Up to
three chats can be pinned to the top.

**Personalisation**: five chat themes, and per-thread nicknames that only
display inside that conversation.

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

`src/lib/moderation.js` runs on usernames, posts, comments, messages, group
names, news and profile fields.

- **Hate speech**: the slur list covers every group even-handedly: South Asian
  (including the anti-Indian slurs most filters skip), Black, East and Southeast
  Asian, Latino, Jewish, Muslim and Arab, Roma, Indigenous, white, LGBTQ+, and
  disabled people. Text is normalised first (lowercase, leetspeak folded,
  separators stripped) so `n1gg3r` and `p a j e e t` are caught too. Terms with
  innocent collocations are context-checked, so "cracker barrel" passes while
  the slur usage does not.
- **Spam**: link flooding, character mashing, all-caps walls, a 15-second
  posting cooldown, and duplicate-post detection.

This is the client-side layer. For production scale, mirror it in a Cloud
Function so writes from outside the app are covered too.

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
