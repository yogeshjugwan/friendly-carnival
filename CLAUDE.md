# randomCall — full project context

Read this first. It is the hand-off for any new Claude session (or a new Claude
account) working on this repo, so it can continue without the old chat history.
**This repo is public: never put secrets, tokens, passwords or keys in this file
or anywhere in git.**

---

## 1. What it is

randomCall is a web-only random video chat site (a Chatrandom / Omegle-style
clone): press Start, get matched with a stranger for a video, voice or text
chat, press Next for someone new. Built from 2026-10-01 onwards as the owner's
side project.

- **Live web app:** https://call-random-call.vercel.app (Vercel)
- **Live server:** https://random-call-server-xbbw.onrender.com (Render, free plan, Singapore). Health: `/health`
- **GitHub:** https://github.com/yogeshjugwan/friendly-carnival (public)
- **Design source of truth:** the Claude Design canvas "randomCall — Instant Entry"
  https://claude.ai/artifact/K2HUdqeSyfWPbmsBt7wrAa (home, call, matching, coins, invite,
  history & messages, settings, plus, edit profile, message thread; desktop + phone).
  The app follows this canvas; when the owner says "create same UI" they mean match it.

## 2. How the owner works (follow this)

- **Local clone:** `~/Documents/GitHub/friendly-carnival` (GitHub Desktop clone). Work and commit here.
- **Pushing:** the owner pushes with **GitHub Desktop**. Terminal `git push` gets 403. Claude commits; the owner
  pushes, then says "pushed, check live site" → check `gh api 'repos/yogeshjugwan/friendly-carnival/commits?per_page=5'`,
  wait for Vercel + Render deploys, then verify the live site.
- **One commit per feature/fix**, clear message. End commit messages with the Co-Authored-By line the
  session's instructions give.
- **Env vars / secrets:** the owner adds them in the Render and Vercel dashboards themselves. Never type
  credentials into live sites, never paste secrets into chat. Render env saves have silently failed before —
  ask the owner to confirm the key exists after saving.
- **Live-site testing:** don't tick the 18+ / Terms box, create accounts or log in with passwords on the live
  site without the owner's OK. Test on localhost instead (local test values only).
- **Work accounts:** never use Yes Madam work accounts/credits (e.g. the connected Figma account
  product.design@yesmadam.com) for this project. Personal accounts only.
