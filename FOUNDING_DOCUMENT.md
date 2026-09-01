# Landmark Hunters — Founding Document

Current version. Reflects the pivot to a tool-first launch. Earlier gamified design work (Pokémon Go-style mechanics) is preserved in Section 10 as a documented future phase, not the current build target.

## 1. One-Line Concept (Current Focus)

A travel-planning tool that removes the hours of manual research a traveler normally has to do alone — tell it where you're staying and what you're into, and it builds an efficient, bookable, landmark-based itinerary. Not a game right now. The emotional/educational thesis below still drives the product; the mechanism for delivering it is a planning tool, not a points-and-catch game.

## 2. Core Thesis / Mission

Landmark Hunters exists because familiarity creates emotional impact. Seeing a landmark for the first time carries more weight when you already understand what it is and why it matters — the meaning is built before you arrive. The app's job is to make that preparation effortless and specific to the traveler, instead of generic search results or hours of scattered research.

The founder's own experience — researching a Switzerland trip with a friend and getting only generic, unhelpful answers from general AI search — is the direct problem this solves. A generic AI chat answer isn't computed, doesn't persist, can't be checked offline mid-walk, doesn't remember what you actually like, and can't book anything. Landmark Hunters is built to do all four.

## 3. Origin Story

The founder is a business coach who has traveled since his teens and noticed that knowing more about a landmark made seeing it more meaningful — first realized on a 2016 family trip through Europe with his kids and extended family. That trip is the origin of the concept. A prior attempt to build this stalled from lack of traction; nothing from that build survives (no code, no domain, no registered entity), so this is a clean rebuild. A trademark-style logo already exists (gold/brass pin mark with a landmark skyline silhouette) and its registration status is unconfirmed but not currently a blocker.

## 4. Product Name & Brand

Landmark Hunters. Logo: gold/brass location-pin mark incorporating a skyline silhouette (Statue of Liberty, Taj Mahal, Eiffel Tower, Leaning Tower of Pisa). Brand accent color matches the logo's brass/gold tone (`#c9a15a`, bright highlight `#e8c179`) and anchors the "Modern Explorer" visual system used throughout the app (Section 8).

## 5. Current Product Focus: Tool, Not Game

Explicit decision: at launch, Landmark Hunters is a trip-planning tool first. The Pokémon Go-style game layer (catching landmarks, Mayor/Expert ranks, quizzes, Trophy Room) has been deliberately shelved for a future phase, not built into v1. Reasoning:

* Real landmarks lack the density for a daily catch-loop the way Pokémon Go's stops do — most cities have a handful of true landmarks, not hundreds on every block.
* Travel itself is bursty (a few trips a year), not a daily habit — a daily-engagement game mechanic doesn't fit the actual behavior being designed for.
* Trip planning and prep, by contrast, is a proven, provenly monetizable behavior (Wanderlog, Roadtrippers, TripIt) that fits how people actually travel.
* One small piece of the game layer was kept anyway, deliberately scoped down (Section 7) — everything else is parked, not deleted.

## 6. Core Product Flow (Current, v1)

The app now opens directly on an interactive map of all landmarks across every region — auto-centered on the user's live location on first load — so a visitor can browse freely before ever starting formal trip setup. This map-first landing screen is the actual v1 entry point; trip setup is a path from there, not a gate in front of it. From there, the guided flow is:

1. **Trip Setup** — user enters a starting location and selects a region. The location field now does live autocomplete as you type: the app's own landmarks surface first (e.g. typing "Biltmore" suggests "The Biltmore Hotel — Miami landmark"), followed by real street addresses, so users rarely need to type a full address by hand.
2. **Interest Questionnaire** — 3 quick tappable interest categories (History & Culture, Art & Museums, Food & Local Life) plus a 4th "Add Your Own" option. That 4th option is a live-autocomplete chip (suggests things like Nightlife, Shopping, Architecture as you type), not a bare text box, so it still feels conversational rather than like a form field.
3. **Landmark Selection** — full list of landmarks for the chosen region; user multi-selects what they want to see, or taps "Suggest for me" to have the app pre-select based on stated interests
4. **Landmark Detail** — for every landmark: a short, simple explanation (1–2 sentences, no long essay), 2–3 relevant facts, and its own Check-In control (Section 7) so points can be claimed from the detail page directly, independent of whether the landmark is part of a trip
5. **Optimized Itinerary** — app computes the smartest visiting order starting from the user's actual location — real distance calculation, not a generic prose suggestion. For each stop: travel time to get there, and typical time to spend once there, so a full day is genuinely plannable
6. **Booking** — for each landmark: either a "Book Now" button (affiliate booking, see Section 9) or a "Free to Visit" label if there's no ticketed admission
7. **Get Directions** — for turn-by-turn navigation between itinerary stops, deep-links out to the phone's native Maps app; no in-app turn-by-turn routing built for v1, since that's a solved problem not worth rebuilding. Separately, an in-app explore map *was* built (OpenStreetMap-based, with marker clustering across all 151 landmarks) — that's the Section-6-intro landing screen above. So the "no map SDK" call from earlier planning turned out to be true for routing specifically, not for browsing/discovery — that piece got built because it directly serves the "explore without committing to a trip" goal.

