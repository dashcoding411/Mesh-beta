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
- **Public without an account.** Visitors (`guest()` in the rules) can read
  public posts and their likes and comments, profiles, public and private
  circles' pages, public circles' guides, public gatherings, published news
  and public brick stats. Everything else needs an account, as does listing
  profiles.
- **Evaluation budget.** Firestore limits expressions and document lookups per
  request. Large validations are wrapped in functions (`postCreateOk`,
  `circlePostOkAs`) and lookups are kept minimal.

## Data model

| Path | Notes |
| --- | --- |
| `users/{uid}` | Public profile. Subcollections: `following`, `followers`, `followRequests`, `notifications`, `rsvps`, and owner-only `affinity`, `saved`, `hidden`, `blocked`, `private/prefs` (interests, hidden words, mutes), `private/age` (birth year, set once), `private/desk` (newsroom folders). Profiles that still carry `birthYear` move it to `private/age` at sign-in and stay hidden from visitors until then. |
| `usernames/{handle}` | Handle registry; claimed and released only together with the profile. |
| `posts/{id}` | `kind`: `post` (Still), `text` (Strand), `short` / `video` (Flicks). Carousels store `media[]` (2–10 slides; `media[0]` mirrors `mediaUrl`). Subcollections: `likes`, `saves`, `sends`, `votes`, `comments` (each with `likes`). |
| `reposts/{postId}_{uid}` | One per user per post; public posts by others only. |
| `stories/{id}` | 24h media. `views/{uid}` and `likes/{uid}` are author-only; `echoes/` are public replies. |
| `chats/{id}` | 1:1 ids are the sorted uid pair. Subcollections: `messages`, `media` (voice notes, photos), `typing`, `reads`. |
| `calls/{id}` | WebRTC signalling with `callerCandidates` / `calleeCandidates`; deleted after the call. |
| `groups/{id}` | Circles. `members`, `joinRequests`, `guides/{id}/progress`. |
| `events/{id}` | Gatherings. `rsvps`, `discussion`, legacy `announcements`. |
| `news/{id}` | Stories as parallel block arrays plus `script`. `revisions`, `presence`, `updates` (live blog), `correctionRequests`. `newsWriters/{uid}` lists writers and holds their bylines. |
| `locks/{uid}`, `usage/{uid}_{year}-{day}`, `familyLinks/{teenUid}`, `brickStats/{uid}` | Brick mode. |
| `reports/{type}_{id}_{uid}`, `suspensions/{uid}` | Moderation. |
| `media/{id}` | Inline images (Spark plan), referenced as `mesh-media:<id>`. |
| `rateLimits/{uid}`, `presence/{uid}`, `thoughts/{uid}`, `spouseRequests/{id}`, `admins/{uid}`, `badges/pink` | |

Composite indexes are declared in `firestore.indexes.json`.

## Client

- **Code splitting.** Screens, overlays, the story viewer, the photo cropper
  and the Storage SDK load on demand. Firebase is a single vendor chunk
  because its packages have circular imports.
- **Profile addresses.** Profiles live at `/@handle`. Handles of profiles
  read this session are cached, so links go straight there; an older
  `/u/<uid>` link resolves and swaps its address for the handle.
- **Own profile.** `myProfile()` (`lib/data/users.js`) keeps the signed-in
  profile current with one snapshot listener instead of a read per write.
- **Visitors.** Signed out, the shell shows public sections and routes
  account-only pages to a join prompt. Actions call `needsAccount(reason)`
  from the shell context, which explains what needs an account. Signing in
  or out reloads the page so no state carries between the two.
- **Profile cards.** `profileCache` overlays authors' current name, photo and
  badges (admin-awarded, e.g. Beta tester) on denormalised content.
- **Verification.** Admins verify accounts (`verified` in `users/{uid}.badges`)
  from a profile's menu or the Verified tab in moderation. Verified accounts
  and journalists get a purple tick beside their name on profiles, posts,
  comments and search results. The founder alone can give girlfriend
  privilege, to one account at a time: a pink check in place of the purple
  tick, a pink profile (`.theme-pink` re-tints the surface tokens) and a pink
  banner behind the profile photo. `badges/pink` names the holder, and the
  rules require the holder's badges (and only theirs) to carry `pink`.
