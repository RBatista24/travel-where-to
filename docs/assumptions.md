# Implementation assumptions

The spec asks that ambiguous requirements are documented rather than silently invented. Each item below is a choice made in code, with where to change it.

## Money & currency
- Money is integer minor units + ISO currency. Mixing currencies throws; there is **no currency conversion in V1**. Providers are asked for the budget's currency, and offers in another currency are dropped.
- Rounding: half away from zero, to the cent.

## Budget
- Budget is soft. Trips up to **10% above** budget are kept and flagged ("€12 above your budget"); beyond that they are dropped. `SearchEngineConfig.budgetTolerance`.
- The budget includes transport, accommodation, airport access (fuel, tolls, parking) and car fuel/tolls. Food is excluded and shown separately.

## Transport
- **Default vehicle** when none is configured: diesel, 6.5 L/100 km, €1.65/L. A notice tells the user. `pricing/src/fuel.ts`.
- **Flights include airport access for every departure airport**, not only non-primary ones: the traveller is assumed to drive and park (default €12/day, nights + 1 days). This keeps Lisbon vs Porto comparisons fair.
- Door-to-door flight time = drive to airport + 120 min airport overhead + flight + 30 min arrival transfer. `SearchEngineConfig`.
- Car route is calculated to the destination's city centre; the hard driving limit applies to that one-way drive.
- Candidate pre-filter for hard driving limits uses straight-line distance at 110 km/h, which can only under-estimate drive time, so it never wrongly excludes.
- Destinations closer than 60 km to the origin are not considered trips.

## Dates
- Flexible windows: every stay of exactly N nights fully inside the window is a candidate; long windows are **sampled evenly to 16** combinations (first and last always kept). `maxStayOptions`.
- Indicative flight prices shortlist the **3 cheapest date combinations per destination** for live searches. Car trips are evaluated on the same shortlisted dates (all sampled dates for car-only searches). `liveStaysPerDestination`.

## Travellers
- Infant: 0–1, child: 2–17, adult: 18+. Ages are required for children and infants and passed to providers.
- Food estimate: child = 0.6 adult, infant not costed. Food days = nights.

## Accommodation
- Structured accommodation filters (stars, rating, distances, types) are hard filters. Facility wishes (pool, heated pool, breakfast…) use requirement priorities.
- **Missing data never passes a hard filter** (an unrated hotel fails "rating ≥ 8").
- A heated pool satisfies "pool"; breakfast included satisfies "breakfast".

## Ranking
- Destination attributes are "present" at score ≥ 60/100 (used for MUST_HAVE and reasons).
- Priority weights inside a component: IMPORTANT 3, MUST_HAVE 2, AVOID 2, PREFERRED 1.
- With no preferences in a component, that component scores 100 for everyone (it cannot change the ordering).
- Missing weather scores a neutral 50 and is flagged; it is never invented.
- Ties: score, then cheaper, then faster, then id.

## Weather
- Mock provider returns `FORECAST` within 10 days of travel, `CLIMATE_AVERAGE` otherwise.

## Destination catalogue
- 25 curated destinations (Portugal-origin, Europe and nearby). Category scores are editorial; climate and food-cost values are **approximate** long-term averages used only for estimates and ranking. Replace with sourced datasets before production.
- Disneyland Paris is a destination like any other (spec §7).

## Relaxation
- Triggered when a search returns 0 results. Each suggestion changes one thing (budget +25% rounded to €50, allow the other transport mode, +2h driving, ±2 days / +1 week flexibility, −1 rating, −1 star, ×2 distance limits, include apartments, MUST_HAVE → IMPORTANT) and is re-run against the same engine. With real providers this should move to indicative-only counting.

## Persistence & infrastructure
- Search history is in memory (`InMemorySearchRepository`). PostgreSQL and Redis are not added yet (dev rule 13). Search IDs are an in-memory sequence: `SEARCH-2026-000123`.
- Packages are consumed as TypeScript source (`exports: ./src/index.ts`) and run with `tsx`; no build step until one is needed.

## Web app
- Next.js App Router per spec §44 (the accommodation portal uses Vite; this project follows the spec). Route files in `src/app` are thin and render `components/pages`.
- Natural language goes through `POST /api/interpret`, served by a deterministic keyword `MockLlmProvider` until a real model is plugged in. Its output is validated with the same schema a real model must satisfy, shown as **AI interpretation**, and only applied when the user presses *Apply*.
- "Saved searches" in V1 = the API's search history (in memory, lost on API restart). Favourites and saved preferences need persistence and come with PostgreSQL.
- Comparison holds up to 4 trips and is addressed by URL: `/results/<searchId>/compare?d=malaga,alicante`.
- Each kind of information has a colour **and** a line style (solid / solid / dashed / dotted) plus an icon, so it never relies on colour alone.

