# Mesh: compliance state and risk register

Last reviewed 12 October 2026, against the code at this commit.

**This is an engineering document, not legal advice.** It was written by
reading the code, not by a lawyer, and it cannot tell you whether Mesh is
lawful. Every item marked **VERIFY** needs a solicitor admitted in Australia
before launch. The technical findings (what the code collects, stores and
exposes) are grounded in the source and can be checked line by line.

---

## Before you can launch

1. **Fill in `src/legal/business.js`.** Three fields are still `TODO` (legal
   name, ABN and address). They render verbatim in every policy, and the Legal page shows a warning banner
   until they're set. A policy naming "TODO" as its operator is worse than no
   policy: under Australian Consumer Law s18, a consumer-facing trader has to
   be identifiable.
2. **Resolve the under-16 question below.** It is the largest single exposure.
3. **Have a lawyer read the four policies.** They are accurate to the code, but
   accuracy and sufficiency aren't the same thing.

---

## Risk register

### R1: Under-16 accounts vs. the social media minimum age law · **HIGH** · VERIFY

Mesh is 16+. Sign-up asks for a birth year, and an account whose birth year
says under 16 (or has none) reaches only the age gate (`AgeGate.jsx`), where
it can download its data or delete the account. The birth year is kept in
`users/{uid}/private/age`, readable only by its owner, and can be set once.

Australia's *Online Safety Amendment (Social Media Minimum Age) Act 2024*
requires age-restricted social media platforms to take reasonable steps to
prevent under-16s holding accounts (penalties up to $49.5 million). Mesh is
squarely the kind of service the law covers, and a self-declared birth year
is unlikely to count as reasonable steps on its own.

**Open:** real age assurance (for example k-ID: face estimation, ConnectID or
photo ID) is not yet in place.

### R2: Liability for user content · **HIGH** · VERIFY

Australia has no equivalent of the US Section 230. Following *Fairfax Media v
Voller* (2021), operators of a page can be treated as publishers of third-party
content posted to it. Defamation exposure on a social platform is real and is
not removed by a terms-of-service clause.

Mesh's mitigations as built: report flow on every post (`PostCard.jsx`),
admin-only report queue, automated hate-speech and spam filtering, circle-level
moderation. What's missing is a documented, time-bound takedown process with a
human behind it. **Get advice on the innocent dissemination defence and the
serious-harm threshold, and write down your takedown SLA before launch.**

### R3: Copyright, with no platform safe harbour · **MEDIUM-HIGH** · VERIFY

The safe harbour scheme in the Copyright Act 1968 was extended in 2018, but
commercial online platforms are generally still **outside** it. Mesh can
therefore be exposed to authorising infringement by its users in a way a US
platform relying on the DMCA would not be.

As built: the Terms prohibit posting others' work and give a copyright contact
(`BUSINESS.copyrightEmail`), and any post can be deleted by its author or an
admin. **Act on complaints fast and keep a log.** Speed is most of the defence
you have.

Bundled assets: the app ships exactly one image, `public/mesh.svg`, written for
this project. The Vite logo that previously served as the favicon has been
removed. It was a third party's mark standing in as the site's identity. The
Google and Apple marks in `AuthPage.jsx` are used only on their own sign-in
buttons; **check they still match Google's and Apple's current branding
guidelines**, which are conditions of using those sign-in services.

### R4: Media with a US provider · **MEDIUM**

Firestore is in `australia-southeast1` (Sydney), and holds profile photos,
photos in messages and voice messages. Photos in posts and stories, videos and
roll photos are on Cloudflare R2 (bucket `mesh-media`, location `OC`, Oceania,
checked 12 October 2026), served through Cloudflare's worldwide network.
Cloudflare is a US company, so this is treated as a cross-border disclosure
under Australian Privacy Principle 8, and the Privacy Policy says so.

**If Cloud Storage is ever turned on** (Blaze plan), create the bucket in
`australia-southeast1` and update the policy before any media moves.

### R5: Birth year readable by others · **FIXED**

Birth year has moved to `users/{uid}/private/age`, readable only by its owner,
settable once, and read there by the rules' age checks (`birthYearOf()`). An
older profile is moved the next time its owner opens Mesh (`fetchOwnProfile`
in `src/lib/data/users.js`), which also strips old `email` and `phone` fields.
Until then a dormant account's old fields stay readable by signed-in users
(never by guests); staff can move a birth year across unchanged.

### R6: Notifiable data breaches · **MEDIUM**

