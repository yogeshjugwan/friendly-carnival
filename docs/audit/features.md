# randomCall — feature QA audit

Date: 2026-10-16 · Scope: audit only (no app code changed) · Tested against the **working tree** of
`main` (39a670d) **plus uncommitted edits** that other sessions were making at the same time
(22 modified files, e.g. `app.ts`, `guard.ts`, `limits.ts`, `useRandomCall.ts`). Results describe that tree.

## How it was tested

| Gate | Result |
|---|---|
| `cd apps/server && pnpm test` | ✅ 124 tests, 124 pass, 0 fail (≈96 s) |
| `pnpm typecheck` (shared, server, web) | ✅ all Done, exit 0 |
| `cd apps/web && npx next build` | ✅ compiled, 52 static pages, exit 0 (`.next` deleted afterwards) |
| Local server E2E | `GUARD_POW=off`, in-memory store (no `DATABASE_URL`), local `ADMIN_TOKEN` test value, `FREE_DAILY_MATCHES=6`, `FREE_CALL_HOURS=0.004` (≈14 s), `FREE_BREAK_HOURS=0.01`, `REWARD_AD_MS=1000`. Port 4237 (4199 was already taken by another process). A second server with PoW **on** (port 4238) was used for the Shield checks. |
| Scripts | `/tmp/rc_qa/qa.mjs`, `qa2.mjs`, `pow.mjs`, `pow2.mjs` (socket.io-client + fetch). Accounts: `/auth/signup` with `@example.test` emails and DOB 1995-05-05; email confirmed with the token printed in the server log. Coins / Plus granted via `/admin/coins` and `/admin/plus`. |
| Production | Not touched. |

## Feature status

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | `/health` | ✅ | `{"ok":true,"online":0,"waiting":0,…,"turnConfigured":false,"persistentStore":false}` |
| 2 | Match video queue | ✅ | both got `match:found`, mode video, one initiator, names exchanged, shared interest `music` |
| 3 | Match voice queue | ✅ | `match:found` mode voice |
| 4 | Match text queue | ✅ | `match:found` mode text |
| 5 | WebRTC signalling (offer/answer/ICE) | ✅ | `signal` `{kind:'offer'}` and `{kind:'ice'}` forwarded |
| 6 | Socket.IO video relay fallback | ✅ | `relay:start` and `relay:chunk` (ArrayBuffer) forwarded to partner |
| 7 | `call:result` diagnostics → `/health` | ✅ | `calls.reports=1, connectRate=1, avgConnectMs=1200` |
| 8 | Text chat | ✅ | `chat:message` delivered `{text,at}` |
| 9 | Typing indicator | ✅ | `chat:typing true` forwarded |
| 10 | Link / social-handle filter | ✅ | `chat:rejected 'link'` |
| 11 | Spam filter (same text ×3) | ✅ | `chat:rejected 'spam'` |
| 12 | Chat rate limit | ✅ | 15 quick messages → `chat:rejected 'rate-limited'` |
| 13 | Reactions | ✅ | 💖 forwarded |
| 14 | Icebreaker | ✅ | same question to both sides |
| 15 | Games: tic-tac-toe / truth-or-dare / would-you-rather | ✅ | `game:state` for start, move (board updated), end (`null`); tod + wyr start |
| 16 | Next | ✅ | partner gets `partner:left 'next'` |
| 17 | Back (reconnect previous partner) | ✅ | `match:found` with `reconnected:true` |
| 18 | Stop | ✅ | partner gets `partner:left 'stop'` |
| 19 | Report | ✅ | `report:received`; invalid reason → `report:rejected 'invalid'`; reports listed in `/admin/reports` |
| 20 | Block / blocked list / unblock | ✅ | `user:blocked`; `blocks:list` 1 entry; blocked pair not re-matched over 11 s; `blocks:remove` → true |
| 21 | Filters require Plus | ✅ | guest join with gender filter → `plus:required`; Plus user → no `plus:required` |
| 22 | Online list / call from list (Plus) | ✅ | guest `users:list` → `null`, `users:call` → `plus-required`; Plus user gets an array |
| 23 | Daily match limit | ✅ | exactly 6 matches then `limit:reached` (`remaining:0`) |
| 24 | Rewarded ad → +matches | ✅ | `limit:ad-start` / `ad-done` → `limit:granted` limit 6→16, adsLeft 5→4 |
| 25 | Buy matches with coins | ✅ | guest → `reason:'login'`; account → `ok`, coins debited |
| 26 | Free call-time limit + break | ✅ | voice call ended after 14.7 s with `limit:reached` (`breakUntil` set); rejoin blocked during break; text chat still matches during break |
| 27 | Signup (DOB required, 18+) | ✅ | 201 with token; no DOB → 400; 2012 DOB → 403 |
| 28 | Login / `/auth/me` / `/auth/check` | ✅ | 200 / 200 / `{exists:true}` (see bug 4: web never calls `/auth/check`) |
| 29 | Email confirmation | ✅ | token from log → `/auth/verify` 200 for both accounts |
| 30 | Settings save (`/auth/settings`) | ✅ | 200 with `{settings:{gender,allowReconnect,hideCountry,interests,…}}` |
| 31 | Daily streak reward | ✅ | before a chat `needsChat:true`; after a chat claim → 200, +10 coins, streak 1 |
| 32 | Referral code | ✅ | `{code:'svnqwrac',invited:0}` |
| 33 | Free Plus trial | ✅ | verified account → 200 |
| 34 | Wallet push on login | ✅ | `wallet {coins:0}` on connect |
| 35 | Gifts | ✅ | without coins → `reason:'coins'`; with 200 coins: rose (10) → sender 190, receiver `earned:5`, receiver wallet 5 |
| 36 | Boost | ✅ | `ok`, `boostUntil` +30 min, 100 coins |
| 37 | Priority match | ✅ | `ok`, 25 coins debited while waiting |
| 38 | Friends (mutual ❤️), list, rename, remove | ✅ | `requested`/`they-requested` → `friends`; list shows 1; rename / remove → true; guest → `login-required` |
| 39 | Friend call | ✅ | `friends:call` → `call:incoming` → `users:answer` → `match:found` |
| 40 | DMs: send, live delivery, threads, history, read receipt | ✅ | `dm:new` live, thread unread 1, history 1 msg, `dm:read` to sender |
| 41 | History + follow + remove | ✅ | `history:list` shows partner; follow reflected; remove → true |
| 42 | Group rooms | ✅ | `rooms:list`; guest join → `login-required`; 2 accounts same room; `room:member-joined`, `room:chat`, `room:signal`, `room:member-left` all work (see bug 1 for the PoW race) |
| 43 | Shield: proof of work | ✅ | PoW server: `guard:challenge` bits 16; 0 matches before proof, 2 after solving |
| 44 | Shield: event flood kick | ✅ | 400 `chat:typing` → `guard:slow-down` + disconnect; IP then blocked ~60 s (new connects time out, as designed) |
| 45 | Shield: auth rate limit | ✅ | 11 of 25 `/auth/check` → 429 (20 per 10 min) |
| 46 | Shield: skip brake | ✅ | after 42 fast matches/skips → `guard:slow-down {reason:'skipping',retryAfterMs:~27s}` |
| 47 | Live translation (`/translate`) | ✅ | `hola` → `hello` (MyMemory fallback, external call) |
| 48 | Billing without keys | ✅ | `/billing/plans` `{enabled:false}`; checkout → 503 "Payments are not set up yet" |
| 49 | Trust score / shadow pool | ⏭ | not observable end-to-end here: every test client shares one IP, and reporters count one per network (by design), so only 1 reporter ever counts. Covered by `trust.test.ts` (passes). |
| 50 | Stripe / Razorpay checkout, webhooks | ⏭ | no keys locally (unit tests pass: `plus.test.ts`, `razorpay.test.ts`) |
| 51 | Google sign-in, real emails (Resend), Web Push, AdSense / rewarded GAM | ⏭ | need external keys / a browser |
| 52 | WebRTC media, nsfwjs, face / camera check, background effects, masks | ⏭ | browser-only; not run headless |
| 53 | Web build / routes | ✅ | every internal `href` (`/`, `/chat/*`, `/coins`, `/forgot`, `/get-verified`, `/guidelines`, `/help`, `/history`, `/invite`, `/login`, `/messages`, `/plus`, `/privacy`, `/settings`, `/signup`, `/terms`, `/rooms`) has a built route |
| 54 | Client ↔ server event names | ✅ | every event the web emits has a server handler (`useRandomCall.ts`, `useRoom.ts`, pages), incl. `limit:buy` / `match:priority` / `boost:buy` via `ask()`. Server events the web ignores: `queue:waiting`, `ban:appealed` (harmless; `banned` carries the same state). Every web HTTP path exists on the server (`/auth/providers` is in `google.ts`). |