## Real providers (Travelpayouts, openrouteservice, Open-Meteo)
- **Travelpayouts** prices are cached (2–7 days), per adult, economy. Party total = adult fare × (adults + children) + infants × 10% of the adult fare; the basis is written on the cost line. All of them are `INDICATIVE`, also in the "live" phase. One `grouped_prices` call per route and month (exact trip length) feeds both phases; exact-date `prices_for_dates` is only called for routes the month already priced. Responses are cached for 1 hour. Arrival times are not shown (the cache gives no reliable local arrival).
- **openrouteservice**: distance and duration are provider facts; tolls = kilometres on tolled roads (ORS `tollways`) × `TOLL_RATE_EUR_PER_KM` (default €0.09), always an estimate. Routes are cached for 7 days.
- **Open-Meteo**: trips ending within 15 days use the forecast; later trips use averages of the same months over the last 3 full years from the archive (one call per place, cached 30 days). A rainy day = ≥ 1 mm. Free tier is non-commercial only; attribution is in the footer.
- Results carry `sources` so the UI can say per kind of data whether it was real or a mock.

## Live prices (SerpApi, LiteAPI)
- **Verification step:** after ranking, only the top `VERIFY_TOP` (default 5) flight trips get a live Google Flights search through SerpApi (1 search per trip, cached 30 min). A live price replaces the cached one and the trip is re-scored; if nothing is found the trip keeps its cached price with a warning. Relaxation re-runs never call it.
- **SerpApi price unit:** assumed to be the total for all passengers (as Google Flights shows); `pnpm check:providers serpapi` verifies it and `SERPAPI_PRICE_PER_PERSON=true` switches. Children 12+ are sent as adults (Google Flights' rule); babies travel on a lap. The return flight's details need a second call, so only the outbound itinerary is shown.
- **LiteAPI:** one `POST /hotels/rates` per destination and dates, 6 km around the centre, one room for the whole party with real ages, cheapest rate per hotel. Rates are live → Verified (30 min). The rates response has no facilities, so pool requirements can't be confirmed for LiteAPI hotels (missing data never passes a must-have); breakfast comes from the board type. All properties are treated as hotels. LiteAPI has no public booking page, so the UI offers a Booking.com search for the same hotel, dates and group, saying prices may differ.
- **SerpApi Google Hotels** (alternative stays provider): 1 search per destination and dates, so it uses the free quota fast. Google's 1–5 ratings are doubled to our 0–10 scale; amenities are mapped only on clear matches; distances are straight-line from the hotel's coordinates.
- Settings are read from `services/api/.env` or the repo-root `.env`. `SERPAPI_API_KEY` / `LITEAPI_API_KEY` are accepted as aliases; a LiteAPI key alone switches stays to LiteAPI and a SerpApi key alone switches on the live flight check, unless `ACCOMMODATION_PROVIDER` / `FLIGHT_VERIFIER` say otherwise.
- **Travelpayouts sparse cache:** when the exact trip isn't cached, the nearest cached round trip within ±3 days and ±3 nights is used (same route), and the cost line says so ("cached price for a 5-night trip leaving …, no cached price for your exact dates"); flight times are not shown for such borrowed prices and the Aviasales link is built for your dates. If the `pt` market cache is empty, the global cache is tried. The live Google Flights check then prices the exact dates of the top results.
- **Airports and roads:** departure airports use terminal coordinates and openrouteservice snaps any point to the nearest road (`radiuses: -1`); a failed airport drive is reported by airport code.

## Theme parks (owner-approved scope change, 5 Oct 2026)
- Spec §4/§7 kept parks as plain destinations; the owner asked for park hotels and tickets. Implemented as data on the destination (`park`), not as an attraction-booking system.
- **Official hotels only** (`accommodation.parkHotelsOnly`): stays are matched by name against the park's official hotels (Disneyland Paris: the 7 Disney Hotels; only the Disneyland Hotel is at the park entrance — "inside the park" is read as "official on-site hotels"). Matching ignores accents, apostrophes and punctuation. Providers are asked for a wider list in that case; if none of the official hotels has rooms, the destination is left out with that reason.
- **Tickets** (`parkTickets`, included by default for park destinations): there is no ticket API, so the price is an ESTIMATE: middle of the published 2026 range for the ticket length (1 day/1 park €56–€105; 2 days €142–€220; 3 days €210–€300; 4 days €260–€360, 2 parks) × everyone aged 3+. Child (3–11) prices aren't published, so children are priced as adults. Days default to the number of nights, capped at the longest ticket (4). Counts towards the budget; links to the official ticket page.

## Flight preferences and days of the week (owner request, 5 Oct 2026)

- **Direct only, outbound and return departure times** are hard filters (the user said "only"). Time of day is local time at the departure airport: night 00–05h, morning 05–12h, afternoon 12–18h, evening 18–24h. No selection = any time.
- Providers are asked to filter when they can: Travelpayouts `direct=true`; Google Flights (SerpApi) `stops=1`, `outbound_times`, `return_times`. Google takes one hour range per leg, so non-adjacent choices (morning + evening) send the span and the engine re-checks what it can see.
- **Missing details don't exclude**: a Travelpayouts price borrowed from nearby dates has no flight times, and Google's round-trip answer doesn't detail the return flight. Those trips stay, with a warning "Not confirmed that the … ; check before booking". Known mismatches are always dropped. This is a deliberate exception to "missing data never passes" — otherwise the sparse cache would empty most searches.
- **Days of the week** (flexible windows only): presets Weekend Fri → Sun, Long weekend Thu → Sun, Long weekend Fri → Mon, or any leave/come-back day. Each trip leaves on that day and returns on the next return day, so the nights follow from the pattern. "Long weekend" typed in the describe box means Fri → Mon.
- Relaxations: "Allow flights with stops", "Any flight departure time", "Any days of the week".
- Nights are now per stay everywhere (food, parking, park tickets), since a pattern can mix lengths.

## Budget views: cheapest and best use of the budget (owner request, 5 Oct 2026)

- Every search also returns `picks`: up to 5 **cheapest** trips and up to 5 **best for your budget** trips, one trip per place. No extra provider calls: they are chosen from trips already priced.
- **Cheapest**: lowest trip total per place, cheapest first (same must-haves and filters as always).
- **Best for your budget**: per place, the best trip costing **75–100% of the budget** (no tolerance above it), judged price aside: 70% the Match Score without its budget part (`score.withoutPrice`), 30% stay comfort (stars, then guest rating). Places with no trip in that band come last, with their best trip under it. So a bigger budget shows nicer hotels and further places instead of the same cheap trips.
- A place's pick can be a different trip (other hotel or dates) from its best-match trip; pick ids end in `:cheapest` / `:full-budget`, and compare links use those ids.
- Only the best-match top 5 get the live flight check; picks that are the same trip show the checked price, others keep the indicative one.

## Long-haul destinations, region filter and clearer "left out" reasons (5 Oct 2026)

- First real test (€4,000, 7 nights, May 2027) returned only Alicante. Causes: the catalogue had only 2 places outside Europe (Marrakech, Agadir), and a Travelpayouts flight that didn't match the time filter was silently dropped, so the place was then reported with the wrong reason ("…accommodation requirements").
- Added 19 places outside Europe: Cape Verde (Sal), Salvador, Fortaleza, Rio, Punta Cana, Cancún, Varadero, Orlando, New York, Dubai, Antalya, Hurghada, Djerba, Zanzibar, Cape Town, Mauritius, Maldives, Phuket, Bali. Scores, climate and food costs are editorial approximations like the rest of the catalogue (to be sourced).
- `Destination.region` (Europe, Africa, Americas & Caribbean, Middle East & Turkey, Asia, Indian Ocean islands). Canaries, Madeira and Azores count as Europe; Antalya as Middle East & Turkey; Egypt as Africa. "Surprise me" can be limited to regions, with an "Outside Europe" shortcut; places elsewhere aren't listed as left out.
- Left-out reasons now follow the order of checks: no flights found for your dates → no flights matching your flight preferences → no places to stay → no stay matched your filters → over budget (with the cheapest trip found there).
- Travelpayouts keeps one off-time flight when none matches your times, so the reason can be given.
- Far-future dates: Travelpayouts only has prices people searched recently; 6+ months ahead many routes have none, so those places are left out with "No flights found for your dates".

## Quiet routes and diagnosing empty searches (5 Oct 2026)

- Travelpayouts last resort: when nothing is cached within ±3 days/nights, a trip leaving up to **14 days** away (same length ±3 nights, also in the neighbouring month) is used, labelled "cached price for a N-night trip leaving …". Helps long-haul routes and dates 6+ months ahead. The top 5 still get the live Google Flights check.
- If indicative flight pricing fails for a place, only 3 spread-out dates are tried live (was: every date), so an outage or rate limit can't snowball into hundreds of calls.
- Empty results open the "why not shown" list, grouped by reason with counts.
- `pnpm explain [searchId]` (or `pnpm run why`; plain `pnpm why` is a pnpm built-in) prints the last search's left-out reasons and provider errors from the running API.

## Travelpayouts round trips and the flight estimate fallback (5 Oct 2026)

- Bug: `grouped_prices` without `return_at` returns **one-way** tickets (API docs: "omit for one-way"); we dropped them, so month look-ups found almost nothing (popular routes sometimes slipped through). Now each month look-up asks for round trips returning that month and the next (2 calls, merged).
- The cache only holds trips searched in the last ~2 days (kept 7 days). Long-haul trips months ahead are often missing. With `FLIGHT_PROVIDER=travelpayouts`, a route with **no** cached price now gets **our estimate** instead of being dropped: round trip per seat ≈ €150 + €0.075/km (great-circle), children as adults, babies ~10%; no flight times; non-stop assumed up to 8,000 km. It is ESTIMATED (dashed "Our estimate"), counts towards the budget, the trip carries a warning, a notice says how many results use it, and the link opens Google Flights for those dates. The top 5 are re-priced live by SerpApi.
- Turn it off with `FLIGHT_ESTIMATE_FALLBACK=false` (places without cached prices are then left out as before). Provider errors are never replaced by estimates.
