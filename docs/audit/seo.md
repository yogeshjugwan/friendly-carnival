# randomCall SEO audit (2026-10-16)

Scope: apps/web (Next.js 15 App Router) + live https://call-random-call.vercel.app. Audit only, no code changed.

## Scorecard
| Area | Score | Note |
|---|---|---|
| Metadata / canonicals | B | Good root metadata (layout.tsx:14-53); per-route titles; country titles duplicate brand |
| robots / sitemap | A- | Live robots.txt correct; sitemap has 31 URLs (9 static + 22+ country) |
| noindex on private pages | A | admin, auth, history, messages, settings, r, reset, verify, unsubscribe, get-verified |
| Structured data | B+ | WebApplication + Organization + FAQPage on home (page.tsx:6-25), FAQPage on country pages |
| Server-rendered text | A- | Home HTML (181 KB) contains h1 "Meet someone new", "random video chat" x15, "talk to strangers" x5, "Omegle" x9 |
| i18n / hreflang | D | 6-language UI is client-side only (src/lib/i18n.tsx:10, navigator.languages at :713); no hreflang, no localized URLs |
| Content depth / keywords | C- | No blog/guides, no "omegle alternative" landing page |
| Domain / authority | D | vercel.app subdomain, no backlinks |
| 404 | C | No src/app/not-found.tsx; default Next 404 (status 404 is correct) |

## Evidence
- `curl /robots.txt` -> Allow /, disallows /admin /settings /auth/ /r/ /get-verified /unsubscribe, Sitemap line present.
- `curl /sitemap.xml | grep -c <loc>` -> 31.
- `/chat/india` title: `Random Video Chat India — Talk to Strangers Free | randomCall · randomCall` (brand twice, ~75 chars) because chat/[country]/page.tsx:17 appends "| randomCall" and layout template (layout.tsx:18) appends "· randomCall" again.
- `/login` title "Log in or Sign up" and `/signup` "Sign up — Free Account" both indexable with self-canonicals (login/layout.tsx:6, signup/layout.tsx:6) -> thin, near-duplicate auth pages. /forgot is also indexable (forgot/layout.tsx).
- `<html lang="en">` hard-coded (layout.tsx:63) even when UI is switched to another language.
- Country pages have one h1, h2s, FAQ JSON-LD, cross-links to other countries (good), but no og image override, no twitter override, and copy is a template (same paragraphs, only name/greeting/topics differ) -> thin-content risk.
- public/faces: 103 JPGs, 3.2 MB total, largest ~53 KB. Fine if served via next/image or lazy-loaded; check they are not all eagerly loaded on home (LCP/bandwidth).
- Heading check: h1 present in Landing.tsx, country, help, rooms, plus, guidelines, legal pages. help h1 is `max-lg:sr-only` (visible only on desktop) - acceptable.

## P0 (do now)
1. **Own domain** (e.g. randomcall.chat / .app). Set NEXT_PUBLIC_SITE_URL in Vercel, 301 vercel.app -> domain (Vercel "redirect to primary domain"). Everything below compounds on the domain; links built on vercel.app are lost later.
2. **Google Search Console + Bing Webmaster**: verify domain (DNS TXT), submit /sitemap.xml, request indexing of / and top 5 country pages. Owner task.
3. **Fix double brand in country titles** - `apps/web/src/app/chat/[country]/page.tsx:17`:
   ```ts
   const title = { absolute: `Random Video Chat ${short} — Talk to Strangers Free | randomCall` };
   ```
   (or drop the "| randomCall" suffix and keep the template). Keep under ~60 chars, e.g. `Random Video Chat India – Talk to Strangers Free`.
4. **noindex /signup and /forgot** (keep /login indexable or vice versa): in `apps/web/src/app/signup/layout.tsx` and `forgot/layout.tsx` add `robots: { index: false, follow: true }`; remove /signup from nothing (it is not in the sitemap - good).

