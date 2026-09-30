# Architecture

## Principles

- **Firestore rules enforce everything.** The client is untrusted. Each
  collection's rules validate shape, ownership and cross-document invariants.
- **Denormalised identity is verified.** Author names, display names and
  photos copied onto content must match the author's profile at write time
  (`authorIsMe`, `isMyName`, `isMyPhoto`).
- **Counters move with their records.** A count changes by exactly one, in
  the same batch that creates or deletes the record it counts, and the
  post-write value is checked (`tiedCount`). Fields such as `lastFollower` or
  `lastCommentId` name the record so the rules can verify it.
- **Rate limits** are timestamps in `rateLimits/{uid}` that must equal
  `request.time` in the same batch as the write they gate (10s per post, 3s per
  comment, 5s per photo batch, 3s per edit).
- **Server time only.** Creation times, presence, read markers and consent
  are `request.time`.
- **Evaluation budget.** Firestore limits expressions and document lookups per
  request. Large validations are wrapped in functions (`postCreateOk`,
  `circlePostOkAs`) and lookups are kept minimal.

## Data model

| Path | Notes |
| --- | --- |
| `users/{uid}` | Public profile. Subcollections: `following`, `followers`, `followRequests`, `notifications`, `rsvps`, and owner-only `affinity`, `saved`, `hidden`, `blocked`, `private/prefs` (interests, hidden words, mutes). |
| `usernames/{handle}` | Handle registry; claimed and released only together with the profile. |
| `posts/{id}` | `kind`: `post` (Still), `text` (Strand), `short` / `video` (Flicks). Carousels store `media[]` (2–10 slides; `media[0]` mirrors `mediaUrl`). Subcollections: `likes`, `saves`, `sends`, `votes`, `comments`. |
| `reposts/{postId}_{uid}` | One per user per post; public posts by others only. |
| `stories/{id}` | 24h media. `views/{uid}` and `likes/{uid}` are author-only; `echoes/` are public replies. |
| `chats/{id}` | 1:1 ids are the sorted uid pair. Subcollections: `messages`, `media` (voice notes, photos), `typing`, `reads`. |
| `calls/{id}` | WebRTC signalling with `callerCandidates` / `calleeCandidates`; deleted after the call. |
| `groups/{id}` | Circles. `members`, `joinRequests`, `guides/{id}/progress`. |
| `events/{id}` | Gatherings. `rsvps`, `discussion`, legacy `announcements`. |
| `news/{id}` | Stories as parallel block arrays plus `script`. `revisions`, `presence`, `updates` (live blog), `correctionRequests`. `newsWriters/{uid}` lists writers. |
| `locks/{uid}`, `usage/{uid}_{year}-{day}`, `familyLinks/{teenUid}`, `brickStats/{uid}` | Brick mode. |
| `reports/{type}_{id}_{uid}`, `suspensions/{uid}` | Moderation. |
| `media/{id}` | Inline images (Spark plan), referenced as `mesh-media:<id>`. |
| `rateLimits/{uid}`, `presence/{uid}`, `thoughts/{uid}`, `spouseRequests/{id}`, `admins/{uid}` | |

Composite indexes are declared in `firestore.indexes.json`.

## Client

- **Code splitting.** Screens, overlays, the story viewer, the photo cropper
  and the Storage SDK load on demand. Firebase is a single vendor chunk
  because its packages have circular imports.
- **Own profile.** `myProfile()` (`lib/data/users.js`) keeps the signed-in
  profile current with one snapshot listener instead of a read per write.
- **Profile cards.** `profileCache` overlays authors' current name and photo on
  denormalised content.
- **Feed state** is kept per feed for the session so returning restores the
  scroll position without refetching.
- **Updates.** `UpdateBanner` compares the deployed entry chunk with the
  running one and offers a reload; stale-chunk import errors reload once.

## Feed ranking (`lib/algorithm.js`)

Posts are scored as expected value per minute of viewer attention so formats
of very different lengths are comparable. Components: author affinity
(accumulated from interaction weights, `SIGNAL`), social proof (follows,
reposts by followed accounts, comments), endorsements (saves and sends above
likes), retention as delivered attention, a capped interest boost, freshness
(about a 20h half-life) and per-session jitter. Engagement is damped by the
slot a post was last served in to counter position bias.

After scoring, `FORMAT_FLOORS` guarantees each format a share of the first
slots, met progressively to avoid clustering. A diversity pass limits
repeated authors and formats. Borderline content is never recommended to
non-followers and is spaced apart; reports reduce reach.

