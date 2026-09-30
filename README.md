# randomCall

Web-only, one-on-one random video chat. Phase 1 (Foundations) of the MVP plan:
landing page, 18+ gate, camera/mic permission, a matchmaking queue, a peer-to-peer
WebRTC call, and Next / Stop.

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

## Socket protocol

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `queue:join` | `{ gender, interests[] }` |
| client → server | `call:next` | — ends the match and re-queues the caller |
| client → server | `queue:leave` | — Stop: leaves the queue and ends any match |
| both ways | `signal` | `{ kind: 'offer' \| 'answer', sdp }` or `{ kind: 'ice', candidate }` |
| server → client | `match:found` | `{ matchId, initiator, partner, iceServers }` |
| server → client | `partner:left` | `'next' \| 'stop' \| 'disconnect'` — client re-queues itself |
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
- No text chat, reconnect (Back), report/block or moderation yet — Phases 2–3.