## P1 (next 2-4 weeks)
5. **"Omegle alternative" landing pages**: add static routes `apps/web/src/app/omegle-alternative/page.tsx`, `chatroulette-alternative`, `talk-to-strangers`, `video-chat-with-girls`? (avoid - policy risk; prefer `random-voice-chat`, `random-text-chat`, `group-video-chat`). Each: unique 600-1000 words, h1 = target term, comparison table, FAQPage JSON-LD, CTA to /. Add to `sitemap.ts` pages array.
6. **Make country pages unique**: in `src/lib/countryPages.ts` add per-country fields (popular hours/time zone, languages, local safety note, 2-3 unique paragraphs). Add `twitter` + per-page `opengraph-image.tsx` under `chat/[country]/` (flag + "Random video chat in India"). Add BreadcrumbList JSON-LD.
7. **Localized URLs + hreflang** for the 6 UI languages: move to `/[lang]/...` (or at least `/es`, `/pt`, `/hi`... landing pages server-rendered in that language), set `<html lang>` per route, and `alternates.languages` in metadata:
   ```ts
   alternates: { canonical: '/', languages: { en: '/', es: '/es', hi: '/hi', 'x-default': '/' } }
   ```
   Country pages for non-English markets (Brazil, Mexico, Indonesia...) should be in the local language - that is the biggest ranking lever vs. Omegle clones.
8. **Branded 404**: add `apps/web/src/app/not-found.tsx` with SiteHeader, links to home, /rooms, top country pages.
9. **Core Web Vitals**: run `pnpm --filter web build` and PageSpeed Insights on / and /chat/india. Check home first-load JS (RandomCall is a large client component); lazy-load face thumbnails (`loading="lazy"`, next/image with sizes) and defer camera/socket code until Start is pressed. Target LCP < 2.5s mobile.
10. **Home JSON-LD**: add `sameAs` (social profiles once created) to Organization, and `aggregateRating` only if real reviews exist (never fake).

## P2 (ongoing)
11. **Blog / guides** at `/guides/[slug]` (MDX): "Best Omegle alternatives in 2026", "How to stay safe on random video chat", "Random chat etiquette", "Why is my camera not working in Chrome" (help-intent traffic). 2 posts/month, internal-link to country + alternative pages.
12. Internal linking: footer (SiteFooter in components/SiteHeader.tsx) should link the alternative pages, top 10 countries and guides; home should link /chat index page (add `/chat/page.tsx` listing all countries).
13. Add `/rooms` topic pages (`/rooms/[topic]`) only if they have real server text.
14. Image alt: no `<img>` without alt found in src; keep using `alt` on faces (decorative -> `alt=""`).

## Keyword strategy
- Realistic in 3-6 months (low/medium difficulty): long-tail + geo: "random video chat [country]", "talk to strangers [country]", "omegle alternative [country/language]", "random voice chat", "random text chat no sign up", "group video chat with strangers", local-language equivalents ("chat aleatorio con extraños", "video chat acak", "bate-papo por vídeo aleatório").
- Hard (DR 70+ competitors: Chatrandom, OmeTV, Emerald, Monkey): head terms "omegle alternative", "talk to strangers", "random video chat". Target them with dedicated pages but expect slow traction until backlinks exist.
- Gaps: no alternative/comparison pages, no localized pages, no guide content, no /chat index.

## Off-site to-dos (owner)
- Buy domain, connect in Vercel, set NEXT_PUBLIC_SITE_URL, redirect vercel.app.
- Search Console + Bing Webmaster, submit sitemap, monitor Coverage and Core Web Vitals.
- Listings/backlinks: Product Hunt launch, AlternativeTo (as Omegle/Chatroulette alternative), SaaSHub, Reddit (r/SideProject, r/InternetIsBeautiful - follow rules), Indie Hackers, Hacker News "Show HN", GitHub README link (repo is public), "Omegle alternatives" listicle outreach.
- Social profiles (X, Instagram, TikTok short clips) and add them to Organization `sameAs`.
- Google Play TWA listing (docs/play-store.md) - also a strong backlink + brand signal.