The Following feed is chronological and unranked.

## Moderation (`lib/moderation.js`)

`assessText` returns `block`, `borderline`, `quoted` or `ok`. Text is
normalised (homoglyphs, accents, zero-width characters, leetspeak, stretching,
separators) and each match is evaluated in its sentence for negation,
condemnation, reporting, in-group use and endorsement. The same group list and
templates apply to every group; political identities are only protected from
violence and dehumanisation.

- `block`: not posted.
- `borderline`: posted after confirmation, never recommended to
  non-followers, collapsed in comments.
- `quoted`: posted after confirmation behind a warning.

The rules enforce the unambiguous slurs (`hateFree`); anything else needs the
`sensitive` flag. DMs aren't filtered.

Reports are one per user per target. Three reports from accounts older than a
day hold a post until a moderator reviews it. Moderators remove content, keep
it (clearing the hold), or suspend accounts (`notSuspended()` in the rules).

## Brick mode (`lib/brick.js`)

Weekly windows (half-hour slots per local day), daily per-section caps and
instant bricks. Tightening applies immediately; loosening waits 24 hours in
`pending` (`tighterOrSame` in the rules). Browsing reads check `lockedFor()`;
messaging, notifications and settings are never locked.

Caps are metered by the client (+30s per 30s visible, at most once per 25s).
A feed query can mix formats, so per-format caps can't be enforced on list
queries; the client closes those sections. Scheduled windows and instant
bricks are enforced on every read.

Parents (19+) can add a second layer to an under-18 account after the teen
accepts. Only the parent can loosen it, and it lapses the year the teen turns
18.

`brickStats/{uid}` records verified bricked time: a finished instant brick for
its exact duration, and whole past days against the schedule in force
(`slotsChangedAt`). Public stats back the leaderboard.

## Calls (`lib/calls.js`)

One-to-one WebRTC. Firestore carries the offer, answer and ICE candidates;
candidates that arrive before their description are queued. A negotiated data
channel carries mute, camera and hang-up. The caller performs ICE restarts on
disconnection (`offerRev`, which the rules require to increment), within a
25s budget. Only a follower sharing a 1:1 chat can ring someone.

A TURN relay is needed across carrier-grade NAT (most mobile data); see the
README configuration. Cameras are selected by label (`lib/cameras.js`) to
avoid iPhone virtual multi-lens devices that default to the ultra-wide lens.

## Messaging

1:1 and group chats with replies, reactions, a 15-minute edit window, unsend
(tombstones), typing, presence, read receipts, polls, GIFs, voice notes and
photos. Media is stored under the chat so only members can read it. A chat
started by someone the user doesn't follow lands in Requests. Group members
are added one write at a time so each add is vetted.

## Circles and gatherings

Circles have privacy (`public`, `private`, `hidden`), join approval and
screening questions, age limits, and Admin Assist conditions (links, new
accounts, contact details, minimum length, media, strikes, slow mode, banned
words) that decline or hold posts. `circlePostOkAs` enforces them; the client
mirrors them for messaging. Circles also have featured posts, topics, a
community chat, guides with member progress, and a banner and photo.

Gatherings are public or private, optionally in a circle, with capacity
enforced by coupling "going" RSVPs to the head count in one batch. Calendar
export (`.ics`) provides reminders. Public gatherings are viewable signed
out.

## News

Only `newsWriters` create stories. Drafts are private to their authors (a
lead plus up to three co-authors). Saves run in a transaction on `version`,
with a three-way block merge on conflict (`storyDoc.mergeStory`) and per-block
presence locks. Submission records a revision and an attestation; admins
approve, reject or send back, and approval is blocked under legal hold.
Published stories accept correction requests and append-only corrections;
live blogs post updates to a subcollection.

## Stories

24-hour media with DM replies (`storyReply`, verified against the story),
author-only likes and views, and public echoes held to the comment rules.

## Media storage

On the Spark plan images are compressed client-side (WebP or JPEG, under
900k base64 characters) and stored in `media/{id}`; carousels upload in a
single batch. Video requires Cloud Storage (Blaze). The Storage SDK is loaded
lazily.

## Limitations

- No push notifications (needs a server to send FCM messages).
- Search ranks a client-side candidate pool; it needs a hosted index at scale.
- Per-format brick caps are enforced client-side for list queries.
- Moderation is pattern-based; image, video and audio aren't analysed.
- App Check enforcement is not yet enabled.
