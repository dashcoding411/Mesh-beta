# Mesh — compliance state and risk register

Last reviewed 24 September 2026, against the code at this commit.

**This is an engineering document, not legal advice.** It was written by
reading the code, not by a lawyer, and it cannot tell you whether Mesh is
lawful. Every item marked **VERIFY** needs a solicitor admitted in Australia
before launch. The technical findings — what the code collects, stores and
exposes — are grounded in the source and can be checked line by line.

---

## Before you can launch

1. **Fill in `src/legal/business.js`.** Eight fields are still `TODO`. They
   render verbatim in every policy, and the Legal page shows a warning banner
   until they're set. A policy naming "TODO" as its operator is worse than no
   policy: under Australian Consumer Law s18, a consumer-facing trader has to
   be identifiable.
2. **Resolve the under-16 question below.** It is the largest single exposure.
3. **Have a lawyer read the four policies.** They are accurate to the code, but
   accuracy and sufficiency aren't the same thing.

---

## Risk register

### R1 — Under-16 accounts vs. the social media minimum age law · **HIGH** · VERIFY

Mesh currently **permits** under-16 accounts. `isMinor()` in `src/lib/db.js`
restricts them to followers-only posting, enforced server-side by `isAdult()`
in `firestore.rules`.

Australia's *Online Safety Amendment (Social Media Minimum Age) Act 2024*
requires age-restricted social media platforms to take reasonable steps to
prevent under-16s holding accounts. Two problems:

- Mesh may fall within the definition of an age-restricted platform. A service
  offering profiles, following, feeds and DMs is squarely the kind of thing the
  law was aimed at.
- Self-declared birth year is **not** age assurance. A restricted account is
  not the same as no account.

**Decide:** either block under-16 account creation outright and implement age
assurance, or obtain advice confirming Mesh is out of scope. The current
middle position — allowing under-16s with reduced permissions — is the one
option that is defensible under neither reading.

### R2 — Liability for user content · **HIGH** · VERIFY

Australia has no equivalent of the US Section 230. Following *Fairfax Media v
Voller* (2021), operators of a page can be treated as publishers of third-party
content posted to it. Defamation exposure on a social platform is real and is
not removed by a terms-of-service clause.

Mesh's mitigations as built: report flow on every post (`PostCard.jsx`),
admin-only report queue, automated hate-speech and spam filtering, circle-level
moderation. What's missing is a documented, time-bound takedown process with a
human behind it. **Get advice on the innocent dissemination defence and the
serious-harm threshold, and write down your takedown SLA before launch.**

### R3 — Copyright, with no platform safe harbour · **MEDIUM-HIGH** · VERIFY

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
removed — it was a third party's mark standing in as the site's identity. The
Google and Apple marks in `AuthPage.jsx` are used only on their own sign-in
buttons; **check they still match Google's and Apple's current branding
guidelines**, which are conditions of using those sign-in services.

### R4 — Media stored outside Australia · **MEDIUM**

Firestore is in `australia-southeast1` (Sydney). The default Cloud Storage
bucket is **not** — uploaded photos and video go to the US. That is a
cross-border disclosure under Australian Privacy Principle 8, and the Privacy
Policy discloses it honestly.

**Fix properly:** when you enable the Blaze plan (Storage is off entirely right
now), create the bucket in `australia-southeast1` and update the policy. Do it
before there is any user media to migrate.

### R5 — Birth year is readable by every signed-in user · **MEDIUM**

`firestore.rules` allows `read: if signedIn()` on `/users/{uid}`, and the
document contains `birthYear`. Nothing in the UI displays another user's birth
year, but anyone signed in can read it directly from Firestore. The signup form
tells people it is used "only to apply age protections", which does not match
being world-readable.

**Fix:** move `birthYear` into `users/{uid}/private/details`, readable only by
the owner, and change `isAdult()` in the rules to read that path. Contact
details were already removed from this document for the same reason (below);
birth year is the remaining item, left for you to decide because it changes how
`isMinor()` loads.

### R6 — Notifiable data breaches · **MEDIUM**

The Privacy Policy commits to notifying affected users and the OAIC for
breaches likely to cause serious harm, as the NDB scheme requires. **That is a
promise with no plan behind it yet.** Write a one-page response plan: who
assesses, within what window, and how you contact users. You need it before an
incident, not during one.