- **First-run tour.** `Tour.jsx` spotlights the main controls one at a time
  (elements marked `data-tour`; phones and computers mark different ones, and
  steps with nothing visible to point at are left out). It starts by itself
  for guests on their first visit and for accounts made since it arrived,
  once the Home feed is showing with nothing else open; `tourDone` in private
  prefs (and a local flag) stops it repeating. Settings → Take the tour
  replays it.
- **Notification banners.** Notifications that arrive during a visit drop in
  as a short banner (not on the Notifications page, not from muted or blocked
  people).
- **Feed state** is kept per feed for the session so returning restores the
  scroll position without refetching.
- **Updates.** `UpdateBanner` compares the deployed entry chunk with the
  running one and offers a reload; stale-chunk import errors reload once.

## Creating

Stills, Flicks and stories can be captured in the app (`Camera.jsx`): a
full-screen viewfinder with the shutter, library and camera flip at the bottom
where a thumb reaches. Tap for a photo; hold to record when video uploads are
on. The photo is cropped to what the viewfinder showed. On phones, adding to
your story opens the camera first, and the preview offers "Your story" (one
tap) or "Post" (into the composer with the capture attached). In the composer,
location and photo descriptions stay folded until asked for; the share button
sits bottom-right. Location searches real places as you type
(`LocationField.jsx`, Photon on OpenStreetMap data, no key or cookies) and
stores the picked name, or whatever was typed, up to 60 characters.

A photo from the camera opens in `PhotoEditor.jsx` before it's used: text
layers (colour, background pill, size, drag or arrow keys to move), zoom, pan,
quarter turns, brightness, contrast and saturation, and GIF stickers when GIFs
are on. The preview uses CSS; the edits are drawn into a new JPEG on "Use
photo". Music isn't supported: there's no licensed catalogue and no server to
mix audio.

## Privacy

What each kind of record shows, and to whom:

- **Profiles** are readable by any signed-in account (and by visitors), so they
  hold nothing private: no email, phone or birth year. Older profiles that had
  them are cleaned at sign-in (or by an admin): the birth year moves to
  `private/age`, email and phone are removed (Firebase Auth keeps them).
  The `lastFollower` / `lastFollowing` markers that tie follow counts to a
  follow are blanked as soon as the count has moved.
- **Follow lists** of a private account: the owner and approved followers.
- **Online status and Notes**: mutual follows and people with a 1:1 chat,
  never someone who has blocked you.
- **Private and hidden circles' member lists**: members only.
- **Reposts** are public, so private accounts can't repost; going private
  removes your reposts.
- **Journalist records** are public and no longer say which admin added them.
- **Drafts** are stored per account and cleared at sign-out; the Firestore
  cache is in memory only. Sign-in redirects only go to pages on Mesh.
- **Cookies and storage** (`lib/consent.js`, `StorageNotice.jsx`). Essential
  storage is always on. Optional third parties (Google reCAPTCHA for App
  Check; GIPHY when GIFs are on) stay off until the visitor picks "Allow all"
  or switches them on in "Choose"; "Essential only" has the same weight. The
  choice is kept under `mesh:consent` and can be changed in Settings or from
  the Cookies policy. App Check only starts once reCAPTCHA is allowed (never in
  the iPhone app). The first-run tour waits until the banner is answered.
- **Accepted exposure.** The Firebase web config and the TURN relay
  credentials are in the site's code by design (there's no server to hand out
  short-lived ones). App Check isn't enforced yet, so the rules are the only
  barrier for scripted access.

## Accessibility

The target is WCAG 2.2 AA, checked with axe-core on every main screen and
dialog, at phone and desktop widths, in light, dark, high contrast and the pink
profile theme.