- The owner writes short messages, often with a screenshot ("spacing", "ui issu check", "why this is not
  working"). Look at the screenshot carefully, find the real cause, fix, verify, commit.

## 3. Repo layout (pnpm monorepo, Node ≥ 22)

```
apps/web        Next.js 15 (App Router) + React 19 + Tailwind v4   → Vercel
apps/server     Node + Socket.IO + plain HTTP routes (tsx, no build) → Render
packages/shared Types, constants and pure helpers shared by both (@rc/shared)
render.yaml     Render blueprint (server env var names, health check)
docs/play-store.md  Guide for wrapping the PWA as an Android app (TWA)
test-accounts.local.md  (git-ignored) local test accounts
```

### Commands

```bash
pnpm install
pnpm dev                 # web :3000 + server :4100 together
pnpm dev:web / dev:server
pnpm typecheck           # all packages
cd apps/server && pnpm test      # node:test, ~124 tests, pg-mem for Postgres
cd apps/server && pnpm loadtest  # matchmaking load test
```

- `apps/web` dev/build first run `scripts/extract-nsfw-model.cjs` (copies the nsfwjs model into
  `public/models/nsfw/`, git-ignored — bundling it broke the minifier).
- There is no ESLint config; `npx tsc --noEmit -p .` is the check. Don't run Prettier over whole files
  (it reformatted ChatScreen once); match the existing style by hand.
- Web talks to the server at `NEXT_PUBLIC_SIGNALING_URL` (default `http://localhost:4100`).

## 4. Architecture

- **Matching:** `apps/server/src/matchmaker.ts`. In-memory queue per mode (video / voice / text). Filters
  (gender, country, verified-only — Plus), topic rooms, interests scoring, Boost, Priority (verified partner,
  paid), recent-partner avoidance (last 5) with an 8 s relax in `sweep()` (runs every 2 s) so a small pool
  still matches. Low-trust users go to a hidden **shadow pool** (only matched with each other).
- **Calls:** WebRTC P2P, Socket.IO for signalling. STUN only by default; **TURN is not configured on live**
  (`turnConfigured:false`) so some cross-network calls (e.g. phone on mobile data) fail. Fallback: Socket.IO
  video relay (MediaRecorder 250 ms chunks → MSE) after 15 s of failed WebRTC; `?relay=1` forces it.
  TURN providers supported: Cloudflare (`CF_TURN_*`), Metered (`METERED_*`) or static `TURN_*`.
- **Rooms:** group video rooms up to 4 (mesh), `rooms.ts`, page `/rooms`.
- **Store:** `AccountStore` / `SafetyStore` interfaces; Postgres (Neon) when `DATABASE_URL` is set, otherwise
  in memory. Tests use pg-mem — catch unique violations instead of relying on `ON CONFLICT`.
- **Shield (`guard.ts`):** proof of work before matching (sha256 leading-zero bits, HMAC-signed challenge,
  solved in a Web Worker on the client; harder for IPs opening many connections), per-event token buckets,
  connection caps, skip brake, call-request cooldowns, link/social-handle filter for chats with strangers.
  `GUARD_POW=off` disables PoW (load tests).
- **Trust (`trust.ts`):** score 0–100, `LOW_TRUST = 25`. −12 per distinct reporter in 7 days (reporters are
  counted **one per network**; reports from the target's own network and dismissed reports don't count),
  −30 if ≥ 80 % of 15+ recent **distinct** partners skipped them within 5 s. Logged-in +5, verified +25,
  account > 7 days +10.
- **Safety:** report / block / hide, on-device nsfwjs screening (auto-report "ai"), face check (MediaPipe) and
  camera quality check (black / covered / blurry) before video, new-user protection (new accounts' video
  starts blurred), auto-ban rules (3 reporters in 24 h, AI flags), appeals, admin dashboard `/admin`
  (`ADMIN_TOKEN`). 18+ only; date of birth required at signup; age-review holds.
- **Accounts (`auth.ts`, `accounts.ts`):** email + password (scrypt, hashed tokens), Google sign-in, email
  confirm / reset via Resend (prints to log without a key). **One login page**: `/login` (and `/signup`, same
  page) asks for the email, `POST /auth/check` says if it exists → password, else signup fields.
- **Limits (`limits.ts`):** free users get 50 matches/day + 5 rewarded ads × 10 matches; free video/voice
  call time is **5 h, then a 1 h break, then 5 h again** (calls past the limit are ended; text chat and
  Plus are unlimited). Env: `FREE_DAILY_MATCHES`, `FREE_CALL_HOURS`, `FREE_BREAK_HOURS`, `REWARD_*`.
- **Money:** Plus subscription via Stripe (weekly / monthly / 6 months; filters, Online list, no ads,
  unlimited); coins (packs via Stripe, Razorpay UPI when its env is set), gifts in calls (receiver gets half),
  Boost, Priority match, daily streak rewards, free trial, referrals (`/invite`, `/r/<code>`: both get a free
  Plus day, coins if already Plus). Ads: house ads + AdSense env (AdSense account is deactivated — owner must
  reactivate), rewarded video via Google Ad Manager env.
- **Social:** friends (mutual ❤️), friend calls, DMs (`/messages`), history + follow (`/history`), Online list
  (Plus), push notifications (Web Push, VAPID keys auto-generated into the `app_secrets` table), win-back
  emails (needs `RESEND_API_KEY`).
- **Other:** mini-games (server-held state, `games.ts`), reactions, icebreakers, live chat translation
  (`translate.ts`: Google key or MyMemory fallback), 6-language UI (`apps/web/src/lib/i18n.tsx`: en, hi, es,
  pt, fr, id), country SEO pages `/chat/<country>`, sitemap/robots, PWA (installable), analytics (daily_stats,
  IST days, `/admin` Analytics tab).

## 5. Web app map (`apps/web/src`)

- `app/page.tsx` → `components/RandomCall.tsx`: home (`Landing.tsx`) until you start, then the call
  (`ChatScreen.tsx`). The hook `lib/useRandomCall.ts` holds all call state and socket handling.
- Call UI: `ChatScreen.tsx` (layout, top pills, matching stage, side panels), `CallControls.tsx`
  (controls bar / phone rail, `StopNext`, `CancelButton`), `MoreMenu.tsx` (⋮: view, effects, games, boost,
  report, blocked, settings), `SafetyMenu.tsx`, `DraggablePip.tsx`, `Friends.tsx`, `OnlineUsers.tsx`,
  `Coins.tsx` (gift button/menu, gift animation), `Games.tsx`, `FilterBar.tsx`, `LimitModal.tsx`
  (no matches left / call-time break countdown).
- Shared chrome: `SiteHeader.tsx` (`Brand`, `SiteHeader` with `home` prop, `AccountMenu`, `SiteFooter` with the
  phone tab bar Chat · History · Coins · Invite · Me, `AuthCard`).
- Pages: `coins`, `plus`, `history`, `messages` (+ `components/WaThread.tsx`), `settings`
  (+ `ProfileEditor.tsx`, `BlockedList.tsx`), `invite`, `login` (= `signup`), `forgot`, `reset`, `verify`,
  `get-verified`, `rooms`, `admin`, `chat/[country]`, `r/[code]`, `unsubscribe`, legal pages.

## 6. Design system (Instant Entry canvas)

- Fonts: **Space Grotesk** (`font-display`: headings, big numbers, primary buttons) + **DM Sans** (body),
  via `next/font` variables `--font-space` / `--font-dmsans`.
- Tailwind v4 tokens in `app/globals.css` `@theme`: `night #07080B` (page), `card #12141A`, `card-2 #1A1D24`,
  `line #23262E`, `line-2 #2A2E37`, `divider #1E2128`, `tabbar #0E1015`, `lime #C6F24E` (`lime-hover #E4FF8F`),
  `gold #F2C94C`, `gold-bg #1A1608`, `mute #A9AEB8`, `dim #7D828C`, `faint #5E636D`, `stop #3A1E1E` /
  `stop-text #FF8A80`.
- Home: one big lime "Start video chat" (pulsing ring) over a drifting wall of animated cartoon people
  (sway / talk / blink / wave; `rc-*` keyframes in globals.css). Photos can replace them: list files in
  `apps/web/public/faces/index.json`. 18+ box remembered in localStorage. Preferences (gender, name,
  interests, topic) in a sheet.
- Call: full-bleed video; top-left pills (name · country, timer); top-right Report, Safety, Friends,
  Online, Get Plus, account; bottom-left controls (mic, camera, chat, add friend, gift, reactions, ⋮);
  bottom-right dark-red Stop + lime "Next →" (Space key). Phones: controls as a right-edge rail,
  full-width Stop / Next, self-view top-right.
- Matching: you in the centre circle (your camera), people orbiting, ripples, "Finding someone…",
  priority-match gold button, mic / camera + Cancel.
- Inner pages: cards `bg-card border-line rounded-[20px]` (18 on phones), header pills, phones use a 26px
  page title + bottom tab bar (no top header).

## 7. Environment variables (names only — values live in the dashboards)

**Render (server):** `WEB_ORIGIN`, `WEB_URL`, `SERVER_URL`/`RENDER_EXTERNAL_URL`, `DATABASE_URL` (Neon,
project "random-call", Singapore — set), `ADMIN_TOKEN`, `IP_SALT` (blueprint-generated), `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` (set; Google Cloud project "randomCall"), `RESEND_API_KEY`, `MAIL_FROM`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_WEEK|MONTH|HALFYEAR` (set — billing live),
`RAZORPAY_KEY_ID|KEY_SECRET|WEBHOOK_SECRET`, TURN (`CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` or `METERED_DOMAIN`,
`METERED_API_KEY` or `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`), `STUN_URLS`, `GOOGLE_TRANSLATE_KEY`,
`MYMEMORY_EMAIL`, `FREE_DAILY_MATCHES`, `FREE_CALL_HOURS`, `FREE_BREAK_HOURS`, `REWARD_AD_MATCHES`,
`REWARD_ADS_PER_DAY`, `REWARD_AD_MS`, `WINBACK_EMAILS`, `GUARD_POW`, `STATS_UTC_OFFSET_MIN`,
`VAPID_PUBLIC_KEY|PRIVATE_KEY` (optional; auto-generated otherwise).

**Vercel (web):** `NEXT_PUBLIC_SIGNALING_URL` (the Render URL), `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_BREAK|SIDEBAR`,
`NEXT_PUBLIC_AD_BREAK_MS`, `NEXT_PUBLIC_GAM_REWARDED_UNIT`, `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256`.

Local: copy `apps/server/.env.example` → `apps/server/.env` (git-ignored). Billing, Google, email and TURN
stay off locally unless you add keys (e.g. the Plus page shows "Payments are being set up" locally).

## 8. Testing tips and gotchas

- **Two users on one machine:** the in-app browser pane as user A + Chrome on localhost as user B, or two
  Chrome tabs (they share localStorage, so they share the device id — fine for matching).
- **Fake camera:** override `navigator.mediaDevices.getUserMedia` with a canvas `captureStream`. The face
  check needs a real face: load a face photo with `fetch` + `createImageBitmap` (Image.decode with
  crossOrigin hangs in the pane). Voice mode needs only a fake audio track.
- Headless live checks: a Node `socket.io-client` script must solve the `guard:challenge` PoW (sha256 of
  `challenge:nonce`, leading zero bits ≥ bits) before `queue:join`.
- New Chrome's `scrollIntoView` returns a Promise — never return it from `useEffect` (crashed React with
  "destroy is not a function"); write `{ void el.scrollIntoView(...) }`.
- Tailwind v4 `translate-*` utilities use the CSS `translate` property, which stacks with keyframe
  `transform` — don't combine them on an animated element.
- `mock.timers` breaks socket.io in tests; use app options (e.g. `priorityWaitMs`) instead.
- The in-app browser pane can't register service workers; test PWA/push in Chrome.
- `/health` shows online/waiting counts and recent call results (`calls.recent`) — use it to tell
  "never matched" (waiting stays 0) from "matched but WebRTC failed".
- Low-trust/shadow-pool symptoms: two devices both waiting but never matching each other. Old reports from
  before the per-network fix count per device for 7 days — dismiss them in `/admin` → Reports.

## 9. Status (as of 2026-10-15)

Everything below is built and committed; the owner pushes from GitHub Desktop.

- Done recently: same-device/incognito matching fixes (per-partner skips, per-network reporters), Google
  sign-in Back button fix, 5 h / 1 h free call time + 50 matches/day, full Instant Entry redesign (home,
  call, matching, header, tab bar, coins, plus, history, messages, settings, invite), one combined
  login/signup page with `POST /auth/check`, Plus page "Log in to subscribe" for guests, render.yaml
  limits updated (50 / 5 h / 1 h).
- **Open items / owner to-dos:**
  - TURN credentials (Cloudflare or Metered) → fixes calls across networks.
  - `RESEND_API_KEY` + verified `MAIL_FROM` domain (confirm emails, win-back).
  - Razorpay keys (UPI), Google Translate key (optional), AdSense reactivation, Ad Manager rewarded unit.
  - Check Render's `FREE_DAILY_MATCHES` (an old dashboard value of 30 would override 50).
  - Realistic face photos for the home wall (owner's own images or own account's AI credits only).
  - Lawyer review of the legal pages (templates).
  - After each push: open every page on the live site at desktop and phone width and fix what looks off.
- Ideas not built: Redis matchmaker for multiple server instances, native mobile app (see
  docs/play-store.md for the TWA route).