### R7 — Moderation claims · **LOW, now mitigated**

Previously the sign-in page claimed hate speech was filtered "no exceptions"
and the news page claimed everything was "fact-checked before publication".
Both were representations Mesh could not support — automated filtering is a
word list with normalisation, and news review is one person checking a
submission against the sources given.

Both have been rewritten to describe what actually happens. **Keep them that
way.** Overstating safety is a misleading-conduct risk under ACL s18 and is
also how platforms end up in front of regulators.

### R8 — No App Check · **LOW-MEDIUM**

The Firebase config is client-side, which is normal and not a secret. But
without Firebase App Check, anyone can call your Firestore and Auth endpoints
directly with that config. The security rules hold — they were probed — but
quota abuse and automated signup are open. **Enable App Check before launch.**

---

## What the audit found, and what changed

### Tracking and third parties
- **Analytics: none.** No Google Analytics, no Meta pixel, no Segment, no
  Sentry, no telemetry of any kind.
- **Third-party scripts in `index.html`: none.**
- **The only third party reached at runtime is Google reCAPTCHA**, loaded
  lazily by the Firebase SDK and *only* when someone requests an SMS code
  (`AuthPage.jsx`). Email and Google sign-in never load it.
- **Embeds: none.** No YouTube, no Twitter, no iframes.

### Storage in the browser
- Firebase Auth session token (session-only unless "Keep me signed in").
- `mesh:` keys in `localStorage` for posting cooldown and duplicate detection
  (`src/lib/moderation.js`), plus one key for dismissing the storage notice.
- Nothing else. **Conclusion: a blocking consent banner is not required**,
  because there is no non-essential storage to consent to. Disclosure is
  required, and `StorageNotice.jsx` provides it without a fake choice. If
  analytics are ever added, that component has to become a real opt-in.

### Data minimisation — one real finding, fixed
Email address and phone number were being copied into `/users/{uid}`, which
**every signed-in user can read**. They were redundant: Firebase Auth already
holds both, readable only by the account owner, and `AccountPage.jsx` was
already reading them from there.

Both fields are now removed from the document and **rejected by the security
rules**, so a future change can't quietly reintroduce them.

> **Migration required:** existing user documents created before this change
> still contain `email` and `phone`. Strip them with a one-off admin script
> before launch — the rules stop new writes, not old data.

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
  3.08–4.12:1 against the app's backgrounds — both fail the 4.5:1 body-text
  minimum. Swept to `text-zinc-400` throughout; zero occurrences of either
  remain.
- **Focus:** there was no global focus-visible rule and only 25 of 141 buttons
  styled focus at all. Added a global `:focus-visible` outline in `index.css`
  (violet-300, 10.8:1 on zinc-950, 2px with 2px offset). Verified in-browser:
  **all 20 focusable controls on the sign-in page now show a visible keyboard
  focus indicator**, either that outline or their own violet ring (4.18:1,
  above the 3:1 minimum for UI components).
- **Alt text:** user media had `alt=""` everywhere. The composer now collects
  an optional description; `src/lib/a11y.js` decides the fallback — author text
  wins, else the on-screen caption carries the meaning and the image is marked
  decorative, else a plain attribution. Avatars keep `alt=""` deliberately,
  since the handle is always beside them.
- **Keyboard:** skip link to `#mesh-main` as the first tab stop; all targets
  at least 44px; `aria-live` on form errors; `prefers-reduced-motion` honoured.
- **Not yet done:** no automated axe run in CI, and the authenticated surfaces
  have not had the same in-browser focus sweep as the sign-in page. Worth doing
  before launch.

### Claims and content
- No testimonials, no review counts, no user-number claims, no awards — nothing
  fabricated to remove. Swept for all of these.
- Marketing copy on the sign-in page was rewritten to drop "fact-checked news".

---

## Deliberately not done

- **No cookie consent banner.** There is nothing non-essential to consent to.
  Adding one would be theatre, and it trains people to dismiss the banners that
  carry a real choice.
- **No "we are fully compliant" claim anywhere.** Mesh isn't, until the items
  above are closed by someone qualified to close them.
