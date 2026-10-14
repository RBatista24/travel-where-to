# Travel Where To

Travel Discovery Engine: you choose **when** you can travel, **who** is travelling, **how much** you want to spend and **what** you want. It finds **where** you can go, as concrete, ranked trips.

The V1 spec is the source of truth: [`docs/spec-v1.md`](docs/spec-v1.md). Assumptions made while implementing are in [`docs/assumptions.md`](docs/assumptions.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 Domain | entities, criteria, travellers, money/confidence, cost model, ranking | ✅ |
| 2 Mock search engine | candidates → mock flights/hotels/routing/weather → costs → Match Score → top 10, relaxation, partial failures | ✅ |
| 3 UI | Next.js + shadcn/ui (atomic design): search form, natural-language box, interpreted requirements, results, details, comparison, recent searches | ✅ |
| 4 LLM | `LlmProvider` port, validated `TravelIntent`, keyword-based `MockLlmProvider` behind `POST /api/interpret`; real model + conversational refinement still to do | 🟡 |
| 5 Flights | Travelpayouts (Aviasales cached prices) adapter | ✅ (indicative only) |
| 7 Routing | openrouteservice adapter (real routes, estimated tolls) | ✅ |
| 8 Weather | Open-Meteo adapter (forecast / recent-years averages) | ✅ |
| 6 Stays | LiteAPI (main) or SerpApi Google Hotels | ✅ |
| 5b Live flights | SerpApi Google Flights check of the top results | ✅ |
| 9 | hardening | - |

## Real data

Each provider is chosen in `services/api/.env` (copy `services/api/.env.example`). Anything not configured stays a mock, and every result says which data was real.

| Data | Setting | Needs |
|---|---|---|
| Flights | `FLIGHT_PROVIDER=travelpayouts` | `TRAVELPAYOUTS_TOKEN` (free account, Profile → API token); optional `TRAVELPAYOUTS_MARKER` |
| Driving routes | `ROUTING_PROVIDER=openrouteservice` | `ORS_API_KEY` (free account) |
| Weather | `WEATHER_PROVIDER=open-meteo` | nothing (free tier is non-commercial only) |
| Stays | `ACCOMMODATION_PROVIDER=liteapi` (or `serpapi`) | `LITEAPI_KEY` (free account) / `SERPAPI_KEY` |
| Live check of the top flights | `FLIGHT_VERIFIER=serpapi`, `VERIFY_TOP=5` | `SERPAPI_KEY` (free plan: 250 searches/month) |

After filling in `.env`, run `pnpm check:providers` once: it calls each configured provider with a small test search and tells you whether SerpApi prices are per person or total.

Travelpayouts prices come from Aviasales' cache of recent searches, per adult, so they are always shown as **Indicative**, scaled to the group, with a link that opens the live search for the whole group. Mock prices are fictional and deterministic; mock deep links point to the reserved `.invalid` domain.

## Getting started

```bash
nvm use            # Node 22
pnpm install
pnpm test          # unit + integration tests (node:test via tsx)
pnpm typecheck
pnpm demo          # runs the spec §56 query and prints ranked trips
pnpm dev           # API on :4000 and web app on http://localhost:3000
```

The web app forwards `/api/*` to the API (`TRAVEL_API_URL`, default `http://localhost:4000`), so the browser never talks to providers.

Example search:

```bash
curl -s localhost:4000/api/searches -H 'content-type: application/json' -d '{
  "origin": { "label": "Quinta do Anjo", "coordinates": { "lat": 38.566, "lon": -8.94 }, "countryCode": "PT" },
  "dates": { "kind": "FLEXIBLE", "windowStart": "2026-11-01", "windowEnd": "2026-11-30", "nights": 4 },
  "travellers": [{ "type": "ADULT" }, { "type": "ADULT" }, { "type": "CHILD", "age": 5 }],
  "budget": { "amount": 1000, "currency": "EUR" },
  "transport": { "modes": ["FLIGHT", "CAR"], "driving": { "maxHours": 5, "preferredMaxHours": 4.5 } },
  "requirements": [
    { "kind": "DESTINATION", "attribute": "beach", "priority": "MUST_HAVE" },
    { "kind": "FACILITY", "facility": "heatedPool", "priority": "IMPORTANT" }
  ],
  "accommodation": { "types": ["HOTEL", "APARTMENT"], "minRating": 8 },
  "weather": { "preferWarm": true }
}'
```

API: `GET /health`, `GET /api/destinations`, `POST /api/interpret`, `POST /api/searches`, `GET /api/searches`, `GET /api/searches/:id`.

## Layout

```
apps/web                     Next.js 15 + Tailwind v4 + shadcn/ui, atomic design
  src/components/atoms         shadcn primitives (components.json "ui" alias points here)
  src/components/molecules     small combinations: InfoTag, MatchScore, Freshness, Stepper…
  src/components/organisms     feature blocks: SearchForm sections, ResultCard, CostLedger, TripDetailSheet…
  src/components/templates     AppShell, PageLayout, ResultsLayout
  src/components/pages         one per route; src/app/** route files only render these
services/api                 HTTP API + composition root (wires mock providers)
packages/
  shared                     Money (integer minor units), local dates, geo, clock, seeded RNG
  domain                     Entities, criteria, provider ports, results. No provider/LLM code.
  pricing                    Fuel, tolls, airport access, food estimate, cost breakdown, budget
  ranking                    Hard constraints + deterministic Match Score and reasons
  destination-engine         Curated destination catalogue, candidate generation, date options
  flight-providers           MockFlightProvider (+ raw payload validation/mapping)
  accommodation-providers    MockAccommodationProvider (+ raw payload validation/mapping)
  routing-providers          MockRoutingProvider
  weather-providers          MockWeatherProvider
  llm                        LlmProvider port, TravelIntent schema & validation
  search-engine              Discovery pipeline orchestration, relaxation, observability
```

`infrastructure/postgres|redis` will be added when they solve a real requirement.

## Principles enforced in code

- **No fabricated prices.** Every non-estimated price carries `provider`, `providerOfferId`, `retrievedAt`, `expiresAt?` and a deep link. Fuel, tolls, parking and food are always `ESTIMATED`. Expired prices are discarded.
- **Food is outside the budget** and shown separately (`estimatedExtras`). `bookableTotal` vs `estimatedInBudget` splits the trip total.
- **Deterministic Match Score** (`packages/ranking`): weights 27/25/15/15/8/10, configurable; MUST_HAVE failures exclude, IMPORTANT/PREFERRED/AVOID weight the score. Reasons are generated from data, not by an LLM.
- **Providers are replaceable**: the engine only sees the ports in `packages/domain/src/ports.ts`. Swapping a mock for Skyscanner/Booking.com happens in `services/api/src/composition.ts`.
- **No provider can crash a search**: each call is timed out, logged with the search ID, and turned into a `ProviderIssue` + user-facing notice ("Flight pricing was unavailable for 3 destinations.").
- **Never “No results”**: when nothing matches, the engine re-runs single-change relaxations and reports how many options each would unlock.
