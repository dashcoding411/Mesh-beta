# Mesh

A social app for photos, text posts, short and long video, communities,
events, sourced news and messaging. No ads and no third-party tracking.

React 19, Vite, Tailwind CSS, and Firebase (Auth, Firestore, Hosting, App
Check). There is no application server: the client talks to Firestore
directly and `firestore.rules` is the enforcement layer for every write and
read. Firestore runs in `australia-southeast1`.

## Getting started

Requires Node 20.19+.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm test` | Vitest (`npm run test:watch` to watch) |
| `npm run lint` | ESLint |
| `npm run build` | Production build to `dist/`, then prerenders the policy pages and `sitemap.xml` |
| `npm run check` | Lint, test and build; run before deploying |
| `node scripts/preview-prod.mjs` | Serves `dist/` on :4174 with the production headers (CSP etc.) |
| `node scripts/rules-slur-regex.mjs` | Regenerates the `hateFree()` patterns in `firestore.rules` |

CI (`.github/workflows/ci.yml`) runs lint, tests and build on push and PR.

## Configuration

Optional settings go in `.env.local` (git-ignored).

| Variable | Purpose |
| --- | --- |
| `VITE_ICE_SERVERS` | TURN relay for calls: the provider's ICE servers array as one-line JSON. Required for calls on mobile data (CGNAT). |
| `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | Alternative: static TURN credentials. |
| `VITE_TURN_API_URL` | Alternative: an endpoint returning ICE servers. Its host must be allowed in the CSP (`firebase.json`). |
| `VITE_GIPHY_API_KEY` | Enables GIFs. |
| `VITE_STORAGE=on` | Use Cloud Storage for uploads and enable video. Requires the Blaze plan and deployed `storage.rules`. |
| `VITE_MEDIA_API` | The Cloudflare media Worker's URL (see below). Enables video without Cloud Storage. |
| `VITE_APPLE_SIGNIN=on` | Show Apple sign-in once it's configured in Firebase. |
| `VITE_APPCHECK_DEBUG_TOKEN` | App Check debug token for local development. Keep it out of builds. |
| `VITE_APPCHECK_SITE_KEY`, `VITE_APPCHECK_PROVIDER` | Override the App Check key/provider in `src/firebase.js`. |

### Video on Cloudflare (free tier)

Until Cloud Storage is on, videos and their poster frames can go to a
Cloudflare Worker backed by R2 (`cloudflare/media`). R2's free tier is 10 GB
with no charge for viewing; the Worker free tier is 100,000 requests a day.
The Worker checks the uploader's Firebase ID token, stores files under their
uid, caps files at 100 MB and 60 per person, and lets only the owner delete.

1. Make a free Cloudflare account and turn on R2 in the dashboard (Cloudflare
   asks for a card; nothing is charged within the free tier).
2. `npx wrangler@4 login`
3. `npx wrangler@4 r2 bucket create mesh-media --location oc`
4. `npm run media:deploy`, and note the `https://mesh-media.<you>.workers.dev` URL.
5. Put that URL in `VITE_MEDIA_API` (`.env`, committed: it is not a secret), in `MEDIA_HOST` in
   `firestore.rules` (dots escaped as `[.]`), and in the CSP's `connect-src`,
   `img-src` and `media-src` in `firebase.json`. Then deploy rules and hosting.

Anyone with a video's link can watch it, as with Storage download URLs. Admins
removing a post doesn't remove the file from R2.

TURN credentials are embedded in the client bundle by design; scope them in
the provider's dashboard. Never put a provider's account secret key here.

## Project layout

```
src/
  App.jsx             shell, routing, route-level code splitting
  firebase.js         Firebase app, App Check, Auth, Firestore; lazy Storage
  components/         screens; larger ones have folders (chat, circle, news, post, shell)
    ui/               design-system primitives
  lib/
    db.js             data-layer entry point (re-exports lib/data/*)
    data/             Firestore access by domain
    algorithm.js      feed order and ranking
    moderation.js     content filter
    brick.js          brick mode policy engine (mirrors the rules)
    calls.js          WebRTC call sessions
    __tests__/        unit and contract tests
  legal/              policy documents as data
scripts/              build and maintenance scripts
firestore.rules       security rules
firestore.indexes.json
docs/architecture.md  design notes per subsystem
```

## Architecture

- **Rules are authoritative.** Every invariant the UI relies on (ownership,
  denormalised names and photos, counters, rate limits, visibility, brick mode
  locks) is enforced in `firestore.rules`. Client checks exist for UX only.
- **Contract tests** (`src/lib/__tests__/contracts.test.js`) fail when shared
  lists or shapes drift between the client and the rules.
- **List queries** must be provable by the rules statically, so post queries
  always constrain `visibility` or `authorId`.
- **Visitors** can browse public content without an account. The `guest()`
  branches in the rules define what they can read.
- **No backend** means some features are intentionally absent (push
  notifications, server-side search, ML moderation). See the limitations
  section in `docs/architecture.md`.

See [docs/architecture.md](docs/architecture.md) for the data model and each
subsystem.

## Deployment

```bash
npm run check
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project mesh-a293c
```

- Deploy rules and hosting together when both change; the rules validate what
  the client writes.
- New composite indexes take a few minutes to build. Deploy indexes before
  shipping a client that depends on them.
- Always pass `--project mesh-a293c`. The CLI's default project for this
  directory may point elsewhere.

The site's address is `https://joinmesh.social` (Firebase Hosting custom
domain; `mesh-a293c.web.app` still serves the same site). The canonical link,
share previews and sitemap use it (`index.html`, `scripts/prerender.mjs`,
`public/robots.txt`). In-app links use the address the visitor is on. The
domain must also be listed in Firebase Auth's authorized domains and on the
App Check reCAPTCHA key.

Cloud Storage requires the Blaze plan. Until it's enabled, photos are stored
inline in Firestore (`media/{id}`) and video uploads are disabled. After
enabling Blaze, deploy `storage.rules` and build with `VITE_STORAGE=on`.

## iPhone app

The app (`ios/`) is the same web app in a native shell, built with
[Capacitor](https://capacitorjs.com). It needs Xcode (Mac App Store), and an
Apple Developer Program membership to install on phones through TestFlight or
publish to the App Store.

```sh
npm run app:sync   # build the web app and copy it into the iOS project
npm run app:open   # open it in Xcode, then Run (simulator or a plugged-in iPhone)
npm run app:assets # re-render the icon and launch screen from scripts/app-icon.html
```

Run `app:sync` after every web change; the app ships its own copy of the web
code, so updates reach phones through the App Store, not by deploying Hosting.

App-specific behaviour lives in `src/lib/native.js` (status bar, launch
screen, haptics). Inside the app, App Check's reCAPTCHA can't run and Google,
Apple and phone sign-in need native sign-in, so the app offers email sign-in
until that's set up (Firebase iOS app, `GoogleService-Info.plist` and a native
auth plugin). The bundle ID is `com.meshsocial.app` (`capacitor.config.json`);
change it before the first App Store upload if you want a different one.

## Administration

Admins are documents in `admins/{uid}`, created in the Firebase console. Admins
get the moderation queue (Settings → Moderation), news review, and can add
news writers.

App Check tokens are sent on every request but enforcement is not yet enabled;
see `COMPLIANCE.md`.
