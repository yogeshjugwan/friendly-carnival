# randomCall code-quality audit (2026-10-16)

Review only, no code changed. Gates: `pnpm typecheck` passes (server + web); `apps/server pnpm test` 124/124 pass (~16 s).

## Scorecard

| Area | Backend | Frontend |
|---|---|---|
| Correctness / races | B | B- (not exhaustively traced) |
| Security | B- | B+ |
| Architecture / maintainability | C (god files) | C |
| Performance | B- | B+ (ML libs lazy-loaded) |
| Tests | B (124 integration/unit) | F (zero tests) |
| Accessibility | n/a | C+ (spot-checked) |

What is good: Stripe webhook uses `constructEvent` on raw body (billing.ts:182); Razorpay HMAC compared constant-time (razorpay.ts:63-71); amount checked against price list and idempotent `recordPayment` (razorpay.ts:85-88); order ownership check on client verify (billing-http.ts:134); body size cap 16 KB (http.ts:3); exact-origin CORS allowlist (http.ts:5-21); parameterised SQL throughout; per-socket chat burst + duplicate filter (app.ts:1574-1592); ad reward requires server-timed watch (limits.ts:151-161); tfjs/nsfwjs/mediapipe are all dynamic `import()` (nsfw.ts:14, faceMask.ts:54, faceCheck.ts:18, backgroundEffect.ts:36). The three `dangerouslySetInnerHTML` uses are a static inline script (layout.tsx:66) and JSON-LD from static data (page.tsx:27, chat/[country]/page.tsx:106) - safe today.

## P0 - security / correctness

1. **Spoofable client IP** - safety.ts:45 takes `cf-connecting-ip` or the *leftmost* `x-forwarded-for`. Both are client-controlled on Render (no Cloudflare in front). Every IP-keyed control (IP bans, connect throttles in guard.ts:70, RateLimiter keys, admin login failures admin.ts:28, limits for anonymous users) can be bypassed by sending a random header per request. Fix: trust only the proxy-appended entry (rightmost / Nth-from-right per `TRUST_PROXY_HOPS`), and ignore `cf-connecting-ip` unless a `BEHIND_CLOUDFLARE` flag is set.
2. **Payment recorded before credit, not in one transaction** - razorpay.ts:88-99: `recordPayment` inserts the ref, then `changeCoins`/`setPlus` run separately. If the second call throws, the webhook returns 500, Razorpay retries, `recordPayment` now returns false, and the user is never credited (paid, nothing delivered). Same shape likely in `applyBillingEvent`. Fix: wrap insert + credit in one DB transaction (`BEGIN ... COMMIT`), or record the payment *after* the credit using the coin ledger's unique `ref` (accounts.ts:878) as the idempotency key.
3. **Gift receiver credit is not idempotent / not atomic with the spend** - app.ts:963-970: sender is debited, then the receiver credit can fail and the catch replies `invalid` although coins were already taken. Fix: single transaction transferring coins, or a ledger ref `gift:<uuid>` for both legs and refund on failure.

## P1

4. **ConsoleMailer in production** - index.ts:8 falls back to `ConsoleMailer` when `RESEND_API_KEY` is missing; mailer.ts:17 logs recipient email plus full body (magic/reset links) to Render logs = PII + account-takeover tokens in logs. Fix: refuse to start (or disable email auth) when `NODE_ENV=production` and no mailer key; never log `mail.text` outside dev.
5. **No rate limits on room events** - `room:chat` (app.ts:1115) and `room:signal` (app.ts:1109) have no burst limit, unlike `chat:message`; one client can fan out spam to every seat. Fix: reuse the `sentAt`/CHAT_BURST limiter and a signal budget per socket.
6. **Auth token in localStorage** - web/src/lib/auth.tsx:64-72. Any XSS = full token theft. Acceptable for now given no unsafe HTML, but add a strict CSP (script-src self + hashes) in next.config headers and keep tokens short-lived.
7. **O(n) socket scans in hot paths** - app.ts:1083-1086 `blockedPair` does `[...io.sockets.sockets.values()].find(...)` per candidate pair during `room:join` -> O(seats x sockets). Fix: maintain `Map<deviceId, socketId>` updated on connect/disconnect.
8. **Unbounded in-memory maps** - `challenges` (auth.ts:88), `pending` (google.ts:42), `guard.connects/used` (guard.ts:69-70), `limits.entries/time` (limits.ts:41-43), analytics `visitors` (analytics.ts:17, reset daily). RateLimiter only prunes above 50k (http.ts:60). Verify each has TTL sweeping; add a periodic `setInterval` sweep + hard cap. Memory store (accounts.ts:256-261) holds selfie photos (base64) in RAM - fine for dev only; ensure prod always uses Postgres.
9. **Socket payload validation inconsistency** - most handlers check types, but several rely on `includes()` with untyped input (e.g. `room:report` reason app.ts:1125, `reaction` app.ts:1184). OK functionally; centralise with validators in validate.ts so every event goes through one typed parser.

## P2 - maintainability, perf, tests, a11y

10. **God files** (line counts): server `app.ts` 1808, `accounts.ts` 1236 (memory + Postgres stores in one file), `matchmaker.ts` 465; web `useRandomCall.ts` 1488 (30 useEffect/useRef), `ChatScreen.tsx` 909, `Landing.tsx` 866, `i18n.tsx` 796, `settings/page.tsx` 693, `admin/page.tsx` 617; shared `index.ts` 935. Fix: split app.ts into `sockets/{call,rooms,games,dm,billing,safety}.ts` registering on the same socket; split accounts.ts into `accounts-memory.ts` / `accounts-postgres.ts`; split useRandomCall into `usePeerConnection`, `useSignalling`, `useMediaDevices`, `useCallLimits`.
11. **Type safety**: non-null assertions on lookups that can miss (`COIN_PACKS.find(...)!` razorpay.ts:93, `PLUS_PASSES.find(...)!` :96, `socket.data.userId!` app.ts:987, `rooms.roomOf(socket.id)!` app.ts:1121, `games.keys().next().value!`). Replace with guarded returns.
12. **Game eviction is FIFO, not by activity** - app.ts:1161 deletes the oldest key when >5000, potentially killing an active game. Delete games on match end/disconnect instead (verify) and use an LRU.
13. **Web has no tests.** Start with pure units: signalling state machine extracted from useRandomCall, i18n key completeness, `looksLikeLink` parity; add one Playwright smoke (two browser contexts with fake media `--use-fake-device-for-media-stream`) for match -> chat -> next.
14. **Server test runtime 16 s** with real sockets - watch for timing-based flakiness (ad timer, rate windows); inject clocks (limits already takes `now`) everywhere instead of sleeping.
15. **Accessibility**: CallControls.tsx has 10 aria-labels (good); audit icon-only buttons in ChatScreen/MoreMenu/WaThread, focus traps in modals, and `prefers-reduced-motion` for matching animations. Video elements should have muted/captions alternatives for text-chat mode.
16. **Logging**: `console.error('[handshake]', e)` and webhook errors may print full error objects incl. request data; adopt a small structured logger with redaction.

## Not fully covered
WebRTC lifecycle in useRandomCall.ts and matchmaker race paths were only spot-checked, not line-by-line; recommend a focused pass on: ICE restart vs `call:next` during negotiation, stale `pc` callbacks after Next (guard with a match-id ref), and `call:back` when the previous partner already rematched.
