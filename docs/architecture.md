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
| `users/{uid}` | Public profile. Subcollections: `following`, `followers`, `followRequests`, `notifications`, `rsvps`, and owner-only `affinity` (one document, `all`), `saved`, `hidden`, `blocked`, `private/prefs` (interests, hidden words, mutes), `private/age` (birth year, set once), `private/desk` (newsroom folders). Profiles that still carry `birthYear` move it to `private/age` at sign-in and stay hidden from visitors until then. |
| `usernames/{handle}` | Handle registry; claimed and released only together with the profile. |
| `posts/{id}` | `kind`: `post` (Still), `text` (Strand), `short` / `video` (Flicks). Carousels store `media[]` (2–10 slides; `media[0]` mirrors `mediaUrl`). Subcollections: `likes`, `saves`, `sends`, `votes`, `comments` (each with `likes`). |
| `reposts/{postId}_{uid}` | One per user per post; public posts by others only. |
| `stories/{id}` | 24h media. `views/{uid}` and `likes/{uid}` are author-only; `echoes/` are public replies. |
| `chats/{id}` | 1:1 ids are the sorted uid pair. Subcollections: `messages`, `media` (voice notes, photos), `typing`, `reads`. |
| `calls/{id}` | WebRTC signalling with `callerCandidates` / `calleeCandidates`; deleted after the call. |
| `groups/{id}` | Circles. `members`, `joinRequests`, `guides/{id}/progress`. |
| `events/{id}` | Gatherings. `rsvps`, `posts` (discussion), `photos` (from the start until 30 days on, by the host and people going), legacy `announcements`. |
| `rolls/{id}` | Rolls (shared disposable cameras): `members`, `developAt`, `photoCount`. `photos` are unreadable until `developAt` (except by their author, for export and deletion); `shots/{uid}` counts each member's 27, tied to every photo by the rules. Images are digicam-graded on the device (`lib/digicam.js`) and stored on R2 under `r/{uid}/`. |
| `activity/{uid}` | Staff stats: `lastActiveAt` and which of the first 60 days since `joinedAt` the account was used. One write a day per device; owner and staff only. |
| `news/{id}` | Stories as parallel block arrays plus `script`. `revisions`, `presence`, `updates` (live blog), `correctionRequests`. `newsWriters/{uid}` lists writers and holds their bylines. |
| `locks/{uid}`, `usage/{uid}_{year}-{day}`, `familyLinks/{teenUid}`, `brickStats/{uid}` | Brick mode. |
| `reports/{type}_{id}_{uid}`, `suspensions/{uid}` | Moderation. |
| `media/{id}` | Inline images (Spark plan), referenced as `mesh-media:<id>`. |
| `rateLimits/{uid}`, `presence/{uid}`, `thoughts/{uid}`, `spouseRequests/{id}`, `admins/{uid}`, `badges/pink` | |

Composite indexes are declared in `firestore.indexes.json`.

## Client

- **Code splitting.** Screens, overlays, the story viewer, the photo cropper
  and the Storage SDK load on demand, as do the sign-in page and first-run
  tour (most opens are signed in), and a post's comments and edit sheets
  (loaded on tap). Firebase is a single vendor chunk because its packages
  have circular imports. Firestore's RE2JS regex engine, which it bundles
  only for pipeline queries Mesh never runs, is swapped for a stub
  (`lib/re2jsStub.js`, aliased in `vite.config.js`); that saves about 140 kB
  on every load. Remove the alias if Mesh ever uses pipelines.
- **Profile addresses.** Profiles live at `/@handle`. Handles of profiles
  read this session are cached, so links go straight there; an older
  `/u/<uid>` link resolves and swaps its address for the handle.
- **Own profile.** `myProfile()` (`lib/data/users.js`) keeps the signed-in
  profile current with one snapshot listener instead of a read per write.
- **Opening quickly** (`lib/snapshot.js`). The signed-in account (profile,
  settings, who you follow, block and mute) and the top of Home (topic
  "all", up to a day old) are copied to local storage under `mesh:snap:`.
  Offline, Firestore answers a query with nothing rather than an error, so
  an empty refresh never replaces the copy on screen or on the device.
  On opening, Mesh shows them as soon as Firebase knows who's signed in,
  without waiting for the four account reads or the feed queries, then
  replaces them with fresh data; a read that fails keeps the copy. The
  copies are deleted whenever nobody is signed in. App Check starts 3
  seconds after Mesh is on screen (see Cookies and storage).
- **Unexpected sign-outs.** `mesh:last-account` notes who last signed in
  here. Deliberate sign-outs and account deletions clear it first
  (`signOutHere`, `forgetAccount` in `lib/auth.js`), so if Mesh opens signed
  out while it's set, the person is told, with a code: `keep-signed-in-off`
  (the session ended with the browser, as chosen), `not-kept` (M.A.T.H only:
  the stored sign-in was gone from the device), or `ended` (Firebase dropped
  it, such as a revoked or expired session). An installed app (M.A.T.H)
  never ends a session on closing and hides "Keep me signed in": the phone
  closes those apps whenever it likes.
- **Visitors.** Signed out, the shell shows public sections and routes
  account-only pages to a join prompt. Actions call `needsAccount(reason)`
  from the shell context, which explains what needs an account. Signing in
  or out reloads the page so no state carries between the two.
- **Profile cards.** `profileCache` overlays authors' current name, photo and
  badges (admin-awarded, e.g. Beta tester) on denormalised content.