## 7. Points & Leaderboard (Minimal, Kept From the Game Layer)

The only piece of gamification kept for v1 — added specifically to incentivize actually going, not just planning and booking:

* **Earning points**: GPS-verification only — user must be physically within **30m** of a landmark's real coordinates to claim points. (Tightened down from an initial 150m during build/testing — 30m balances real-world GPS accuracy against making the claim meaningful.) No photo requirement, no self-report tap, no other verification for this version.
* Check-in is available two places: the dedicated Check-In tab (all landmarks in the active trip) and directly on each landmark's own detail page (works standalone, no trip required).
* No point values or currency meaning yet — flat points per landmark for now; deeper meaning/rewards is a future-phase decision.
* Leaderboard: periodic only — weekly, monthly, and yearly tabs, each resetting on its own schedule. No all-time leaderboard in v1, specifically so early users don't permanently dominate people who join later.
* Explicitly not included yet: Mayor/Expert tracks, Trophy Room, Niche Waypoints, badges, rank titles — all documented in Section 10 as future phase.

## 8. Visual Design System — "Modern Explorer"

* Background: dark charcoal-navy (`#14181c`), faint topographic contour-line grid pattern
* Accent: brass/gold (`#c9a15a`, bright highlight `#e8c179`) — matches the logo
* Success: muted expedition green (`#4f7a5c`); Error: muted rust (`#b3503f`)
* Text: warm parchment off-white (`#ede6d6`), never pure white
* Typography: serif (Georgia) for headings, clean sans-serif for body/UI
* Landmark photos: postcard/polaroid framing — slightly rotated, corner brackets, sepia tint
* Buttons: rounded rectangles, brass border/fill, uppercase letter-spaced labels
* Progress indicators: dotted travel-route style, not a flat bar
* Icons/motifs: compass rose, map pins, passport-stamp circles
* Overall feel: old-world expedition journal meets a modern app — premium and adventurous, not cartoonish

## 9. Monetization (Current Focus)

Primary: booking commission. Affiliate partnership model — GetYourGuide, Viator, and/or Tiqets, embedded in-app (not an external browser redirect), earning a roughly 20% commission on bookings made through the app. This is a proven travel-industry model (same approach used by Wanderlog and most travel content sites), requires no payment processing of your own, and covers most major paid-admission landmarks already. Free public landmarks show "Free to Visit" instead of a booking button.

Current build status: "Book Now" buttons exist and are wired up per-landmark, but still point to placeholder affiliate URLs pending actual affiliate program signup (see Section 13) — the embedded, real-commission version is not live yet.

Not pursuing at launch: subscription tier, in-app purchases, ads. These were designed for the future gamified phase (Section 10) and are not part of the current tool-first monetization plan.

## 10. Future Phase: Gamified Layer (Documented, Not Being Built Now)

This is preserved design work from earlier planning — a fully separate phase to revisit once the tool-first version proves people actually use it. None of this is in the current build.

Concept: Pokémon Go meets a treasure hunt, applied to real landmarks — "catching" a landmark through photo/trivia/points instead of an AR creature.

Study/visit points: two ways to earn points per landmark — studying (quizzes/trivia, can be done entirely at home) and visiting (worth ~1.5–2x study points, diminishing returns on repeat visits, full bonus gated behind having studied first to avoid a pay-to-win dynamic).

Verification (full version): live in-app photo capture only, GPS cross-check, and the user's face required in frame with the landmark — closes fraud loopholes a v1 GPS-only check doesn't.