## Bugs (prioritised)

### 1. Medium — Rooms, Online list and friend calls hang if used before the PoW proof is accepted
Events in `HUMAN_ONLY` that are not `queue:join` are **silently dropped** before the proof
(`apps/server/src/app.ts:854`); only `queue:join` is queued. Acknowledged events (`room:join`, `users:list`,
`users:call`, `friends:call`) therefore never get their ack. `useRoom.ts:150-154` waits 15 s, then shows
"Could not join — try again." A challenge is issued on every (re)connect, and IPs with many connections get
harder challenges, so this is reachable after a network blip or on shared IPs.
- Repro (verified): server with PoW on → sign up → connect a socket → immediately emit
  `room:join('music','video','male', ack)` → no ack within 4 s (`TIMEOUT (no ack)`).
- Fix idea: for acked events, call the ack with `{ok:false, reason:'verifying'}` (or queue them like
  `queue:join`); or have the client await the proof before emitting.

### 2. Low — Links in group-room chat vanish with no feedback
`room:chat` with a link gets `chat:rejected 'link'` (`apps/server/src/app.ts:1141-1146`), but
`apps/web/src/lib/useRoom.ts:111-114` only listens to `room:member-joined/left`, `room:signal`, `room:chat`.
The sender's message just disappears.
- Repro: join a room with two accounts, send `see insta.gram/x` → nothing shown to anyone, no error.

### 3. Low — `queue:waiting` is emitted but never used by the web client
`apps/server/src/app.ts:900,926` emits it; there is no listener in `apps/web/src`. Not a user-facing bug
today (the client sets "matching" locally), but it's dead protocol. Remove it or use it.

### 4. Docs — CLAUDE.md is stale about the login page
CLAUDE.md §4 and §9 say `/login` asks for the email first and calls `POST /auth/check`. The current
`apps/web/src/app/login/page.tsx:33` uses Log in / Sign up tabs and calls `/auth/login` or `/auth/signup`
directly. `POST /auth/check` (`apps/server/src/auth.ts:155`) is now unused by the web (and is an
account-enumeration endpoint, though rate-limited).

### Notes (not bugs)
- Event flood kick also blocks the whole IP for 60 s (`guard.block(ipKey, 60_000)`), so other people
  behind the same NAT (e.g. a college Wi-Fi) are briefly locked out by one abusive client. By design, but worth knowing.
- `rooms:list` returns `{}` when no room is open (the page should handle it as "0 people").
- TURN is not configured, so cross-network calls can still fail (known owner to-do).