- **Badges** (`components/ui/Badges.jsx`). One per person, the highest they
  hold: Founder, then Co-founder, then Queen, then Beta tester. A profile
  page shows it in full. Beside a name on posts and comments only the rare
  ones show (founder, co-founder, queen, plus the verified or pink tick), so
  a badge there stays special; Beta tester and the like are profile-only.
- **Privacy by default.** Store only what a feature needs, and not for long:
  online status can be turned off (Settings → Show when you're active, which
  deletes the last time held); who viewed a story is deleted 48 hours after
  posting (`tidyStoryViewers`, run by the author's device); a feed score per
  author is forgotten after 90 days without interaction (`fetchAffinity`);
  Brick usage keeps 7 days; poll votes, shares and news reads are readable
  only by the person themselves.
- **Verification.** Admins verify accounts (`verified` in `users/{uid}.badges`)
  from a profile's menu or the Verified tab in moderation. Verified accounts
  and journalists get a purple tick beside their name on profiles, posts,
  comments and search results. The founder alone can give girlfriend
  privilege, to one account at a time: a pink check in place of the purple
  tick, a pink profile (`.theme-pink` re-tints the surface tokens) and a pink
  banner behind the profile photo. `badges/pink` names the holder, and the
  rules require the holder's badges (and only theirs) to carry `pink`.
- **Welcome and full tour** (`Tour.jsx`). A new account gets one short
  welcome card once the Home feed is showing with nothing else open: Mesh has
  what people expect from other apps, then the four things that are
  different (Brick mode, Rolls, made by people, not for sale). `tourDone` in
  private prefs (and a local flag) stops it repeating. Guests get nothing
  extra; the Welcome page already explains Mesh. The full tour, which
  spotlights the main controls one at a time (elements marked `data-tour`;
  phones and computers mark different ones, and steps with nothing visible to
  point at are left out), runs only when asked for: Settings → Full tour of
  Mesh, Help, or "Show me around" on the welcome.
- **Notification banners.** Notifications that arrive during a visit drop in
  as a short banner (not on the Notifications page, not from muted or blocked
  people).
- **Feed state** is kept per feed for the session so returning restores the
  scroll position without refetching.
- **Updates.** `UpdateBanner` compares the deployed entry chunk with the
  running one and offers a reload. A page whose code has gone from the server
  (a deploy while the tab was open) reloads into the new build by itself, at
  most once a minute so a file that's really missing can't loop.
- **Builds are repeatable.** The same code builds to the same file names
  every time: the build time shown under Settings is written into the HTML
  (`<meta name="mesh-built">`, read by `lib/built.js`), not into the scripts.
  So a deploy only makes people download what changed, and the reload banner
  only appears when something did. `MESH_SALT=x npm run build` renames every
  built file, for when a cache is holding something wrong under the current
  names.
- **Before the app starts** (`src/boot.js`, `scripts/prerender.mjs`,
  `lib/firstVisit.js`). The HTML arrives holding two things, drawn at build
  time from the app's own components so they can't drift from it: the welcome
  page and the loading logo. `boot.js`, a small classic script in `<head>`
  (the only one; `vite.config.js` emits it), runs before the first paint and
  shows the logo unless the app is about to open on the welcome page, which
  is when nobody has signed in on this device and the address is `/` (not yet
  past the welcome page) or `/welcome`. It also applies a saved theme and
  text size. So someone new sees the real welcome page from the first paint,
  and someone coming back sees the logo, never a flash of the welcome page.
  The app then draws the welcome page without waiting for the sign-in check
  (it's the same for anyone signed out), and `main.jsx` holds off starting
  until that page's code is in, so the copy in the HTML is replaced in one
  step. The HTML also preloads that code and the two fonts every page uses.
  Everything on the welcome page that goes somewhere is a real link, so it
  works before the app has loaded. Components drawn at build time (`Welcome`,
  `ui/LogoMark`, and what they import) must load without a browser; the build
  fails with the reason if one stops doing so.
- **Crashes** (`components/ErrorBoundary.jsx`). An error while a page is
  being drawn shows "Something went wrong" in that page's area, and the menus
  keep working; moving to another page clears it. One around the whole app
  offers a reload instead of leaving a blank page.

## Creating

The composer works in steps for photos and videos (Strands are one step):
first the media, then the details (caption, location, descriptions,
topics, the AI label, who sees it), with the primary button bottom-right
throughout. For a Still, the media step (`composer/PhotoStudio.jsx`) offers
Camera, Library and From a roll; then a shape for the whole post
(Original, 4:5 or 1:1, previewed exactly as the feed shows it: a carousel
takes the first photo's shape, between 4:5 and 1.91:1), each photo placed
in the frame by dragging (or arrow keys), a filter per photo (the story
filters, or one for all), the photo editor for text and tone, and the
ordered strip: numbered, the first marked Cover, reordered by holding and
dragging a thumbnail (a mouse just drags; arrow buttons for keyboards).
`bakePhoto` (`lib/framing.js`) cuts each photo to the frame where it was
placed and applies its filter before upload. On a phone, Camera opens the
phone's own camera (`capture`): a full-quality photo or video with the
phone's processing, rather than a frame from a live feed. There are no
face or skin-smoothing filters, by design.

Developed roll photos can be posted without saving them first: Pick photos
to post on the roll (numbered in the order tapped, up to 10), or From a
roll in the composer (`rolls/RollPicker.jsx`). Picking someone else's shot
shows a reminder to check they're happy for it to be shared.

On a phone, swiping left across Home opens the story camera
(`lib/useSwipeLeft.js`; a camera slides in from the edge as the finger
moves). Swipes starting in anything that scrolls sideways, a control, or
something marked `data-no-swipe` (the stories row) are left alone, and so
is vertical scrolling. On feeds without the stories row, `StoryRail bare`
provides just the camera and editor. The story camera (`scanCodes`) watches
for QR codes and, for a Mesh link (`meshLink` in `lib/qr.js`: rolls,
profiles, posts, gatherings, circles, news, Brick groups, Mesh's own hosts
only), shows a button to open it. The story and roll cameras ask for the
camera's best resolution, up to 4K, since the photo is cropped from it.

The roll camera never changes layout when the phone turns (a selfie grip
often tips it sideways): `useTurn` reads the screen's angle, the whole
camera is turned back by it (sized in container units, `cqw`/`cqh`), and
the picture is turned the other way inside, so the buttons stay where they
were and the view stays upright to the world. A shot taken sideways is a
4:3 landscape. Rolls only shows "Rolls live on your phone" on a computer,
judged by a mouse that can hover, not by width: a phone turned sideways is
wider than a tablet.

Stills, Flicks and stories can be captured in the app (`Camera.jsx`): a
full-screen viewfinder with the shutter, library and camera flip at the bottom
where a thumb reaches. Tap for a photo; hold to record when video uploads are
on. The photo is cropped to what the viewfinder showed. On phones, adding to
your story opens the camera first, and the preview offers "Your story" (one
tap) or "Post" (into the composer with the capture attached). The story
camera and the roll camera share `lib/useCamera.js`: if asking with the
microphone fails it asks for the camera alone (photos and silent video
still work), it restarts a camera the phone ended while Mesh was in the
background, the viewfinder is never hidden (iPhones may not play a hidden
video), and a shutter tap first makes sure frames are arriving, saying so
if not, instead of doing nothing. A failure shows the browser's error name
as a code. The photo is taken as the finger lifts, so the shutter cancels
the click phones send afterwards, which used to land on the story editor's
"Post" button where the shutter had been; the editor also ignores clicks
for its first half second. In the composer,
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

## Sign-in (`firebase.js`, `lib/auth.js`)

Auth starts without Firebase's popup/redirect resolver. With it, Firebase
loads Google's sign-in frame and script on every page in Safari and on every
phone, and holds back the signed-in user until they arrive. The resolver is
passed only to the sign-in calls, as a subclass so lib/auth.js can start it
when the sign-in page opens (`finishRedirect`); a tap then opens Google's
popup at once, which Safari needs. A blocked popup falls back to a redirect,
which the sign-in page finishes when it loads again.

On joinmesh.social, sign-in runs through the site itself (`SITE_AUTH` in
firebase.js; Firebase Hosting serves /__/auth/handler), not
mesh-a293c.firebaseapp.com, which Safari treats as another site (blocked
storage, lost redirect results, no sign-in from the iPhone home-screen app).
Google's OAuth web client lists https://joinmesh.social/__/auth/handler as a
redirect URI. The iPhone home-screen app signs in with a redirect; arriving
back, firebase.js gives auth the resolver at start (only then), so Firebase
finishes the sign-in as Mesh starts and it opens signed in, with no reload.
In M.A.T.H (Mesh added to an iPhone's home screen), and when a popup is
blocked, Google sign-in skips Firebase's redirect, whose hidden frame must
load Google's script and answer within 5 seconds (often missed there:
"network issue"). Mesh sends the person to Google itself (response_type
id_token, with a random `state` and `nonce` kept in session storage), Google
returns to /__/auth/handler with the token in the fragment and no query
string, the edge Worker forwards that to /login, and the app checks the
state and nonce (`lib/googleAnswer.js`), clears the address and calls
signInWithCredential before reading auth state, so it opens signed in.
While it does, the loading screen says "Finishing sign-in with Google…",
the security check (App Check's reCAPTCHA) hasn't started yet (it waits
until Mesh is on screen; every sign-in request waits for a reCAPTCHA token
once it runs, and a slow start fails the sign-in as a network error after a
minute on phones), and after
20 seconds it gives up with `auth/timeout` rather than hang. M.A.T.H keeps
the signed-in account in local storage rather than IndexedDB, which can stop
answering in a home-screen app after a trip out to Google. Sign-in errors
show their code (and which check failed, for Google's answer) after the
message, so a report says exactly what went wrong.
The edge Worker keeps Firebase's helper pages (/__/auth/handler and iframe)
at Cloudflare's edge for 30 minutes, keyed by path: about 35 ms instead of
half a second each, and sign-in passes through them up to three times.

## Rate limits and suspensions

Writes that can be abused carry a timestamp on rateLimits/{uid} in the same
batch, and the rules refuse them if the last one was too recent (`rateOk`,
`rateOkMs`): a post every 10 s, a comment every 3 s, an inline photo every
5 s, an edit every 3 s, a new conversation (1:1 or group) every 10 s, a
message every 0.4 s and a follow or follow request every 0.5 s. Normal use
doesn't meet them; scripts do. Likes aren't limited: each limit costs a write,
likes are the most common action, and fresh accounts' likes barely count.

Accounts under a week old also have daily caps (`dailyOk`, `lib/data/limits.js`):
60 follows or follow requests and 20 new conversations in any 24 hours. Each
kind keeps a window on rateLimits/{uid} (`followWin`/`followN`,
`chatWin`/`chatN`) that moves by one in the same write, or restarts once a day
has passed (`windowOk`); older accounts keep the window but have no cap. New
accounts also can't send links in a 1:1 chat to someone who doesn't follow
them.

## Reads and writes

Firestore bills (and the free plan limits) every document read and written,
so the busy paths are kept small:

- **Home** reads the latest 60 public posts (`FEED_SIZE`; the feed ends with
  "You're all caught up"), public circles' posts, followers-only posts and
  reposts for 30 followed accounts per query, and news only if you follow a
  journalist. Following reads the people you follow directly instead of the
  global list. Followers-only posts try an `authorId in` query first and fall
  back to a query per author if the rules refuse it.
- **Shared lists**: the latest posts, Flicks by kind and listed circles are
  shared between pages for one to five minutes (`sharedList` in
  `data/posts.js`, `fetchGroups`); pull to refresh skips the shared copy. The
  hidden-post list is read once a visit, Search's pool lasts ten minutes and
  suggested people a day.
- **Affinity** is one document per account (`users/{uid}/affinity/all`,
  `data/affinity.js`): bumps are added up on the device and written at most
  once a minute and when Mesh is hidden. Older per-author documents are moved
  into it the first time it's read.
- **Like states** for a page of posts are one collection-group query on your
  own like records (30 at a time), with a read per post as the fallback.
- **Start-up** reuses this device's list of who you follow while it matches
  `followingCount` (refreshed at least daily); inbox read markers are read
  once per chat, not again each time a message reorders the inbox; the
  notifications listener holds the latest 40.
- **Brick usage** is saved about every two minutes rather than every 30
  seconds, and Brick group entries only when they've changed.

## Bots

Posting, commenting, stories, messages, new chats, follows, reposts, circles
and gatherings need a confirmed email or a phone number (`verifiedContact`
in the rules, `lib/verified.js`; Google and Apple sign-ins come confirmed).
Browsing, likes and reports don't. In the app, `needsAccount` opens
`VerifyContact` for the reasons in `NEEDS_CONTACT` (App.jsx), which sends the
link and refreshes the sign-in token once it's opened. Unconfirmed accounts
count as fresh (below), new accounts have the daily caps above, and staff
stats show fake crowds, the same words from 3 or more accounts in the last
day (`copyClusters`) and 15 or more sign-ups within 10 minutes
(`signupBursts`). Reports for "Fake account or bot" go to the accounts team
whatever they're on.

A confirmed email at a throwaway inbox (`THROWAWAY_DOMAINS` in
`lib/verified.js`, `throwawayEmail` in the rules; a test keeps the two lists
the same) doesn't count as a confirmed contact, and sign-up refuses one.
Privacy relays (Hide My Email, Firefox Relay, DuckDuckGo) are real inboxes
and count. In ranking (`lib/fresh.js`), a fresh post reaches strangers only
once an established account engages with it (fresh likes, comments, saves
and reposts don't unlock it), and fresh posts that 3 or more fresh accounts
made word for word (`crowdCopies`) never do.

Suspensions live in suspensions/{uid} (until, reason, by), readable by the
person and staff only; the rules' `notSuspended()` reads it, so a
suspension, or a lifted one, never shows on a public profile.

## Privacy

Mesh is 16 and over (Online Safety Amendment (Social Media Minimum Age) Act
2024): `validBirthYear` and the rules refuse later birth years, and sign-up
asks whether someone born 16 years ago has had their birthday. `AgeGate.jsx`
stops accounts with no birth year (asked once) and under-16s (download and
delete only); an unreadable age record (`ageUnknown`) doesn't trigger it.

Deleting an account (`deleteMyAccountData`) also removes every file under the
user's uid on the media Worker (`DELETE /v/{uid}`), their note and its likes,
Brick groups, circles they own (and memberships), gatherings they host,
highlights, albums, open appeals and any staff role. Hidden circles can't be
listed, so ones a user owns aren't found yet. The data download includes
messages they sent, stories, highlights, albums, news drafts, their note,
Brick groups, appeals and interaction signals.

Contact sync (`lib/contacts.js`, `ContactSync.jsx`) never uploads an address
book: numbers (normalised to E.164, Australia by default) and emails are
hashed on the device (SHA-256 of `mesh-contact-v1:` + value) and each code is
looked up with a `get` on `contactKeys/{code}` (no listing). People opt in to
being findable; the rules recompute the code from their verified sign-in
phone or email (`hashing.sha256`), so nobody can register someone else's.
Only matched uids are kept, in `users/{uid}/private/contacts`, and they rank
first in suggestions ("In your contacts"). Profiles show "Followed by …" (the
target's followers you follow), and the follow-list sheet has Followers,
Following and People you know with follow buttons (on your own profile, Don't
follow back and You don't follow back instead, comparing your full lists, up
to 2,000 each); public accounts' lists are
readable signed out too.

Security notes: every edit rule re-validates what it lets change (gathering
and circle edits run the same content checks as creation, including the hate
filter and https-only ticket links; chat nicknames are bounded). External
links in posts, gatherings and News sources all go through the leaving-Mesh
check. Hosting sends CSP, HSTS (two years, subdomains), nosniff, frame denial,
a strict referrer policy and a Permissions-Policy that also opts out of
Topics. New 16 and 17 year old accounts start private with messages from
people they follow. Passwords need 8+ characters and can't be a common one or
contain the handle or email. `@grpc/grpc-js` is pinned past its advisory via
`overrides`. Contact lookup codes can be brute-forced by someone guessing
phone numbers, which is why being findable is opt-in.

The legal pages (`src/legal`) must match this code. Until `business.js` has
the operator's legal name and ABN, the policies name "the founders" rather
than placeholders; the warning about missing details shows in development
only. App Check (reCAPTCHA) is essential security and runs for everyone on
the website.

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
  storage is always on, and so is Google reCAPTCHA for App Check, the bot
  check. Optional third parties (GIPHY when GIFs are on, Google ads, never in
  the iPhone app) stay off
  until the visitor picks "Allow all" or switches them on in "Choose";
  "Essential only" has the same weight. The choice is kept under
  `mesh:consent` and can be changed in Settings or from the Cookies policy.
  App Check never runs in the iPhone app, and starts 3 seconds after Mesh is
  on screen rather than as it opens: while it runs, every sign-in and database request waits for a
  reCAPTCHA token, and loading reCAPTCHA takes a second or more (several on
  a phone). Requests before then count as unverified, which is fine while
  App Check isn't enforced; start it earlier before enforcing it. The
  first-run tour waits until the banner is answered.
- **Accepted exposure.** The Firebase web config and the TURN relay
  credentials are in the site's code by design (there's no server to hand out
  short-lived ones). App Check isn't enforced yet, so the rules are the only
  barrier for scripted access.
- **Cloudflare's blocked script.** Bot Fight Mode adds an inline script to each
  page on joinmesh.social, and the CSP blocks it, which shows as a console
  error. Leave it: the script changes on every load, so a hash can't allow it,
  and `'unsafe-inline'` or a fixed nonce would weaken the CSP. It only sees page
  loads, because sign-ups and database requests go straight to Google, and
  acting on its result needs Cloudflare Enterprise.

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
rather than two tabs, Strands sit on their own panel (short ones in larger
text), and the scroll is broken up by "Circles to join" (public circles
sharing the viewer's interests, after the 4th post) and "People you may know"
(the Search suggestions, after the 9th). Both rows are worked out once per
visit. Suggestions walk follow lists (a read per entry), so the walk is capped
at about 1,100 reads and its result kept on the device for 6 hours
(`mesh:suggest:`); a visit in between reads only the profiles it shows.

People search never downloads the user base: profiles can only be listed
50 at a time (the rules; staff excepted), so search looks people up by
handle (the usernames collection) and by the start of their display name
(`nameLower`, lower case without accents, written with the name and filled in
for older accounts when they next load their profile), plus the 50 most
followed accounts for matching on bio and town. Chats show the newest 60
messages and load earlier ones on request.

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

Fake crowds (`lib/fresh.js`): posts, likes, saves, sends, reposts, comments
and comment likes from low-trust accounts (under a week old, or without a
confirmed email or phone) carry `fresh: true`, and each count has a twin
(`freshLikes`, `freshSaves`, `freshSends`, `freshReposts`, `freshComments`;
`freshLikes` on comments). The rules (`lowTrust`, `freshOk`, `tiedFresh`)
make the stamp match the account and move the twin with the count. Ranking,
comment order and search use `settled()`, which counts fresh ones at a
quarter and never more than `FRESH_CAP` (10) in total; the visible counts
stay true. A fresh post isn't shown to people who don't follow the author
until someone has engaged with it (`recommendable`), and links in fresh
posts and comments, and in the bios of accounts under a week old, don't open.
Comments by new accounts show "New account". Staff stats list posts with 8 or more fresh
actions within an hour in the last day (`fetchFreshActivity`, `freshBursts`),
read through collection-group queries that only return fresh records.

## Story editor (`components/story`, `lib/storyCanvas.js`)

Every story goes through a Snapchat-style editor first, from the camera
(which hands over captures with `onCapture`) or a file. It works on a 9:16
frame: the photo fills it or fits inside a blurred copy of itself; text
(caption bar, big, label, glow), freehand drawing, emoji, time, date and
digicam date-stamp stickers, and GIFs sit on top; swiping changes the filter.
The same functions draw the preview and the export (`drawPhoto`,
`applyFilter`, `drawOverlay`), and filters are CSS filter strings, drawn with
the canvas filter or the same maths per pixel where a browser has none.
Photos post as one 1080x1920 JPEG. Videos post unchanged, with the drawing
as a see-through image (`overlayUrl`, inline media, WebP or PNG) and the
filter, fit and sound as story fields, so nothing is re-encoded. GIFs stay
animated as `gifs` metadata on both. The words go in `text`, for screen
readers, and the rules run the hate filter over them; the editor runs
`checkContent` first. Stories with `fit` render in a 9:16 frame
(`StoryFrame` in StoryViewer); older ones as before.

## Rolls camera (`components/rolls`, `lib/digicam.js`, `lib/shutter.js`)

The roll camera is a mid-2000s compact. Shots get a buzz, a synthesised
shutter click, blades and "TAKEN". Zoom is a W/T rocker (held), a pinch, or
holding + / -, all driving one slow motor toward a target (the whole 1x to
3x range in about 3.6 s): it spins up over 0.3 s, eases off as it nears
where it's going, and on letting go coasts a little and eases to a stop. The
motor's sound (`whirr` in `lib/shutter.js`: a thin, high whine with soft
gear ticks, nothing below about 700 Hz) is driven by the same speed every
frame, so volume, pitch and ticking rise and fall with the movement; zooming
out runs a little lower. A W–T bar shows while zooming. It paints the viewfinder and the
bar directly (a CSS scale) rather than re-rendering, and the shot crops the
frame by the zoom, as a compact's digital zoom did. The develop step
(`developFrame`) picks its look from the flash switch (`LOOKS`): with the
flash, an early-2000s compact (more contrast, black at about 8, punchier
primaries, little warming, a hard centre pop falling off to the corners);
without it, warm 35mm film tuned against scanned disposable-camera rolls
(black lifted to a murky 19 or so, cool teal shadows, blues and teals kept
richer, softer, amber, a gentle vignette, heavier grain). Both: a 3x3 binomial blur
(`softCopy`, about 0.7 px) blended in to take off the phone's sharpening; a
monotone-cubic tone curve with a little upper-mid punch and a soft
shoulder (white about 240); gold highlights, with slightly magenta shadows under flash;
per-pixel colour (`filmColour`: reds and oranges warmer, skin a touch
brighter, yellows toward orange, greens toward olive and quieter, blues
toward cyan and quieter, muted colours lifted and loud ones calmed); a
faint red-cyan fringe toward the corners (`lensFringe`, up to 1 px); a
cheap lens's softness, sharp in the middle and blending toward a
scaled-down-and-up blur at the edges and corners (`lensBlur`); grain like a
scanned roll, in soft clumps of two sizes, mostly brightness with a faint
colour speckle, peaking in the mid-tones but running through shadows and
sky; faint warm halation round the brightest spots (screened, so it can't
pass white); and the date stamp. The stamp is LED seven-segment digits
(`lib/stamp.js`, shared with the on-screen `SevenSeg` readouts and the story
sticker) drawn as light, like a film camera's date back: soft-edged, a hot
amber core, a red-orange bleed and grain, screened on so it fades over a
bright sky (`drawStamp`, built once per size and cached).

Links never open in M.A.T.H: tapped in Messages or another app, a roll link
opens in Safari or that app's own browser, each signed in separately. So the
signed-out invite page explains that and offers Copy invite link, and Rolls
has Scan QR code (the host's Invite screen shows one) and Paste link, which
open the roll inside Mesh. The scanner uses the browser's BarcodeDetector
where there is one (Android) and otherwise jsQR, loaded only when the
scanner opens (kept out of the preloaded chunks in `vite.config.js`).
`rollIdFromLink` accepts only Mesh hosts and `/rolls/<id>`.

## Help (`/help`, `lib/helpGuides.js`)

Plain-language guides for people of any technical experience, grouped by
topic, each with numbered steps naming the buttons people see (in
`**bold**`), tips and a button to the screen it's about. Search reuses the
settings ranking (`searchSettings`) with filler words dropped ("how do I
delete my account" finds the delete guide). Signed-in people get a
first-steps checklist ticked off from their profile, interests, follows,
notification and install state. "Words Mesh uses" explains Mesh's own names
(Still, Strand, Roll…). Help is in the More menu and the phone drawer,
works signed out, and Brick mode never locks it. Feature pages link to their
guide with `HelpLink`. When a screen changes, change its guide:
`helpGuides.test.js` checks structure and search, not wording.

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

Private messages aren't filtered for hate, but two checks run on the
device and record nothing: `messageWarning` asks before sending a message
that would be blocked in a post ("Send anyway" sends it), and `hideInRequest`
folds such a message away in a message request (in the chat and the inbox
preview) behind Show and Report.

AI-generated pictures and videos aren't allowed; AI edits of real ones are,
labelled "Edited with AI" (`aiGenerated`). `lib/aiMarkers.js` reads the
file's own markers before upload: the IPTC/C2PA digital source type
(`trainedAlgorithmicMedia` is refused, `compositeWithTrainedAlgorithmicMedia`
and `algorithmicallyEnhanced` are labelled automatically) and Stable
Diffusion settings left in PNGs. Stripped metadata gets past it, so reports
back it up.

Staff are admins (`admins/{uid}`, set in the console) and moderators
(`moderators/{uid}`, with `teams`), each team with its own job, enforced in
the rules (`onTeam`):

- **News** (`newsTeam()`): journalist applications, journalists, correction
  requests, and taking down a story that breaks the rules. Journalists
  publish their own stories; Mesh hosts them and doesn't approve them first.
- **Content** (`contentTeam()`): post and comment reports, removals and AI
  labels, story echoes, rolls, circles, gathering photos, appeals, the image
  sweep and bans.
- **Accounts** (`accountTeam()`): message and profile reports, deleting a
  reported message, bans, verification and beta badges.
- **Admins** are on every team, and alone appoint staff (choosing teams from
  Moderation > Staff), run ads and see stats.

Reports route by what was reported (`canHandleReport`: posts and comments to
content, messages and accounts to accounts), and each team's queue queries
only its kinds. A moderator appointed before teams existed is on all three.
Only the founder gives the pink check.

Staff accounts (admins and moderators) are work accounts, apart from the
founder's own personal account (`FOUNDER_UID`): Home is the moderation queue;
feeds (For you, Following, Flicks, the News list), Messages, Rolls, What's on,
the leaderboard and circle discovery show the queue instead; navigation is
Moderation, Search, Notifications, Settings and Help; Search has no Explore
or suggestions; and `needsAccount` refuses posting, liking, following,
commenting, messaging, stories, joining and replying with "Work accounts only
moderate". Anything opened from a report (a post, profile, circle, gathering
or story) still shows. No welcome or interests picker. This is in the app;
the rules still let staff accounts write like anyone else.

Journalist applications (`journalistApplications/{uid}`, Settings > Become a
journalist; `lib/data/applications.js`): name, outlet, region, experience,
skills, degree, up to five links and up to three proof photos (small inline
images in `proof/{1-3}`), private to the applicant and the news team. A yes
writes `journalistChecks/{uid}` and `newsWriters/{uid}` in the same batch as
the decision (the rules refuse an approval without the writer record); either
way the proof and CV details are deleted, leaving the outcome, and the
applicant gets a `journalist` notification from Mesh. A declined applicant can
apply again after 30 days.

The filter allows venting: insults at a person, a company, Mesh or a
government pass. What it stops is roping in who people are: slurs,
dehumanising, putting a group down (insults, stereotypes, mockery and coded
terms, all blocked), and the same in dressed-up language: pseudo-science
("genetically predisposed to criminality", "lower average IQ"), "will never
assimilate", "not real Australians", "a burden on society", clinical
homophobia and transphobia, sexism in a lab coat, and code phrases ("great
replacement", "13/50", "remigration"). Group names include their formal
dressing (`DRESSED_UP`: "certain demographics", "people of African
descent"). Absolute claims only, so policy and research talk pass;
`moderation-cases.json` holds the examples both ways.

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
only protected from violence and dehumanisation. Faiths by name (`FAITHS`)
can be argued with, but calling one a disease or filth, or calling for it to
be banned or wiped out, is blocked as an attack on its followers ("Islam is a
cancer", "ban Christianity"); hating one or calling it evil is borderline.

Comments are read against their post (`postAbout`: title, text, image
descriptions, topics) and thread. `assessText(text, { about, thread, parent,
comment })` looks for a group named in any of them (`TOPICS`); if there is one,
`ON_POST` runs: words that mean nothing alone but are hate there ("this is why
Australia is falling", "how do they allow cancer in their team", 🐷 on a post
about a Muslim). `declineKind` reads only the post, so a thread calling out
racism can't clear what it's calling out; a contest, a crime or an attack on the
group turns the decline family off, and a policy story softens it to borderline.
`coded` isn't cleared by general condemnation ("disgusting" could be about the
target), only by words aimed at the hate itself (`CALLED_OUT_RE`). Hidden
spellings are uncovered first (`uncover`: "m u s l i m s", "m*slims", "isIam").

It runs when writing and again when reading (`Comments.jsx`), so a comment that
got past the check, or was written before a pattern existed, folds anyway. It
reads words only: nothing here can see a picture, or what's said in a video.
A post that doesn't name the group, under a thread that doesn't either, reads
as nothing. `moderation-real.json` holds real wording both ways.

`lib/threadContext.js` reads a whole thread together, with rules and no AI
(nothing leaves the device). `readThread(post, comments)` starts from the word
filter, then scores each comment: words long used against the group the post
or thread names (`TROPES` in `threadWords.js`), doubting the person ("hope
she's actually qualified"), us-and-them wording, shutting them out, hostility,
and whether it has anything to do with the post. Warmth and real questions
count against. Then it cross-references the thread, twice over: a reply telling
a comment off counts against it, a short "facts" or "lol" under a flagged
comment is flagged too, as are the same author's other comments and ones echoing
flagged words if something else points the same way. 3 points folds, 5 blocks at
writing. Nothing runs without a named group, or on a post about a crime against
one. `thread-sets.json` holds whole threads with a floor on what's caught and
none of the fair comments flagged. On threads it hadn't seen it caught 1 subtle
line in 6 at best, and it's tuned to leave fair comments alone, so most new
wording still gets through until someone reports it.

In comments, `repeatsItself` stops a phrase pasted over and over (anywhere
public, not in messages), and `isPreaching` stops a paragraph of it under a post
that isn't about faith, any faith alike. A line like "Jesus loves you" is fine.

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
messaging, calls, News, notifications and settings are never locked. Brick
mode limits Feed and Flicks; an old News cap is carried through saves
(`CAP_SECTIONS`) but nothing enforces it.

Caps are metered by the client and saved about every two minutes, at once on
reaching a cap and when Mesh is hidden; the rules accept up to the seconds
since the last save (at most five minutes, at most once per 25s).
A feed query can mix formats, so per-format caps can't be enforced on list
queries; the client closes those sections. Scheduled windows and instant
bricks are enforced on every read.

Parents (19+) can add a second layer to an under-18 account after the teen
accepts. Parental controls have their own page (`ParentalControls.jsx`,
`/account/family`), apart from the person's own Brick mode. Only the parent can loosen it, and it lapses the year the teen turns
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
step. Publishing (`readyToPublish`) requires a headline, body, two sources,
the 60-second version (`keyPoints`: three points of 20 characters or more,
shown at the top of the story and in Quick read) and the journalist's
attestation, records a revision, and is blocked while the
story is marked for legal review. Readers send correction requests to the
story's journalists, who (or an admin) add append-only corrections; live
blogs post updates to a subcollection.

Any story can carry a Flick: a video (`videoUrl`, `videoPoster`,
`videoSeconds` on the media Worker, with `hasVideo` kept in step for the
Flicks query) that plays at the top of the article, above the 60-second
version and the text. The article is still required. Stories with a Flick show
a play badge in News and appear in the Flicks player (`fetchNewsFlicks`, mixed
in after every four short Flicks and on a News shelf on Flicks home) with the
headline, the journalist and outlet, "Read the article" (or swipe left) and a
60-second sheet. Watching 80% counts as a read. A `graphic` flag (set by the
journalists or the news team) hides the video and its still behind a warning,
never shown to under-18s. Deleting the story deletes the video and still.

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

Sorting (`lib/commentTree.js`): comments the filter flags go below the rest in
Best and Top, whatever their likes. Best (the default) is the lower bound of the
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

## Ads

Ads are sold directly and run by staff from `/account/ads` (`AdsManager.jsx`,
`ads/{id}`). Home shows one after the 6th post and every 10 after
(`AdCard.jsx`), labelled "Ad", with "Why am I seeing this?"; never in
Messages. Matching (`adFits`) uses only the town on the viewer's profile, the
interests they picked and whether they're 18 or over. Signed-in views (once
per ad per visit) and taps add one to totals; nothing records who. Links open
through the usual leaving-Mesh check.

Ad spaces with no local ad fall back to Google AdSense (`GoogleAdCard.jsx`,
`lib/adsense.js`, unit settings in `.env`), but only for signed-in adults who
turned on the "Google ads" cookie choice (off by default). The script loads
only then, requests non-personalised ads, and a space Google leaves
`unfilled` is removed. The CSP allows Google's ad domains; the site carries
the AdSense ownership meta tag and `ads.txt`. Auto ads stay off. Political
and issue ads aren't accepted; in AdSense the Politics sensitive category is
blocked in the account's blocking controls (a console setting, not code).

## Edge (`cloudflare/edge`)

Once joinmesh.social's DNS is on Cloudflare (proxied), a Worker in front of
Firebase Hosting handles shareable paths (`/news/*`, `/p/*`, `/@*`, `/u/*`,
`/gatherings/*`, `/circles/*`): it reads what a signed-out visitor could see
through Firestore's REST API and writes the page's title, description, image,
canonical link and, for stories, NewsArticle data and readable text into the
HTML. `/og/media/{id}` serves inline photos as images for previews, and
`/sitemap-news.xml` lists published stories. Everything else goes straight to
Firebase.

## Push notifications (`cloudflare/push`, `lib/push.js`)

Web Push with VAPID, sent by the `mesh-push` Cloudflare Worker (no Firebase
paid plan needed). Devices register their push subscription and the kinds
they want (`POST /devices`); subscriptions live in D1 (`mesh-push`, Oceania;
schema in `cloudflare/push/schema.sql`). After a message, notice or call, the
sender's app calls `POST /notify`; the Worker reads that record from
Firestore's REST API **with the sender's own ID token**, so the security rules
decide, checks it's theirs and under two minutes old, sends each event once
(`sent` table), and drops subscriptions the push service reports gone.
Payloads are encrypted end to end (RFC 8291, tested against the RFC's
example). Message previews only show when the chat isn't a request for the
recipient. Likes and reposts are never pushed. Rolls and gatherings set
reminders (`POST /alerts`) that a once-a-minute cron sends. A device in an
instant brick only gets messages and calls. `public/sw.js` shows
notifications and opens the page; it doesn't cache anything. The private
VAPID key is a Worker secret (`VAPID_PRIVATE_KEY`), locally in the gitignored
`cloudflare/push/.dev.vars`; run the Worker locally with the `mesh-push-dev`
launch config, which the dev app uses automatically.

## Media storage

Post and story photos go to the Cloudflare media Worker (`cloudflare/media`,
R2) when `VITE_MEDIA_API` is set: prepared on the device at up to 2048 px,
WebP (JPEG where the browser can't make WebP) at quality 0.9
(`preparePhoto` in `lib/media.js`; drawing again drops EXIF such as
location), PUT with `?kind=photo`, and kept at `p/{uid}/{random}.{jpg|webp}`
(up to 6 MB each, 1,000 a person for now). Story photos come from the story
editor's canvas and upload as they are. Everything else (chats, comments,
gatherings, avatars, and posts without the Worker) is compressed into
`media/{id}` (WebP or JPEG, under 900k base64 characters, 1440 px; avatars
480 px); carousels upload in a single batch. Both paths shrink in halving
steps with high-quality smoothing, since one big step leaves jagged edges
and moiré. Chat photos stay in Firestore so only the chat's members can read
them. Video requires Cloud Storage (Blaze) or the Worker: videos and poster
frames land at `v/{uid}/{random}.{ext}`, roll photos at `r/{uid}/`. The
rules only accept Worker links under the writer's own uid (`ownCloudMedia`,
`ownCloudPhoto`, `ownRollMedia`). Deleting a post (every slide) or story
deletes its files there, and a post that fails to save removes the photos it
uploaded. The Storage SDK is loaded lazily.

## Limitations

- No push notifications (needs a server to send FCM messages).
- Search ranks a client-side candidate pool; it needs a hosted index at scale.
- Per-format brick caps are enforced client-side for list queries.
- Moderation is pattern-based; image, video and audio aren't analysed.
- App Check enforcement is not yet enabled.
