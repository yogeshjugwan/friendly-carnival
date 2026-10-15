# randomCall — Product Requirements Document (as built)

Status: draft v1, 2026-10-16. Describes the product **as built** (verified against code in `apps/web`, `apps/server`, `packages/shared`) and marks gaps against the "Instant Entry" design canvas. Legend: ✅ built · ⚠️ built but not live / partial · ❌ not built.

---

## 1. Overview

| Item | Detail |
|---|---|
| Product | randomCall: free, web-only random video / voice / text chat with strangers (Omegle / Chatroulette / Chatrandom alternative) |
| Live | Web: Vercel (Next.js 15). Server: Render free plan, Singapore, single instance (Node + Socket.IO). DB: Neon Postgres |
| Vision | "One tap to a real conversation": the fastest, safest way to meet someone new, without an install or a sign-up |
| Positioning | No-install PWA, guest start in one click, India-first pricing (UPI, ₹ passes, festival gifts) with global reach, safety stack (PoW shield, trust score, on-device nudity screening, face check) stronger than typical clones |
| Markets | India first (IST analytics days, Hindi UI, Razorpay/UPI, Diwali/Holi gifts); global next (es, pt, fr, id UI; `/chat/<country>` SEO pages) |

### Personas
| Persona | Need | What serves them |
|---|---|---|
| Casual guest (18–30, mobile, India) | Instant fun, no account | Guest start, 50 matches/day, text/voice modes, masks |
| Social regular | Meet the same people again | Account, friends, DMs, history/follow, push |
| Payer | Filters, no limits, no ads | Plus, coins, Boost, Priority match |
| Privacy-conscious user | Hide face / be safe | Masks, background blur, voice/text mode, report/block |
| Moderator / owner | Keep the pool clean, see metrics | `/admin` (reports, bans, appeals, verifications, analytics) |

### Competitors
| | Omegle (closed 2023) | Chatroulette | Chatrandom / Azar / OmeTV | randomCall |
|---|---|---|---|---|
| Install | Web | Web | Apps + web | Web / PWA |
| Gender/country filter | No | Paid | Paid | Plus |
| India pricing / UPI | No | No | Partial | Yes (when Razorpay keys set) |
| Moderation | Weak | AI + human | AI + human | PoW, trust, on-device AI, face check, admin |

---

## 2. Goals and success metrics

| Metric | Target (proposed) | Measured today? |
|---|---|---|
| Visitors / DAU | growth WoW | ✅ `analytics.visit` → `daily_stats` (per process; restart may double-count) |
| Activation (visitor → first match) | ≥ 60 % | ⚠️ matches and visitors counted separately; no per-user funnel |
| Time to match (p50 / p90) | < 5 s / < 20 s | ❌ not recorded (only `/health` live waiting count) |
| Connect rate (match → media flowing) | ≥ 90 % | ⚠️ `/health` `calls.recent` shows recent call results; not stored per day |
| Avg call length, calls per session | up | ❌ |
| D1 / D7 retention | 25 % / 10 % | ❌ (no cohort tracking; signups per day only) |
| Signups | — | ✅ admin analytics (`signups`) |
| Conversion to Plus | 1–2 % of MAU | ❌ no daily Plus count (Stripe dashboard only) |
| Coin revenue / ARPU / ARPPU | — | ⚠️ coin purchases counted (coins, not money); gifts, boosts, priority counted |
| Ads watched, limit hits, referrals, games, room joins, peak online | — | ✅ `daily_stats` |
| Safety: reports / 1k matches, auto-bans, appeal overturn rate, time-to-review | reports < 5/1k | ⚠️ reports counted; bans/appeals visible in admin lists, no rates |

**Next step:** add `matchWaitMs` histogram, `connected`/`failed` per day, Plus starts, revenue in currency, and a cohort table (first-seen day per device) for D1/D7.

---

## 3. User journeys