Landmark vs. Waypoint tiers: Landmark = objective threshold (UNESCO status, national registry, or ~500k+ annual visitors). Waypoint = everything else notable but not iconic, lower point value.

Niche Waypoint / Founder Niche Waypoint: high-quality, low-visibility spots surfaced by Local Ambassadors, worth outsized points. Founder Niche Waypoints are hand-picked personal locations (e.g. family history spots) added directly by the founders — first finder gets a permanent unique badge; once found, later visitors get only a token point.

Rank tracks: Mayor/President (Swarm-style, visit-based, contestable, minor/local), Expert (knowledge-based, no visit required), Local Ambassador (tour guides/locals), Ultimate Traveler (requires ranking high in both Mayor and Expert, not just a combined score).

Trophy Room: stats screen — landmarks found, waypoints found, countries/cities visited, titles held, current level.

Question formats: picture-ID quiz plus rotating fact-based questions per landmark (when built, how tall, why built, etc.), difficulty scaling with rank (Duolingo-style), anti-cheat stack (timers, app-switch detection, randomized pools, rate limiting).

Monetization (future phase): freemium core + Expert Pass subscription (deeper trivia, offline map packs, travel discount partnerships), optional cosmetic IAPs, small non-intrusive map-based ads only if ever added (never full-screen interstitials — explicitly ruled out).

Safety (future phase, once messaging/social exists): self-reported age at signup, default teen-safe restrictions under 18, step-up ID/facial-age-estimation verification only for suspicious edge cases (mirrors Meta's current model), team chat only, no open DMs between strangers.

## 11. Technical Plan

* Stack: React (mobile-responsive web app) for v1 — not a native app yet
* Backend: Firebase (Firestore + Auth), free tier — needed specifically because the leaderboard requires shared, cross-user data; simple email/Google sign-in only. The app runs fully without it configured (trip planning, the explore map, and browsing all work), but sign-in and the leaderboard show a "not configured" state until Firebase project keys are added.
* Geolocation: browser Geolocation API — used for both GPS point-claim verification (Section 7) and centering the explore map on the user's live position
* Mapping: Leaflet + OpenStreetMap/CARTO tiles for the in-app explore map, with marker clustering so all 151 landmarks stay legible across regions as far apart as Miami and Milan; free geocoding for the address-autocomplete field via OpenStreetMap Nominatim — no paid map API key required
* Hosting: deployed and live on Vercel; custom domain `landmarkhunters.com` purchased and attached, DNS pointing pending
* No legacy codebase — full rebuild from scratch
* Full native app (React Native + Expo) and offline-first sync remain part of the future full-product plan (Section 10), not required for the current tool-first v1

## 12. Launch / Pilot Plan

Three real regions, fully scoped with actual landmark lists (151 total landmarks):

* Miami (51 landmarks)
* Milan / Monza (50 landmarks)
* Villanova / Main Line / Philadelphia (50 landmarks, combined into one region)

The Milan/Monza and Villanova/Philadelphia regions are tied to real upcoming trips within the next month, which will serve as live field tests for the tool. Miami is the founder's home base pilot region.

What v1 needs to prove before investing further: does this genuinely make trip-planning easier and get used — not point totals, not engagement metrics, just whether the core loop (set interests → get an optimized, bookable itinerary) holds up in real use.

## 13. Business / Legal Status

* No outside funding sought. Self-funded; the only unavoidable costs are Apple ($99/year) and Google Play ($25 one-time) developer fees once mobile packaging happens; free-tier hosting covers early usage; landmark data is largely free (public sources).
* Builder: the app is being built directly via Claude Code rather than hiring an engineer — no funding gap on the technical side, only the founders' own time and decision-making.
* Legal/trademark status: a logo with a ® mark exists from a prior effort; actual registration status is unconfirmed (possibly expired) and not yet independently verified via USPTO. Worth resolving before wide public launch, but not currently blocking development.
* Affiliate program signup (GetYourGuide/Viator/Tiqets) is a required manual step outside of code — needed before real (non-placeholder) booking links and commission tracking can go live.

## 14. What's Explicitly Not in v1

Mayor/Expert rank tiers, Trophy Room, Niche/Founder Niche Waypoints, quizzes/trivia, in-app messaging, subscription/paywall, offline mode, native app packaging, ads. All of this is real, documented design work (Section 10) — parked for a future phase once the tool-first version proves out, not abandoned.