The Privacy Policy commits to notifying affected users and the OAIC for
breaches likely to cause serious harm, as the NDB scheme requires. **That is a
promise with no plan behind it yet.** Write a one-page response plan: who
assesses, within what window, and how you contact users. You need it before an
incident, not during one.

### R7: Moderation claims · **LOW, now mitigated**

Previously the sign-in page claimed hate speech was filtered "no exceptions"
and the news page claimed everything was "fact-checked before publication".
Both were representations Mesh could not support: automated filtering is a
word list with normalisation, and news review is one person checking a
submission against the sources given.

Both have been rewritten to describe what actually happens. **Keep them that
way.** Overstating safety is a misleading-conduct risk under ACL s18 and is
also how platforms end up in front of regulators.

September 2026: moderation now has a server-side slur check, reports on posts,
comments, messages and accounts, a moderators' queue, suspensions enforced by
the rules, and reach limits for borderline content. The Community Guidelines
describe each of these and say plainly that the filter misses things, covers
English only, and can't read images, video or voice. That's accurate; keep it
accurate as the system changes. The Online Safety Act 2021 (basic online
safety expectations) expects reporting tools and timely action on reports:
someone has to actually work the queue, and response times should be tracked
once there's volume.

### R8: App Check registered, not yet enforced · **LOW**

The Firebase config is client-side, which is normal and not a secret. App
Check is now registered with reCAPTCHA Enterprise and the app sends a token
with every request (`src/firebase.js`). Until enforcement is switched on for
Firestore and Auth (Firebase console > App Check > APIs), requests without a
token are still accepted, so a script with the config can still reach the
API within the limits the rules set. **Next step:** once the App Check
metrics show nearly all requests verified, enforce for Firestore, then Auth.

---

## What the audit found, and what changed

### Tracking and third parties
- **Analytics: Cloudflare Web Analytics only.** Page views and load times,
  no cookies, no profile of anyone. No Google Analytics, no Meta pixel, no
  Segment, no Sentry.
- **Google ads (AdSense): opt-in.** Off unless someone 18 or over turns on
  "Google ads" in their cookie choices; then non-personalised ads fill empty
  Home slots only. Disclosed in the Privacy and Cookies policies.
- **Google reCAPTCHA Enterprise** (Firebase App Check) sets its own cookies,
  so it stays off until someone allows it in their cookie choices. Phone
  sign-in runs an invisible reCAPTCHA when an SMS code is requested.
- **Others, each disclosed in the Privacy Policy:** Metered (TURN relays for
  calls), Photon by komoot (place search), Cloudflare (delivery, R2 media,
  push notifications), and the browser's own push service.
- **Embeds: none.** No YouTube, no Twitter, no iframes.
- **GIPHY** (only if `VITE_GIPHY_API_KEY` is set). Search words and the
  viewer's IP address go to GIPHY when the picker is open, and every GIF shown
  on Mesh loads from GIPHY's media servers. No account details are sent. The
  picker shows "Powered by GIPHY" as GIPHY's API terms require, and under-16
  accounts get G-rated results only. Disclosed in the Privacy Policy.
- **Google STUN during calls.** Browsers ask Google's public STUN servers for
  their public address, so Google sees the IP addresses of people on calls, and
  each side learns the other's IP address. Disclosed in the Privacy Policy. Call
  setup data is deleted from Firestore when a call ends.

### Storage in the browser
- Firebase Auth session token (session-only unless "Keep me signed in").
- `mesh:` keys in `localStorage`: preferences, posting cooldown and duplicate
  checks, and on-device copies of what you last saw so Mesh opens instantly.
  Each is listed in the Cookies & Storage policy; keep that list in step when
  adding one.
- **Cookie choices are real opt-ins** (`StorageNotice.jsx`): Google's
  security check and Google ads each stay off until allowed. Everything else
  stored is necessary and disclosed in the Cookies & Storage policy.

### Data minimisation: one real finding, fixed
Email address and phone number were being copied into `/users/{uid}`, which
**every signed-in user can read**. They were redundant: Firebase Auth already
holds both, readable only by the account owner, and `AccountPage.jsx` was
already reading them from there.

Both fields are now removed from the document and **rejected by the security
rules**, so a future change can't quietly reintroduce them.

> **Migration:** older user documents lose `email` and `phone` the next time
> their owner opens Mesh (see R5). Accounts that never come back keep them, so
> a one-off admin sweep before launch would close it completely.

### Consent
- An unticked-by-default checkbox now gates account creation on both paths:
  email signup, and the finish-profile step used by Google, Apple and phone
  sign-in (`AuthPage.jsx`).
