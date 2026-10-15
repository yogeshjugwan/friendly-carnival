# Design QA — randomCall web vs Claude Design canvas (2026-10-16)

Method: code comparison only (no browser run). Every visible string in each `*.dc.html` was checked against all
`apps/web/src/components/**` and `apps/web/src/app/**/*.tsx`; colour and font usage was compared against the design's
palette. Match % values are rough estimates. Placeholder copy (`[Name]`, `[N] online`, `randomCall — …` frame titles) is ignored.

## Global findings

| Area | Design | Current | Where |
|---|---|---|---|
| Primary text | `#F4F5F7` (233 uses) | body `#e8ebf2`, also used in SiteHeader/FilterBar/ChatScreen | `globals.css` body; `SiteHeader.tsx:22`, `FilterBar.tsx:46`, `ChatScreen.tsx:561` |
| Secondary text | `#A9AEB8` / `#8A8F99` | token `--color-dim: #7d828c` (not in design), used ~105x with `text-faint` | `globals.css` `--color-dim`, `--color-faint: #5e636d` |
| Muted/borders | `#6B5D84` | `text-faint #5e636d` (not in design; also ~3:1 contrast on #0B0811) | `globals.css` |
| Off-token accent | pink `#FF6FAE` | `#ff7aa8` / `#2a1520` / `#ffd0e0` on Friends button | `ChatScreen.tsx:561` |
| Legacy tokens | — | `--color-brand #2f7de1`, `ink`, `panel` (blue era) still defined | `globals.css` |
| Fonts | Space Grotesk + DM Sans | Correct; loaded in `app/layout.tsx:58-59` | OK |
| Focus states | (not specified) | only 1 `focus-visible` and 14 `focus:` rules app-wide; 12 `outline-none` | a11y gap |
| Touch targets | ≥44px | mostly `h-11` (119 hits); `FilterBar.tsx:46` h-9, `ChatScreen.tsx:561` h-10 | below 44 |
| Contrast | design itself uses `#6B5D84` text on `#0B0811` (~3.2:1) | inherited | fails AA for small text |

## Per-screen

| Screen | Code | Match | Mismatches / missing (design → current) |
|---|---|---|---|
| Main / Mobile home | `components/Landing.tsx`, `SiteHeader.tsx`, `DailyReward.tsx` | 80% | Streak chip copy "Day 3 streak · chat today for +20 coins" → `Landing.tsx:690` "Daily streak · chat today to keep it going"; "Get Plus · ₹199/mo" header button absent; install line "Free · no app store · about [X] MB" absent; age line "You must be 18 or older to use randomCall." not on home; online count gated to Plus (`SiteHeader.tsx:132`) while design shows "[N] online" to all |
| Login / LoginMobile | `app/login`, `AuthSplit.tsx`, `forms/*` | 85% | Divider "or with email" missing; consent copy "I'm 18+ and agree to the…" (mobile "I'm 18+ · agree to") differs |
| Match / MatchMobile | `ChatScreen.tsx` searching state | 70% | "While we search · quick tips" panel (Next/Report tips) missing; "[N] online · usually under 5 seconds" missing; mobile title "Who do you want to meet?" + "Log in to choose who you meet" missing |
| Call / CallMobile | `ChatScreen.tsx`, `CallControls.tsx`, `ChatPanel.tsx` | 75% | "Messages disappear when the call ends" note missing; mobile hint "Swipe or tap for next" missing; gift "Confirm purchase"/"Coins added ✓" flow missing |
| Report / ReportMobile | `ReportDialog.tsx`, `SafetyMenu.tsx` | 90% | Copy matches; uses design tokens (`#6b5d84` borders) |
| PlusModal / PlusSheet | `PlusModal.tsx`, `PlusUpsell.tsx` | 75% | Confirm step "Confirm & pay", success "Start choosing who you meet", error state "Payment didn't go through / You weren't charged…" all missing |
| Coins / CoinsMobile | `Coins.tsx`, `app/coins/page.tsx` | 75% | "Daily streak · Day 3" card + "Claim 20" button missing; "Boost · 30 min" item missing |
| Invite / InviteMobile | `app/invite` | 70% | Reward copy "1 day of Plus." / "Already on Plus? You get 100 coins instead." missing; "Rewards earned" block, "Your link" label, qualifying note ("Counts once your friend confirms email…"), "More…" share option missing |
| History / HistoryMobile | `app/history` | 80% | Summary "[N] chats this week · [N] people · only you can see this" missing; per-row "Send report" action missing |
| Messages / MessagesMobile | `WaThread.tsx`, `app/messages` | 65% | Thread menu missing: Mute notifications, Delete chat (+"Chat deleted for you" toast), Block [Name] (+"You blocked [Name]…" banner), Send report; header "You met on a video chat · [date]" missing |
| MessagesListMobile | `app/messages`, `WaThread.tsx` | 90% | No copy gaps found |
| Settings | `app/settings/page.tsx`, `SettingsMenu.tsx`, `BlockedList.tsx` | 60% | "Language & captions" section missing; Plus management (Monthly · ₹199/month, card, Cancel Plus? / Keep Plus / "You keep Plus until…") missing; profile preview "People you meet see: …" missing; empty block list "No one blocked" copy missing; delete flow uses password (`settings/page.tsx:645-684`) vs design "Type DELETE to confirm" + "Account deleted / Log in within [30] days to restore" |
| MeMobile | `app/settings/page.tsx` (mobile) | 60% | Same gaps as Settings plus "Selfie sent / Retake selfie" verify states, "[email] · confirmed" row |
| EditProfileMobile | `ProfileEditor.tsx` | 90% | No copy gaps |
| Forgot / ForgotMobile | `app/forgot` | 85% | Resend countdown "Didn't get it? Resend in 0:45" missing |
| Help / HelpMobile | `app/help` | 70% | Status "All systems working", "Chat with support · Usually replies in [X] min", topic "Coins or payment", "Appeal ban", "Reviewed by a person" missing |
| Privacy / PrivacyMobile | `app/privacy`, `LegalPage.tsx` | 75% | "Download my data" action missing; "[Calls are not recorded]" callout missing; header "Updated [date] · [Company legal name]" format differs |
| Terms | `app/terms` | 95% | No copy gaps |
| Guidelines | `app/guidelines/page.tsx` | 65% | Design has Do/Don't columns, "Zero tolerance:" callout, "See something wrong?" report box, "What happens next" strip (Warning / [24 h] ban / 1st-2nd-3rd time) — page is plain prose |
| StAgeCheck | `AgeGate.tsx` | 60% | Oval guide "Fit your face in the oval", tip copy, ID fallback ("Verify with ID instead", "Place your ID card here", "Take photo of ID"), success "You're verified 18+" missing |
| StBanned | `BannedScreen.tsx` | 80% | Reason/time line formatting ("· Nudity on camera · today, 10:00 IST"), appeal note "We reply by email … within [48 h]. One appeal per suspension.", validation "Write at least 20 characters" not present verbatim |
| StBlurred | `ChatScreen.tsx:721` | 80% | Reason label "Reported for nudity" missing |
| StConnLost | — | 10% | Whole state missing: "Connection lost", "Reconnecting… attempt 2 of 3…", "Reconnect now", "Back to Home" |
| StNoMatch | `ChatScreen.tsx:147-152` | 70% | Actions "Change filters (· Plus)" and "Try text chat" missing |
| StOutOfMatches | `LimitModal.tsx`? | 20% | "Time for a 5-minute break" screen (25 chats, countdown, "Reply to your messages", "Back to Home") missing |
| StPermission | `RandomCall.tsx:99-109` | 85% | Title "Camera & mic are blocked" differs |
| StPlusNudge | — / `PlusUpsell.tsx` | 40% | Trigger copy "You've skipped 5 people…" and success "You're Plus ✓ · Gender and country filters are unlocked." missing |
| StSkipped | `StateCard.tsx` | 95% | No gaps |

## Intentionally absent features (not mismatches)
Live captions + "Show captions in" language picker (Call, Settings); saved-card payments ("Saved card •• 4242", one-tap "Charged to your saved card") — Stripe Checkout used instead; UI language list (Español, Português, Türkçe, Bahasa Indonesia); ID-photo age verification; "Download my data"; live support chat / status page. Confirm with owner which are roadmap.

## Prioritized fix list
1. **Missing states:** build StConnLost (reconnect UI) and StOutOfMatches (5-min break) — users hit these with no designed feedback.
2. **Tokens:** set body text to `#F4F5F7`; replace `--color-dim #7d828c` → `#8A8F99` and `--color-faint #5e636d` → `#6B5D84` (or lighter for AA); remove `#ff7aa8`/`#2a1520`/`#ffd0e0` in `ChatScreen.tsx:561`; drop legacy blue tokens.
3. **Messages thread menu:** Mute / Delete chat / Block / Report + confirmations (`WaThread.tsx`).
4. **Settings/Me:** Plus management + cancel flow, "Type DELETE" delete confirm with restore-window copy, "No one blocked" empty state, profile preview line.
5. **Plus modal:** confirm, success and payment-failed states.
6. **Accessibility:** add `focus-visible` rings (pink `#FF6FAE` 2px) to buttons/links; raise `FilterBar.tsx:46` (h-9) and `ChatScreen.tsx:561` (h-10) to 44px.
7. **StNoMatch actions, StPlusNudge, StBlurred reason, StAgeCheck oval/success.**
8. **Copy polish:** home streak chip, login "or with email", Match tips panel, Forgot resend timer, Invite reward copy, History summary, Help contact block, Guidelines Do/Don't layout.