| # | Journey | Flow as built |
|---|---|---|
| J1 | Guest start | Home → tick 18+ (remembered) → "Start video chat" → camera permission → face + camera quality check → PoW solved in Web Worker → queue |
| J2 | Matching | Matching stage (orbiting people, "Finding someone…"), filters if Plus, interests/topic scoring, avoid last 5 partners (relaxed after 8 s), Priority match button (25 coins) |
| J3 | Call | WebRTC P2P (STUN; TURN when env set); relay fallback after 15 s; timer, chat panel, reactions, gifts, games, icebreakers, translation, add friend |
| J4 | Next / Stop | Lime "Next →" (Space) re-queues; Stop returns home; skip brake for rapid skippers |
| J5 | Report | Report button → reason (nudity, harassment, underage, scam, illegal, other) + note + snapshot; target current or previous partner; auto-skip |
| J6 | Signup / login | Single `/login` (= `/signup`): email → `POST /auth/check` → password or signup fields (DOB required); Google sign-in; email confirm/reset via Resend |
| J7 | Plus purchase | `/plus` or in-call upsell → guests "Log in to subscribe" → Stripe Checkout (subscription) or Razorpay prepaid pass |
| J8 | Coins / gifts | `/coins` → pack (Stripe or Razorpay) → gift menu in call → animation on both screens, receiver gets 50 % |
| J9 | Friends / messages | Mutual ❤️ → friend; friend calls; DMs `/messages` (3 requests to non-friends); `/history` + follow |
| J10 | Invite | `/invite` link `/r/<code>` → friend signs up + first chat → both get 1 Plus day (or 100 coins if Plus), max 30 rewards |
| J11 | PWA install | Manifest + service worker, install prompt (`Pwa.tsx`), Web Push opt-in; TWA guide in `docs/play-store.md` |

---

## 4. Functional requirements

### 4.1 Matching and filters
| Req | Status | Acceptance criteria |
|---|---|---|
| Separate queues for video / voice / text | ✅ | User only matched within chosen mode |
| Gender, country, verified-only filters | ✅ Plus | Non-Plus requests ignore filters; Plus with no match in pool relaxes or waits |
| Interests (≤10, ≤24 chars) + topic rooms | ✅ | Higher overlap scores first |
| Recent-partner avoidance | ✅ | Last 5 not re-matched for 8 s, then allowed |
| Boost (100 coins / 30 min) | ✅ | Boosted users matched first during window |
| Priority match (25 coins, verified partner, 2 min) | ✅ | Refund if no verified partner in 2 min |
| Shadow pool for trust < 25 | ✅ | Low-trust only meet each other; no UI signal |
| Group rooms (≤4, mesh) | ✅ `/rooms` | 5th joiner refused |
| Online list | ✅ Plus | Shows online users to call directly |

### 4.2 Video / voice / text
| Req | Status | AC |
|---|---|---|
| WebRTC P2P + Socket.IO signalling | ✅ | Media flowing < 5 s on same network |
| TURN (Cloudflare / Metered / static) | ⚠️ code ✅, **not configured live** | Cross-network (mobile data) calls connect ≥ 95 % |
| Relay fallback (MediaRecorder → MSE) | ✅ | Kicks in after 15 s failure; `?relay=1` forces |
| Text chat ≤500 chars, burst 5/5 s, link/handle filter with strangers | ✅ | Links blocked with strangers, allowed with friends |
| Live translation (Google or MyMemory) | ✅ | Translated text shown under original |
| Reactions, icebreakers, truth/dare, mini-games | ✅ | Server-held game state |

### 4.3 Face masks and backgrounds
| Req | Status | AC |
|---|---|---|
| Full masks + lenses, background blur levels, virtual backgrounds (`Effects.tsx`, `backgroundEffect`) | ✅ | Effect applied to the outgoing stream; picker in ⋮ More |
| Face hidden must still pass face check | ⚠️ verify | Define rule: face check runs before masks are applied |