- Acceptance is recorded as `termsAcceptedAt` (server timestamp) and
  `termsVersion` on the user document. The security rules require
  `termsAcceptedAt == request.time`, so **consent cannot be backdated or
  forged by a client that skipped the checkbox**.
- `POLICY_VERSION` in `src/lib/db.js` is the version stamp. Bump it when the
  policies change materially; Account → Agreements then shows affected users
  that the terms have moved.

### Accessibility (WCAG 2.2 AA)
- **Contrast:** `text-zinc-600` measured 1.93–2.57:1 and `text-zinc-500`
  3.08–4.12:1 against the app's backgrounds, so both fail the 4.5:1 body-text
  minimum. Swept to `text-zinc-400` throughout; zero occurrences of either
  remain.
- **Focus:** there was no global focus-visible rule and only 25 of 141 buttons
  styled focus at all. Added a global `:focus-visible` outline in `index.css`
  (violet-300, 10.8:1 on zinc-950, 2px with 2px offset). Verified in-browser:
  **all 20 focusable controls on the sign-in page now show a visible keyboard
  focus indicator**, either that outline or their own violet ring (4.18:1,
  above the 3:1 minimum for UI components).
- **Alt text:** user media had `alt=""` everywhere. The composer now collects
  an optional description; `src/lib/a11y.js` decides the fallback: author text
  wins, else the on-screen caption carries the meaning and the image is marked
  decorative, else a plain attribution. Avatars keep `alt=""` deliberately,
  since the handle is always beside them.
- **Keyboard:** skip link to `#mesh-main` as the first tab stop; all targets
  at least 44px; `aria-live` on form errors; `prefers-reduced-motion` honoured.
- **Not yet done:** no automated axe run in CI, and the authenticated surfaces
  have not had the same in-browser focus sweep as the sign-in page. Worth doing
  before launch.

### Design-system additions (September 2026)
- **Fonts** (Inter, Plus Jakarta Sans) are OFL-1.1 licensed and **self-hosted**
  from the bundle, so no request goes to Google Fonts. Loading them from a font
  CDN would have contradicted the Cookies & Storage policy's "no third parties".
- **Icons** are Lucide (ISC licence), bundled.
- **Chat themes**: four of five failed contrast for white message text
  (2.4 to 4.1:1). All now clear 4.5:1.
- **Buttons**: hover states previously went lighter (white on violet-500 is
  4.2:1, a fail); they now go darker.
- **Input borders** clear the 3:1 non-text minimum, so fields are findable by
  their edge.
- **Recent searches** are kept on-device under `mesh:recent-searches`,
  disclosed in the Cookies & Storage policy, and clearable in Search.
- **AI labelling**: creators can tick "Made with AI" on photos and videos; News
  submissions require a server-stamped declaration of no AI-fabricated evidence.
- **Circle moderators** could previously press Remove on a post but the rules
  refused it. The rules now allow it for circle posts only.

### Circle and gathering privacy (September 2026)
Found while making circle limits real, all now fixed in `firestore.rules` and
attack-tested against the live rules (54 checks, all passing):
- **Private circles' posts were readable by anyone signed in**, because circle
  posts were stored as `public`. They're now `circle`, readable by members only,
  and their comments inherit the same restriction.
- **Anyone could join a private circle directly**, skipping approval: the app
  asked for approval, the server didn't. Self-joining now only works for open
  public circles.
- **Hidden guest lists weren't hidden** on the server, and "invite only"
  gatherings had no way to invite. Both fixed.
- **Account deletion left the profile document behind** (the rule was
  `delete: if false`), contrary to the Privacy Policy's "deleting your account
  removes your profile". Deletion now removes the profile, follow lists,
  private lists and thought.
- Posts made in private circles **before** this change are still stored as
  `public`. Move them or delete them if that matters.
- **Any member of a group chat could rewrite its member list**, adding or
  removing anyone. Now: add one reachable person at a time, remove only
  yourself unless you're an admin. (Attack-tested, with private accounts,
  follow requests, blocking and message and comment settings: 50 more checks,
  all passing.)
- **Stories could never be posted**: the rules rejected a field the app sent.
  Fixed, and private accounts' stories are followers-only.

### Claims and content
- No testimonials, no review counts, no user-number claims, no awards. Nothing
  fabricated to remove. Swept for all of these.
- Marketing copy on the sign-in page was rewritten to drop "fact-checked news".

---

## Deliberately not done

- **No "we are fully compliant" claim anywhere.** Mesh isn't, until the items
  above are closed by someone qualified to close them.
