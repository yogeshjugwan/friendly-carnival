# randomCall

Web-only, one-on-one random video chat.

- **Phase 1:** landing page, 18+ gate, camera/mic permission, matchmaking queue,
  peer-to-peer WebRTC call, Next / Stop.
- **Phase 2:** Back (reconnect with the partner you skipped), text chat with emoji and
  typing indicator, text-only mode, camera/mic picker, blur on connect, TURN support,
  connect timeouts and a measured connect rate (`/health`).
- **Phase 3 (safety):** report (current or previous partner, 6 reasons, snapshot),
  block, hide partner video, device bans (IP opt-in) with appeals, automatic bans on
  repeated reports, on-device AI nudity screening (nsfwjs), and an admin dashboard at `/admin`.
- **Phase 4 (beta & launch):** optional email accounts (signup, email confirmation, login,
  forgot/reset/change password, delete account), `/settings` (gender, interests, reconnect,
  hide country) synced to the account, bans that follow accounts, Terms / Privacy /
  Community Guidelines pages, and a load-test script.

```
apps/web      Next.js 15 (App Router) + Tailwind 4 — landing + call UI, WebRTC in the browser
apps/server   Node + Socket.IO — signaling, matchmaker, presence (port 4100)
packages/shared  Typed socket events shared by both apps
```

Video and audio go browser to browser. The server only pairs users and relays
the SDP offer/answer and ICE candidates.

## Run locally

```bash
pnpm install
pnpm dev            # web on :3000, server on :4100
```

Open http://localhost:3000 in two browser windows (or two devices on the same Wi-Fi,
using the machine's LAN IP — note `getUserMedia` needs HTTPS on anything but localhost).

```bash
pnpm --filter @rc/server test   # matchmaker + socket integration tests
pnpm typecheck
pnpm build
```

## Configuration

| Variable | App | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SIGNALING_URL` | web | `http://localhost:4100` | Realtime server URL |
| `PORT` | server | `4100` | Listen port |
| `WEB_ORIGIN` | server | `http://localhost:3000` | Allowed CORS origins, comma separated |
| `STUN_URLS` | server | Google public STUN | Comma-separated STUN URLs |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | server | unset | TURN relay (needed in production) |
| `ADMIN_TOKEN` | server | unset | Bearer token for `/admin/*`; the dashboard is disabled without it |
| `IP_SALT` | server | dev salt | Salt for hashing IPs before storage |
| `DATABASE_URL` | server | unset | Postgres for accounts and safety data; in-memory (lost on restart) when unset |
| `WEB_URL` | server | `http://localhost:3000` | Web app URL used in email links |
| `RESEND_API_KEY`, `MAIL_FROM` | server | unset | Email via Resend; without a key, emails are printed to the log |
| `NEXT_PUBLIC_CONTACT_EMAIL` | web | `support@example.com` | Contact address shown on the legal pages |

## Socket protocol

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `queue:join` | `{ gender, interests[], mode: 'video' \| 'text' }` |
| client → server | `call:back` | reconnect with the previous partner if they are searching |
| client → server | `chat:message`, `chat:typing` | text (≤ 500 chars, 5 per 5 s), boolean |
| client → server | `settings:reconnect` | boolean — let skipped partners press Back |
| client → server | `call:result` | `{ matchId, connected, ms }` — feeds `/health` connect rate |
| client → server | `call:next` | — ends the match and re-queues the caller |
| client → server | `queue:leave` | — Stop: leaves the queue and ends any match |
| both ways | `signal` | `{ kind: 'offer' \| 'answer', sdp }` or `{ kind: 'ice', candidate }` |
| server → client | `match:found` | `{ matchId, initiator, partner, iceServers }` |
| server → client | `partner:left` | `'next' \| 'stop' \| 'disconnect'` — client re-queues itself |
| server → client | `back:unavailable` | `'no-previous' \| 'gone' \| 'busy' \| 'declined'` |
| server → client | `chat:message`, `chat:typing`, `chat:rejected` | `{ text, at }`, boolean, `'rate-limited' \| 'invalid'` |
| server → client | `queue:waiting`, `stats` | waiting ack, `{ online }` every 5 s |

Matching: the newcomer pairs with the waiting user who shares the most interests,
falling back to the longest waiter; the last 5 partners are never re-matched.

## Deploy (recommended)

| Piece | Platform | Notes |
| --- | --- | --- |
| `apps/web` | Vercel | Static + SSR; set `NEXT_PUBLIC_SIGNALING_URL` |
| `apps/server` | Railway or Fly.io | Needs long-lived WebSockets (not serverless); one instance for now |
| TURN | Metered.ca / Twilio NTS to start, self-hosted coturn later | Without TURN ~15–20% of calls fail |
| Redis (Phase 2 scale-out) | Upstash or Railway Redis | Shared queue + Socket.IO Redis adapter for >1 server |

## Known limits of Phase 1

- Matchmaker is in memory, so run one server instance. Moving the queue to Redis
  plus `@socket.io/redis-adapter` is the step to multiple instances.
- Country comes from `cf-ipcountry` / `x-vercel-ip-country` headers only; locally it shows "Unknown".
- Safety data is in memory until `DATABASE_URL` is set.
- AI screening detects nudity only; age is not estimated, so "underage" relies on user reports.

## TURN (needed for ~15–20% of calls)

1. Create a free account at https://www.metered.ca/stun-turn and copy the TURN credentials.
2. In Render → random-call-server → Environment, set `TURN_URLS`
   (e.g. `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443?transport=tcp`),
   `TURN_USERNAME` and `TURN_CREDENTIAL`.
3. `/health` then reports `"turnConfigured": true`; watch `calls.connectRate` (Phase 2 gate: ≥ 0.9).

## Safety and moderation

| Rule | Action |
| --- | --- |
| 3 different users report someone within 24 h | automatic 24 h ban |
| 2 different users report "underage" within 24 h | automatic 7-day ban, pending review |
| AI flags nudity from 2 different partners within 1 h | automatic 1 h ban |
| You report someone | you are never matched with them again |

- Bans follow the **device** (a random id in localStorage). Admins can also ban the
  hashed IP, but shared mobile IPs (CGNAT) can cover many users, so it is off by default.
- AI screening runs in the **receiver's** browser on the partner's incoming video every
  3 s. Two flagged frames in a row blur the video and file an automatic report.
- Report snapshots are 320 px JPEGs, shown blurred in the dashboard until clicked, and
  purged after 30 days.
- Dashboard: open `/admin` on the web app and sign in with the server's `ADMIN_TOKEN`.
  The "Oldest open" card turns red when a report waits more than 24 h (the Phase 3 gate).

## Accounts

Accounts are optional; guests keep chatting without one. Passwords are hashed with
scrypt; session, email-confirmation and reset tokens are random and stored only as
SHA-256 hashes. Credential endpoints are limited to 20 attempts per 10 minutes per IP.
The web app keeps the session token in localStorage and sends it as a bearer token
(the web and server are on different domains, so cookies are not used).

## Load test

```bash
pnpm --filter @rc/server loadtest -- --users 200 --duration 60          # local server
pnpm --filter @rc/server loadtest -- --url https://your-server.example   # a server you own
```

Each simulated user joins, stays 3–8 s, presses Next and repeats. Phase 4 gate: median
time-to-match under 5 s at 200 users. Local result (M-series Mac): 200 users → p50 0.00 s,
p99 0.96 s, 71 MB; 1,000 users → p99 0.15 s, 104 MB.