- **Colour.** Text tokens meet 4.5:1 on every surface in both themes; links in
  text are underlined, not told apart by colour alone. Appearance > Contrast >
  High (or the device's "increase contrast" setting) strengthens secondary
  text, borders, field outlines and focus rings. Forced-colour modes keep focus
  and control edges.
- **Keyboard.** A skip link, a visible focus ring, and shortcuts that pause
  while typing or while a dialog is open. `ui/Dialog` and `lib/useFocusTrap`
  keep Tab inside whatever layer is in front (profiles, posts, players,
  stories, calls, the camera, the tour) and return focus when it closes;
  sticky headers leave room (`scroll-pt`) so focus is never hidden under them.
- **Size and reflow.** Targets are at least 24px (most are 44px). Text scales
  to 125% (Appearance > Text size) and nothing scrolls sideways at 320px.
- **Time and motion.** Toasts and notification banners pause on hover and
  focus, and every notification stays on the Notifications page. Reduced
  motion (setting or system) stops animations and autoplay; playing video
  always has a pause button.
- **Alternatives to gestures.** Swipes, holds and drags all have buttons:
  carousel and story arrows, Video mode in the camera, Move to in the
  newsroom, and keyboard controls in the cropper and players.
- **Content.** Photos take descriptions (alt text), video and audio have
  labelled controls, and screens name themselves with a heading and a title.

Not yet covered: captions for uploaded video and transcripts for voice notes.

## Feeds (`lib/algorithm.js`)

Home is newest first (`latestFirst`; a repost counts when it was reposted).
For you takes everyone's public posts plus followers-only posts from accounts
the viewer follows; Following keeps only the accounts they follow. Both are
screened the same way: held posts, hidden words and blocked text are removed,
borderline posts from accounts the viewer doesn't follow are left out, and
posts labelled as made with AI are dropped for viewers who hide them (the
`hideAi` preference, which also applies to Flicks and Explore). Authors label
their own posts; a moderator can add the label after an "unlabelled AI"
report.

Followers-only posts are fetched with a query per followed author (up to 100),
because the rules have to check each author's follower list.

Public posts from public circles (newest 40, `fetchCirclePosts`) join For
you, labelled with the circle's name.

To keep Home from reading like a text timeline: the feed choice is a menu
rather than two tabs, short Strands (140 characters on one line, no poll or
GIF) show on a background the author picks in the composer (`card`, one of
`lib/strandCards.js` or "none"; older posts get one from their id), and the scroll is broken up by "Circles to join" (public circles
sharing the viewer's interests, after the 4th post) and "People you may know"
(the Search suggestions, after the 9th). Both rows are worked out once per
visit.

Published stories by journalists the viewer follows are mixed into both Home
feeds by publication time (not in interest topics, and not while News is
bricked).

Flicks and Search's Explore grid are ranked. Posts are scored as expected value per minute of viewer attention so formats
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

## Flicks

Flicks home is a chooser rather than a feed: a row of short Flicks and a grid
of long ones, with today's Flicks time against the viewer's limit. Short Flicks
play one at a time in a vertical player that starts at the one picked; every
ten, a check-in card shows how many and for how long, and the feed ends rather
than scrolling forever. Long Flicks open the full player: native controls, an
ambient glow (a small blurred canvas copy of the current frame), chapters from
`0:00 Title` lines in the description (`lib/chapters.js`), a speed picker, and
Up next (same creator, then shared topics, then newest, leaving out hidden
posts, muted authors and, if the viewer hides them, AI posts). Autoplay is off
unless the viewer turns it on, per device.

Videos carry a poster frame captured when posting (`posterUrl`, Cloud Storage
only), since phones show no frame for an unplayed video. Older videos fall back
to a frame from the file.

## Moderation (`lib/moderation.js`)

Every hate-filter block names its rule (`RULE_NAMES`) and offers "Appeal to
a person" wherever the message shows (`ui/States` InlineMessage looks the
message up with `blockFor`). Appeals (`appeals/{id}`) are read by their author
and staff; staff uphold or overturn them in Moderation, and the author gets an
`appeal` notification from Mesh. Overturned text is let through for its author
(`allowOverturned`, loaded at sign-in); a slur still posts behind a warning,
since the rules only accept slurs on posts flagged `sensitive`.

AI-generated pictures and videos aren't allowed; AI edits of real ones are,
labelled "Edited with AI" (`aiGenerated`). `lib/aiMarkers.js` reads the
file's own markers before upload: the IPTC/C2PA digital source type
(`trainedAlgorithmicMedia` is refused, `compositeWithTrainedAlgorithmicMedia`
and `algorithmicallyEnhanced` are labelled automatically) and Stable
Diffusion settings left in PNGs. Stripped metadata gets past it, so reports
back it up.

Staff are admins (`admins/{uid}`, set in the console) and moderators
(`moderators/{uid}`, appointed by staff from the Moderation page). Every staff
power in the rules is `isStaff()`, so moderators can do everything admins can:
reports, suspensions, removals, checks, journalists, news review and
appointing moderators. Only the founder gives the pink check. A moderator
account opens on the moderation queue instead of Home and can't create posts.

`assessText` returns `block`, `borderline`, `quoted` or `ok`. Text is
normalised (homoglyphs, accents, zero-width characters, leetspeak, stretching,
separators) and each match is evaluated in its sentence for negation,
condemnation, reporting, in-group use and endorsement. Condemnation is read
from the words around a match, never the match itself, and only clears a post
when the claim is framed as someone else's (reported, quoted, or condemned
before it's stated); otherwise it softens a block to borderline. Threats
against a person are blocked unless they read as a joke (laughter, a playful
condition, a game), which makes them borderline. Words with innocent senses
("retarded growth", "spic and span") are judged by the words around them. The
same group list and templates apply to every group; political identities are
only protected from violence and dehumanisation.

- `block`: not posted.
- `borderline`: posted after confirmation, never recommended to
  non-followers, collapsed in comments.
- `quoted`: posted after confirmation behind a warning.

The rules enforce the unambiguous slurs (`hateFree`); anything else needs the
`sensitive` flag. The words in DMs aren't filtered.

**Images** (`lib/imageCheck.js`): nudity, pornography and sexually suggestive
images (photographed, drawn or AI) aren't allowed anywhere, messages included.
With no server to scan uploads, every photo and video is classified on the
uploader's device by NSFWJS (MobileNetV2, TensorFlow.js), loaded only when
someone picks an image and kept out of the preloaded chunks. Pickers check as
soon as a file is chosen; `uploadMedia`, `uploadPhotos` and `sendPhotoMessage`
check again and refuse (`UnsafeImageError`), failing closed if the check
can't run. Videos are checked at five frames. A modified app could skip this,
so admins' devices sweep recent public posts when they open Moderation
(`lib/imageSweep.js`): confident detections (explicit score 0.7+) are hidden
(`modStatus: "hidden"`) at once and everything flagged is listed for a
decision. GIF search is limited to PG.

Reports are one per user per target. Three reports from accounts older than a
day hold a post until a moderator reviews it. Moderators remove content, keep
it (clearing the hold), or suspend accounts (`notSuspended()` in the rules).

## Brick mode (`lib/brick.js`)

Sign-up asks how long someone wants Mesh each day (30, 45 or 60 minutes, or
no limit); a choice sets the Feed and Flicks caps. The first-run tour opens
Brick mode right after its welcome, then returns to Home.

Weekly windows (half-hour slots per local day), daily per-section caps and
instant bricks (for a length of time, or until a clock time, up to 8 days). Tightening applies immediately; loosening waits 24 hours in
`pending` (`tighterOrSame` in the rules). Browsing reads check `lockedFor()`;
messaging, notifications and settings are never locked.

Caps are metered by the client (+30s per 30s visible, at most once per 25s).
A feed query can mix formats, so per-format caps can't be enforced on list
queries; the client closes those sections. Scheduled windows and instant
bricks are enforced on every read.

Parents (19+) can add a second layer to an under-18 account after the teen
accepts. Only the parent can loosen it, and it lapses the year the teen turns
18. The teen records that year (`untilYear`) on the link when accepting, since
the parent can't read their birth year.

`brickStats/{uid}` records verified bricked time: a finished instant brick for
its exact duration, and whole past days against the schedule in force
(`slotsChangedAt`). Public stats back the leaderboard.

Brick groups (`brickGroups/{gid}`, up to 30 members) are private leaderboards
for friends, joined by link. Each member keeps an entry in
`brickGroups/{gid}/members/{uid}` that mirrors their `brickStats` and current
brick; `brickEntryOk` checks every number against those documents, so a group
shows real time even when someone's stats aren't public. Entries refresh after
stats sync and when a brick starts.

## Calls (`lib/calls.js`)

One-to-one WebRTC. Firestore carries the offer, answer and ICE candidates;
candidates that arrive before their description are queued. A negotiated data
channel carries mute, camera and hang-up. Every call negotiates a video
transceiver, so a voice call can turn a camera on with `replaceTrack` and no
renegotiation. The call screen minimises to a floating window so the rest of
the app stays usable. The caller performs ICE restarts on
disconnection (`offerRev`, which the rules require to increment), within a
25s budget. Only a follower sharing a 1:1 chat can ring someone.

A TURN relay is needed across carrier-grade NAT (most mobile data); see the
README configuration. Cameras are selected by label (`lib/cameras.js`) to
avoid iPhone virtual multi-lens devices that default to the ultra-wide lens.

## Messaging

1:1 and group chats with replies, reactions, a 15-minute edit window, unsend
(tombstones), typing, presence, receipts (Sending, Sent, Delivered once the
recipient's app has received it, then Seen, or who has seen it in a group), polls, GIFs, voice notes and
photos. Media is stored under the chat so only members can read it. A chat
started by someone the user doesn't follow lands in Requests, where it can be
accepted (`acceptedBy`), deleted (`declinedBy`, hidden from that member's
inbox; a group is left instead) or the sender blocked. Each member changes only
their own entry. A request isn't marked read until it's accepted, so the
sender doesn't see "Seen". Group members
are added one write at a time so each add is vetted.

Thoughts (`thoughts/{uid}`, 60 characters, 24 hours) sit above the inbox for
mutual follows and 1:1 chats; opening one shows its time left. Friends can like one
(`thoughts/{uid}/likes/{liker}`, tied to that thought by `thoughtAt` so a new
thought starts at zero; only the owner lists them) or reply, which sends a DM
quoting it (`thoughtReply`, checked against the thought).

Saved posts can be filed into albums (`users/{uid}/albums`, private, up to 500
posts each, a post can be in several) from the Saved tab on the profile or the
"Add to album" button after saving. Unsaving takes a post out of every album.
Saved isn't in the sidebar; `/saved` opens the profile's Saved tab.

## Circles and gatherings

Circles have privacy (`public`, `private`, `hidden`), join approval and
screening questions, age limits, and Admin Assist conditions (links, new
accounts, contact details, minimum length, media, strikes, slow mode, banned
words) that decline or hold posts. `circlePostOkAs` enforces them; the client
mirrors them for messaging. Circles also have featured posts, topics, a
community chat, guides with member progress, and a banner and photo.
Owners can also pick an accent colour, write a welcome note for new visitors,
rename what members are called (`memberTitle`) and hide the Guides, Gatherings
or Members tabs.

Gatherings are public or private, optionally in a circle, with capacity
enforced by coupling "going" RSVPs to the head count in one batch. Calendar
export (`.ics`) provides reminders.

## News

Only `newsWriters` create stories. Each writer's doc doubles as their
journalist profile: outlet (empty for independents), logo, region and any
political affiliation they declare, shown as the byline on every story and on
their profile, which opens on their published stories. Drafts are private to their authors (a
lead plus up to three co-authors). Saves run in a transaction on `version`,
with a three-way block merge on conflict (`storyDoc.mergeStory`) and per-block
presence locks. Journalists publish their own stories; there is no review
step. Publishing (`readyToPublish`) requires a headline, body, two sources and
the journalist's attestation, records a revision, and is blocked while the
story is marked for legal review. Readers send correction requests to the
story's journalists, who (or an admin) add append-only corrections; live
blogs post updates to a subcollection.

Every story carries a `label` (Report, Analysis, Explainer or Opinion; reports
go unlabelled to readers). A published story can be updated in place for
developing news: the editor's update mode doesn't autosave, and "Publish
update" writes the changes with an `updateNote` readers see as "Updated …",
still held to the publishing bar, and records a revision. Mistakes are fixed
with corrections instead. Before publishing or updating, `legalRisks` lists
sentences naming someone next to an unattributed allegation and the
journalist confirms they're attributed or checked. Pasting a draft splits it
into paragraph blocks (`#` lines become headings). Each signed-in reader adds
one read (`news/{id}/reads/{uid}` with `readCount`), shown only to the
story's journalists on the story and the desk.

The newsroom files stories like OneDrive (`news/Desk.jsx`, `lib/desk.js`):
folders and subfolders with breadcrumbs, list or grid, multi-select, drag and
drop, Move to, rename, and My stories / Recent / Shared with me views. Folders
live in `users/{uid}/private/desk`, so co-authors each file a shared story
their own way. Deleting a folder moves its contents up a level; the lead
journalist can delete a draft from the desk or the editor.

## Comments

Typing `@` in a comment or caption suggests people (`ui/MentionTextarea.jsx`):
people in the thread first, then a username prefix search. Arrow keys move,
Enter or Tab picks, Escape closes; the textarea points at the active option
with `aria-activedescendant`.

Threaded like Reddit: a reply stores `parentId`, which the rules require to
exist, and its parent's author is notified (`reply`, verified against both
comments). Threads nest four levels, then continue at that level naming who
they answer; a deleted comment leaves a placeholder over its replies. Comment
likes are `comments/{id}/likes/{uid}` tied to `likeCount` with `lastLiker`. A
comment can carry one photo (`image`: Cloud Storage or the author's own inline
media) or a GIF.

Sorting (`lib/commentTree.js`): Best (the default) is the lower bound of the
Wilson score interval, as on Reddit. With likes and no downvotes, a comment's
likes are weighed against the other people who commented after it, standing in
for who has seen it, so being early doesn't win by itself and one like isn't
proof. Top is raw likes; New is newest first. Like counts stay hidden for a
comment's first hour so early likes don't sway later readers.

## Stories

24-hour media with DM replies (`storyReply`, verified against the story),
author-only likes and views, and public echoes held to the comment rules.

Stories aren't deleted when they expire. The author's archive
(`StoryArchive.jsx`, `/account/archive`) lists them all; others stop seeing
them in the rail after 24 hours. Highlights (`users/{uid}/highlights`) are
named sets of up to 100 past stories with a cover, shown as circles on the
profile. They're readable by whoever can see the account's follows and not by
people it has blocked, and each story still checks its own audience when
played. Viewers can't reply to past stories, so the reply bar is hidden.

## Media storage

On the Spark plan images are compressed client-side (WebP or JPEG, under
900k base64 characters) and stored in `media/{id}`; carousels upload in a
single batch. Video requires Cloud Storage (Blaze), or the Cloudflare media
Worker (`cloudflare/media`, R2) when `VITE_MEDIA_API` is set: videos and poster
frames are PUT to it with the uploader's ID token and land at
`v/{uid}/{random}.{ext}`; `ownCloudMedia` in the rules only accepts links under
the writer's own uid. Deleting a post or story deletes its files there. The
Storage SDK is loaded lazily.

## Limitations

- No push notifications (needs a server to send FCM messages).
- Search ranks a client-side candidate pool; it needs a hosted index at scale.
- Per-format brick caps are enforced client-side for list queries.
- Moderation is pattern-based; image, video and audio aren't analysed.
- App Check enforcement is not yet enabled.