### 4.4 Safety and moderation
| Req | Status | AC |
|---|---|---|
| 18+ checkbox on home; DOB at signup; age holds (`under-18`, `review`) | ✅ | Under-18 DOB blocks chat; underage report puts user in review until ✓ verified |
| Face check (MediaPipe) + camera quality (black/covered/blurry) | ✅ | Start blocked until a face is visible |
| On-device nsfwjs screening → AI report | ✅ | Frames never leave device unless reported |
| New-user protection (new account video blurred at start) | ✅ | 24 h account / 15 min device windows |
| Report / block / hide | ✅ | Blocked users never re-matched |
| Trust score 0–100 (reports per network, fast-skip ratio, +login/verify/age) | ✅ | Below 25 → shadow pool |
| Auto-ban (3 reporters/24 h, AI flags), ban screen, appeals ≤1000 chars | ✅ | Appeal visible in `/admin` |
| PoW shield, token buckets, connection caps, skip brake | ✅ | Bot floods throttled |
| ✓ Verified badge (selfie + random gesture, moderator review) | ✅ | |
| Snapshot retention 30 days | ✅ | Purged on timer |
| Human moderation SLA / queue alerts | ❌ | — |
| CSAM hash matching / NCMEC-style reporting | ❌ | Required before scale |

### 4.5 Accounts
Email + password (scrypt, hashed tokens, 8–200 chars), Google OAuth, email confirm/reset (needs `RESEND_API_KEY` ⚠️), profile (name ≤24, bio ≤80, avatar, age), settings, blocked list, delete account (`/auth/delete`) ✅, unsubscribe ✅.

### 4.6 Monetisation
| Item | As built |
|---|---|
| Plus (Stripe subscription) | Weekly $2.99, Monthly $7.99 (Popular), 6 months $29.90 (Best value); live prices from Stripe env, fallbacks in `plus/page.tsx` |
| Plus (Razorpay prepaid, no renew) | ₹49 / 7 d, ₹149 / 30 d, ₹699 / 182 d ⚠️ keys not set |
| Plus benefits | Filters, Online list, no ads, unlimited matches and call time |
| Free trial | 24 h Plus once per account (confirmed email) |
| Coins | 100 = $0.99 / ₹29; 550 = $4.99 / ₹149 (+10 %); 1200 = $9.99 / ₹299 (Best value) |
| Gifts | 10 regular (Chai 5 → Sports car 500) + 7 festival seasonals (IST); receiver gets 50 % |
| Boost / Priority | 100 coins / 30 min; 25 coins / verified match |
| Daily streak | 10,15,20,25,30,40,60 coins (needs a chat today + confirmed email) |
| Limits (free) | 50 matches/day; +10 per rewarded ad × 5/day; 30 coins = 10 matches; video/voice 5 h then 1 h break; text unlimited |
| Ads | House ads ✅; AdSense ⚠️ account deactivated; GAM rewarded ⚠️ unit not set |
| Receiver gift payout to cash | ❌ (coins only; decide policy) |

AC: purchases credited only on verified webhook; limit modal shows countdown; Plus bypasses all limits.

### 4.7 Social, growth, i18n, SEO, admin
| Area | Status |
|---|---|
| Friends, friend calls, DMs, history + follow, push, win-back emails (⚠️ Resend) | ✅ |
| Referrals `/invite`, `/r/<code>` | ✅ |
| UI languages en, hi, es, pt, fr, id | ✅ (other Indian languages ❌) |
| SEO: `/chat/<country>`, sitemap, robots, OG/Twitter images | ✅ |
| Legal: terms, privacy, guidelines, help | ✅ templates, ⚠️ no lawyer review |
| Admin `/admin` (token): reports, bans, appeals, verifications, analytics | ✅ (single shared token, no roles/audit log ❌) |

### 4.8 Design canvas vs build
| Canvas board | Build |
|---|---|
| Home, Match, Call (desktop + mobile), Coins, Plus modal/sheet, History, Messages, Settings, Edit profile, Invite, Login, Forgot, legal/help | ✅ redesigned to Instant Entry |
| State boards: age check, banned, blurred, connection lost, no match, out of matches, permission, Plus nudge, skipped, report | ✅ mostly (StateCard / LimitModal / BannedScreen / ReportDialog) — run `chintu:design-auditor`-style pass to confirm each state pixel-wise |
| Click map (what opens where) | ⚠️ verify every entry point on phone width after each deploy |

---

## 5. Non-functional requirements

| Area | Requirement | Current |
|---|---|---|
| Performance | Home LCP < 2.5 s on 4G; match < 5 s p50 | nsfw model copied to `public/models` (lazy); no RUM ❌ |
| Availability | 99.5 % | Render **free plan sleeps** on idle → cold start; single instance ❌ |
| Scalability | 10k concurrent | In-memory matchmaker, one process; Redis matchmaker not built ❌; mesh rooms cap 4 |
| Connectivity | TURN for symmetric NAT | Not configured ❌ (top risk) |
| Privacy | 18+, GDPR, India DPDP Act 2023 | P2P media not recorded; IP hashed with salt; snapshots 30 d; delete account ✅; consent banner / data export / DPO contact / grievance officer (DPDP) ❌ |
| Security | OWASP basics | scrypt, hashed tokens, HMAC PoW, rate limits, webhook signature checks; admin single token ⚠️; public repo — no secrets in git |
| Accessibility | WCAG 2.1 AA | aria labels on dialogs; no audit ❌; captions for voice ❌ |
| Browsers | Chrome/Edge/Safari/Firefox last 2, iOS Safari 16+, Android Chrome | Not formally tested on iOS Safari ⚠️ (MSE relay limited on iOS) |
| Tests | — | ~124 server tests (node:test, pg-mem), load test script; no web E2E ❌ |

---

## 6. Gaps, risks and roadmap

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| No TURN on live | Many mobile calls fail → churn | Set Cloudflare/Metered keys (Now) |
| Render free plan + single instance | Cold starts, outage = total outage | Paid instance; later Redis matchmaker |
| Minors / CSAM exposure | Legal, app-store, payment-provider ban | Human review SLA, hash matching, stronger age assurance |
| Payment providers' adult/random-chat policy | Stripe account closure | Keep strict guidelines, document moderation, Razorpay backup |
| Email off (no Resend) | No confirm/reset/win-back; streak & trial need confirmed email | Set key + domain |
| Ad revenue nil (AdSense off) | Free tier unmonetised | Reactivate / GAM unit |
| Untemplated legal | DPDP / GDPR non-compliance | Lawyer review |

### Roadmap
| Horizon | Item | Priority |
|---|---|---|
| Now | TURN keys; Resend key; check Render `FREE_DAILY_MATCHES`=50; Razorpay keys; Render paid plan | P0 |
| Now | Metrics: match wait, connect rate, Plus starts, revenue, D1/D7 cohorts | P0 |
| Now | Lawyer review; DPDP grievance officer + privacy contact; cookie/consent | P0 |
| Next | Moderation queue SLA, admin roles + audit log, CSAM hashing | P1 |
| Next | iOS Safari QA, web E2E smoke tests, accessibility audit | P1 |
| Next | AdSense/GAM live; pricing A/B (₹ vs $), trial → paid funnel | P1 |
| Later | Redis matchmaker / multi-instance; SFU for rooms > 4 | P2 |
| Later | Android TWA on Play Store; more Indian languages (ta, te, bn, mr) | P2 |
| Later | Creator payouts for gifts (if policy allows) | P3 |

---

## 7. Open questions for the owner

1. Primary North Star: minutes in conversation, matches/day, or paid conversion?
2. Should Razorpay (₹) be the default for India visitors, and do Plus passes stay non-renewing?
3. Gift receivers get 50 % in coins — ever convertible to cash? (Legal/tax implications.)
4. Budget for TURN bandwidth and a paid Render instance?
5. Age assurance: is DOB + 18+ checkbox enough for target markets, or add ID/selfie age estimation?
6. Who moderates, and what review SLA for reports/appeals/verifications?
7. Are masks allowed to hide the face entirely during calls (conflicts with face check intent)?
8. Keep free limits at 50 matches / 5 h + 1 h break, or tune by market after data?
9. Plans for a native app beyond the TWA route?
10. Data retention for chat logs, DMs, history, reports beyond 30-day snapshots?
