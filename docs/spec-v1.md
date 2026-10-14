# Travel Discovery Engine
## Product & Technical Specification — V1

**Status:** Approved for V1 development  
**Document purpose:** Source of truth for product scope, behaviour, architecture and technical requirements.

---

# 1. Product Vision

Travel Discovery Engine is a travel search engine designed to solve a different problem from traditional travel websites.

Traditional travel search usually starts with:

> **Destination → dates → transport → accommodation → price**

This product reverses the process:

> **Origin + dates + travellers + budget + preferences → possible destinations → concrete trips**

The user does not necessarily need to know where they want to go.

The core product promise is:

> **You choose when you can travel, who is travelling, how much you want to spend and what you want. We find where you can go.**

The product should return **real, actionable travel options**, not generic AI-generated travel suggestions with imaginary prices.

---

# 2. Core Product Principle

The application must strictly separate:

### Real provider data

Examples:

- flight prices
- flight availability
- accommodation prices
- accommodation availability
- hotel ratings
- hotel facilities
- distances
- route distances
- travel times

from:

### Estimated data

Examples:

- fuel costs
- food costs
- parking estimates
- other local expenses

from:

### AI-generated content

Examples:

- natural-language interpretation of user requirements
- explanation of recommendations
- comparison summaries
- conversational interaction

## Critical rule

**The LLM must never invent or fabricate concrete prices or availability.**

If the application displays:

> Flight: €284

there must be a provider result supporting that value.

If the application displays:

> Food estimate: €220

it must explicitly be marked as an estimate.

---

# 3. V1 Product Scope

V1 must support:

- Portugal as the initial origin market
- any destination supported by the destination database/providers
- exact travel dates
- flexible date ranges
- exact number of nights
- adults
- children
- babies
- child ages
- global travel budget
- flight travel
- car travel
- comparison between flight and car when both are viable
- destination discovery
- known-destination search
- natural-language preferences
- structured preferences
- must-have requirements
- preferred requirements
- negative requirements
- hotel search
- apartment search
- hotel stars
- accommodation rating
- swimming pool
- heated swimming pool
- breakfast
- distance to city centre
- distance to beach
- weather as a search criterion
- automatic destination discovery
- Match Score
- top 10 results
- comparison between results
- real provider prices where available
- price confidence indicators
- saved searches
- saved preferences
- favourites
- conversational refinement of an existing search
- deep links to external booking providers

---

# 4. Explicitly Out of Scope for V1

The following must NOT be implemented in V1 unless specifically required later:

- Airbnb integration
- activity/attraction booking
- event/concert search
- dedicated theme park/event entities
- full itinerary planning
- restaurant recommendations
- restaurant booking
- car rental
- price alerts
- automatic recurring monitoring
- multiple user personas/profiles
- budget allocation by category
- advanced food-budget controls
- booking/payment inside the application
- loyalty programmes
- travel insurance
- visa management
- loyalty points
- flights + hotel package booking

The architecture should allow these capabilities to be added later without major restructuring.

---

# 5. Search Modes

The application must support four primary search modes.

## 5.1 Known destination

Example:

> "I want to go to Rome from 14 to 18 November."

The destination is fixed.

---

## 5.2 Destination discovery

Example:

> "I have €1,000, four nights and want a beach destination."

The system determines possible destinations.

---

## 5.3 Destination type

Examples:

> "I want a European city."

> "I want a beach destination."

> "I want a family trip."

The system discovers destinations matching those characteristics.

---

## 5.4 Natural-language travel request

Example:

> "I want a romantic getaway near the sea, with good restaurants and a nice hotel, but I don't want a party area."

The system must convert the natural-language request into structured requirements.

The interpreted requirements should be shown to the user and remain editable.

---

# 6. Example: Destination Discovery

Input:

```text
2 adults
1 child, age 5
4 nights
November
Budget: €1,000
Beach or city
Heated pool
Within 1 km of city centre
Maximum 5 hours driving
```

Possible results:

```text
1. Málaga       €812    94% Match
2. Alicante     €743    91% Match
3. Tenerife     €927    89% Match
4. Seville      €634    88% Match
...
```

The system should explain why each destination matches the request.

---

# 7. Example: Flexible Destination Search

Input:

```text
Origin: Portugal
Travel period: March 1 → June 30
Duration: 3 nights
Travellers: 2 adults + 1 child
Budget: €1,000
Destination: Disneyland Paris
```

For V1, Disneyland Paris should simply be treated as a destination/location.

The system should find the best weekend/date combination according to the Match Score.

Example:

```text
14–16 March     €800
21–23 March     €710   ← Best Match
4–6 April       €870
```

The system should select the best combination according to the configured ranking model, not simply the cheapest price.

---

# 8. Travellers

The search model must support:

```typescript
Traveller {
  type: ADULT | CHILD | INFANT;
  age?: number;
}
```

Examples:

```text
2 adults
1 child, age 5
```

or:

```text
2 adults
2 children, ages 3 and 7
1 infant
```

Actual ages must be passed to external providers whenever supported.

---

# 9. Dates

V1 supports:

### Exact dates

Example:

```text
2026-11-14 → 2026-11-18
```

### Flexible date window

Example:

```text
November 1 → November 30
Duration: exactly 4 nights
```

The system should evaluate valid date combinations within the selected window.

### V1 constraint

The number of nights is exact.

Flexible trip duration is a future feature.

---

# 10. Budget

The primary budget is a **global trip budget**.

Example:

```text
Budget = €1,000
```

The primary budget includes:

- transport
- accommodation
- known activity costs, when available
- known transportation costs
- known additional costs

Food is NOT included in the primary budget in V1.

Food should be displayed separately as an estimate.

Example:

```text
Bookable / concrete trip cost: €812
Estimated food cost:            €220
Estimated overall spend:      €1,032
```

---

# 11. Budget Flexibility

If the user specifies:

```text
Budget: €1,000
```

a result slightly above budget may still be displayed.

Example:

```text
€1,012
```

should not automatically be excluded.

The result should be marked as above budget.

Example:

> ⚠️ €12 above your budget

Hard budget constraints can be supported in the future.

---

# 12. Cost Confidence

Every monetary value must have a confidence classification.

```typescript
enum PriceConfidence {
  VERIFIED,
  INDICATIVE,
  ESTIMATED
}
```

### VERIFIED

Recently retrieved from a provider.

### INDICATIVE

Provider-generated indicative price that is not guaranteed to be currently bookable.

### ESTIMATED

Calculated by our application.

Examples:

```text
Flight       €284   VERIFIED
Hotel        €528   VERIFIED
Fuel         €107   ESTIMATED
Food         €220   ESTIMATED
```

---

# 13. Price Timestamp

Provider prices must store:

```typescript
retrievedAt: Date;
expiresAt?: Date;
```

The UI should be able to display:

> Price verified 4 minutes ago

or:

> Indicative price — may have changed

The application must clearly communicate that prices and availability can change before booking.

---

# 14. Transport

V1 supports:

```text
FLIGHT
CAR
```

When both are viable, both should be considered.

Example:

| | Car | Flight |
|---|---:|---:|
| Cost | €680 | €741 |
| Travel time | 5h10 | 1h20 |
| Match | 91 | 94 |

The ranking engine determines which option is preferable based on user requirements.

---

# 15. Airports

For flight searches, the system should consider relevant airports in Portugal rather than blindly assuming Lisbon.

Potential airports include:

- Lisbon
- Porto
- Faro
- other relevant Portuguese airports

However, airport selection must consider the user's actual origin.

Example:

```text
Origin: Quinta do Anjo

Lisbon Airport:
45 min drive

Porto Airport:
3h drive
```

A €100 cheaper flight from Porto should not automatically be considered €100 cheaper.

---

# 16. Airport Access Cost

When an airport different from the user's primary airport is considered, the system should be capable of calculating:

```text
Origin → Airport
Fuel
Tolls
Parking
```

Example:

```text
Flight                       €150
Fuel to airport               €35
Tolls                          €20
Airport parking                €30
---------------------------------
Effective transport cost      €235
```

The architecture must support this calculation.

---

# 17. Car Travel

The user may configure a preferred vehicle:

```typescript
Vehicle {
  fuelType;
  consumptionPer100Km;
  fuelPrice;
}
```

Example:

```text
Fuel type: Diesel
Consumption: 6.2 L/100km
Fuel price: €1.65/L
```

Fuel cost:

```text
distanceKm * 2
----------------------------- × fuel consumption
100
× fuel price
```

The system should also support toll estimates when data is available.

---

# 18. Driving Constraints

The user can define both hard and soft constraints.

### Hard constraint

> Never drive more than 5 hours.

A destination exceeding this limit should be excluded.

### Soft preference

> Prefer driving less than 4h30.

A destination exceeding 4h30 may still be considered but receives a lower score.

---

# 19. Accommodation

V1 supports:

### Types

- Hotel
- Apartment

### Filters

- minimum stars
- minimum rating
- swimming pool
- heated swimming pool
- breakfast
- maximum distance from city centre
- maximum distance from beach

The user may combine multiple filters.

---

# 20. Location-Based Accommodation Search

The system should support requirements such as:

> Within 1 km of the city centre.

and:

> Within 500 m of the beach.

The application should determine the relevant reference coordinates automatically.

The user should not need to know the name or coordinates of the city centre.

---

# 21. Preferences

Preferences may be entered through structured controls or natural language.

Example:

> "I want a beach destination, but not an area full of nightclubs. I want restaurants nearby and activities for children."

The application should interpret this into structured requirements such as:

```json
{
  "beach": true,
  "familyFriendly": true,
  "restaurantsNearby": true,
  "nightlife": false
}
```

The user must be able to review and edit the interpreted requirements.

---

# 22. Requirement Priority

Requirements support four conceptual levels:

### MUST_HAVE

Failure excludes the result.

### IMPORTANT

Strong influence on ranking.

### PREFERRED

Positive ranking influence.

### AVOID

Negative ranking influence.

Example:

```text
MUST_HAVE:
  beach

IMPORTANT:
  heated pool

PREFERRED:
  breakfast

AVOID:
  nightlife
```

---

# 23. Destination Categories

V1 should support destination concepts such as:

- beach
- city
- nature
- family
- romantic
- culture
- gastronomy
- snow
- theme parks
- tropical

These are destination attributes used by the discovery and ranking engines.

They are NOT separate booking systems.

---

# 24. Destination Database

V1 should use a curated destination database.

Initial scope:

> Portugal-origin travel to Europe and nearby destinations.

The architecture must support expansion to worldwide destinations.

Each destination should contain structured information such as:

```typescript
Destination {
  id;
  name;
  country;
  coordinates;
  airports;
  cityScore;
  beachScore;
  familyScore;
  natureScore;
  romanticScore;
  climateMetadata;
}
```

The LLM must not be responsible for inventing the destination catalogue.

---

# 25. Weather

Weather is a search criterion in V1.

Example:

> Minimum temperature: 20°C

or:

> Prefer warm destinations.

Weather contributes to ranking.

It should not automatically determine whether a destination is a beach destination.

Weather information should include appropriate confidence based on how far in advance the trip is.

---

# 26. Food Cost

V1 should provide an automatic food-cost estimate based on the destination.

The system may use cost-of-living data.

Example:

```text
Estimated food cost:
€220
```

This is always:

```text
PriceConfidence = ESTIMATED
```

Food cost is displayed separately from the main travel budget.

Advanced food-budget modes are V2.

---

# 27. Discovery Engine

The discovery pipeline should be:

```text
User request
      ↓
Natural-language interpretation
      ↓
Structured requirements
      ↓
Hard constraint filtering
      ↓
Destination candidate generation
      ↓
Transport discovery
      ↓
Accommodation discovery
      ↓
Cost calculation
      ↓
Ranking
      ↓
Top results
```

---

# 28. Flight Discovery

The preferred initial provider is Skyscanner, subject to obtaining the appropriate API access.

Skyscanner provides:

### Indicative Prices

Useful for destination discovery.

### Live Prices

Useful for concrete, bookable flight searches.

The architecture must distinguish:

```text
IndicativeFlightSearch
LiveFlightSearch
```

The indicative phase should be used to reduce the number of destinations requiring live searches.

Example:

```text
100 candidate destinations
        ↓
Indicative pricing
        ↓
30 viable destinations
        ↓
Live pricing
        ↓
10–15 serious candidates
```

---

# 29. Accommodation Discovery

The preferred initial accommodation provider is Booking.com Demand API, subject to partner/API access.

The provider abstraction should support:

- availability
- price
- occupancy
- children
- room type
- rating
- stars
- facilities
- distance
- deep link

The application should not assume that Booking.com is the only future provider.

---

# 30. Provider Abstraction

All external providers must be accessed through interfaces.

Example:

```typescript
interface FlightProvider {
  searchIndicative(
    request: FlightDiscoveryRequest
  ): Promise<IndicativeFlightResult[]>;

  searchLive(
    request: FlightSearchRequest
  ): Promise<FlightOffer[]>;
}
```

```typescript
interface AccommodationProvider {
  search(
    request: AccommodationSearchRequest
  ): Promise<AccommodationOffer[]>;
}
```

```typescript
interface RoutingProvider {
  calculateRoute(
    request: RouteRequest
  ): Promise<RouteResult>;
}
```

```typescript
interface WeatherProvider {
  getForecast(
    request: WeatherRequest
  ): Promise<WeatherResult>;
}
```

Providers must be replaceable without modifying the domain or ranking logic.

---

# 31. LLM Abstraction

The LLM must also be provider-independent.

Example:

```typescript
interface LlmProvider {
  interpretTravelRequest(
    request: string
  ): Promise<TravelIntent>;

  explainRecommendation(
    recommendation: Recommendation
  ): Promise<string>;
}
```

The initial implementation may use Claude.

However, the product architecture must not depend on Claude specifically.

Future providers may include:

- OpenAI
- Gemini
- local models
- other commercial models

Claude is primarily the development assistant for this project and is not required to be the final production LLM.

---

# 32. LLM Responsibilities

The LLM may:

- interpret natural-language requirements
- convert natural language to structured criteria
- explain recommendations
- compare results
- interpret follow-up requests
- help users modify constraints
- generate natural-language summaries

The LLM must NOT:

- invent prices
- invent availability
- invent hotel facilities
- invent flight schedules
- invent distances
- override hard constraints
- independently determine the final price

---

# 33. Ranking Engine

Ranking must be deterministic and testable.

Initial weighting:

```text
Budget                 27%
Preferences            25%
Transport              15%
Accommodation          15%
Location                8%
Weather                10%
```

These weights are configurable.

The ranking engine must also account for requirement priority.

A MUST_HAVE failure excludes the result.

The system should produce a structured score breakdown.

Example:

```json
{
  "total": 94,
  "budget": 97,
  "preferences": 95,
  "transport": 92,
  "accommodation": 94,
  "location": 91,
  "weather": 87
}
```

---

# 34. Match Score

Every recommendation should have a Match Score.

Example:

> **94% Match**

The score must be based on structured data and deterministic calculations.

The LLM may explain the score but must not calculate it.

Example:

```text
Why 94%?

✓ Within budget
✓ Beach within 600m
✓ Hotel rating 8.8
✓ Heated pool
✓ Direct flight
⚠ Weather slightly below preferred temperature
```

---

# 35. Search Results

The initial UI should display the top 3 results prominently.

The user can expand to:

> **View all 10 results**

Each result should contain:

- destination
- country
- Match Score
- transport
- accommodation
- total concrete cost
- estimated additional costs
- budget difference
- weather
- relevant preference matches
- price confidence
- provider timestamps
- booking/deep links

---

# 36. Comparison

Users can select multiple trips and compare them.

Example:

| | Málaga | Alicante | Seville |
|---|---:|---:|---:|
| Match | 94% | 91% | 88% |
| Total | €812 | €743 | €634 |
| Hotel rating | 8.8 | 8.5 | 8.9 |
| Beach | ★★★★★ | ★★★★★ | ★★ |
| Family | ★★★★★ | ★★★★ | ★★★★ |
| Transport | Flight | Flight | Car |

---

# 37. Constraint Relaxation

If no result satisfies all requirements, the application must not simply return:

> No results.

It should identify ways to obtain more options.

Example:

```text
No complete match found.

Possible changes:

€650 budget → 8 options
+2 days flexibility → 14 options
Allow car → 21 options
Hotel rating ≥ 7.5 → 31 options
```

This is a core product feature.

---

# 38. Conversational Refinement

After receiving results, users can modify the search conversationally.

Examples:

> "Increase the budget to €1,200."

> "What if we don't fly?"

> "What if we accept a hotel rated 7.5?"

> "What if we go for only three nights?"

The system should convert the request into a modified structured search and execute the search again.

The conversational interface must operate on top of the search engine rather than becoming a separate chatbot system.

---

# 39. Saved Preferences

Users can save:

- preferred origin
- traveller configuration
- vehicle
- accommodation preferences
- transport preferences
- recurring requirements

These preferences must remain editable.

Example:

```text
Family preferences

2 adults
1 child
Hotels ≥ 8
Heated pool preferred
Maximum driving: 5h
```

---

# 40. Search History

Each search should be stored.

Conceptually:

```text
Search
├── criteria
├── interpreted requirements
├── candidate destinations
├── provider results
├── prices
├── ranking
├── recommendations
└── timestamp
```

This allows future comparison and debugging.

---

# 41. Favourites

Users can save:

- destinations
- specific trips
- accommodation
- searches

Price alerts are V2.

---

# 42. Booking

V1 does NOT process bookings or payments inside the application.

Flow:

```text
Search
   ↓
Compare
   ↓
Select offer
   ↓
Deep link
   ↓
External provider
   ↓
Booking
```

The application should retain provider attribution information where required for affiliate tracking.

---

# 43. Recommended Architecture

```text
                    ┌───────────────────┐
                    │       WEB         │
                    │ Next.js / React   │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │    Travel API     │
                    │ Node + TypeScript │
                    └─────────┬─────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
   Destination Engine   Search Engine       User/Profile
          │                   │
          │         ┌─────────┼─────────┐
          │         ▼         ▼         ▼
          │      Flights    Hotels    Routing
          │      Provider   Provider  Provider
          │         │         │         │
          └─────────┴─────────┴─────────┘
                              │
                              ▼
                       Cost Engine
                              │
                              ▼
                       Ranking Engine
                              │
                              ▼
                         LLM Adapter
                              │
                              ▼
                      Natural Language
```

---

# 44. Technology Stack

Recommended V1 stack:

### Frontend

- Next.js
- React
- TypeScript

### Backend

- Node.js
- TypeScript

### Database

- PostgreSQL

### Cache

- Redis

### LLM

- Provider abstraction
- Claude initially if appropriate

### External providers

- Skyscanner for flights
- Booking.com for accommodation
- Routing provider abstraction
- Weather provider abstraction

Provider selection must remain configurable.

---

# 45. Repository Structure

Recommended initial structure:

```text
travel-discovery/
│
├── apps/
│   └── web/
│
├── services/
│   └── api/
│
├── packages/
│   ├── domain/
│   ├── pricing/
│   ├── ranking/
│   ├── destination-engine/
│   ├── flight-providers/
│   ├── accommodation-providers/
│   ├── routing-providers/
│   ├── weather-providers/
│   ├── llm/
│   └── shared/
│
├── infrastructure/
│   ├── postgres/
│   └── redis/
│
├── docs/
│
└── README.md
```

---

# 46. Database Design Principles

PostgreSQL is the system of record.

Provider offers must be stored with:

```typescript
provider
providerOfferId
price
currency
retrievedAt
expiresAt
confidence
```

Provider-specific data should not leak into the domain model.

Use normalized domain models and provider adapters.

---

# 47. Caching

Redis should be used for:

- temporary search results
- provider response caching
- rate limiting
- deduplication
- live search sessions
- polling state

Do not use Redis as the permanent system of record.

---

# 48. Mock Providers

Development must NOT depend on external API approval.

Before real providers are connected, implement:

```text
MockFlightProvider
MockAccommodationProvider
MockRoutingProvider
MockWeatherProvider
```

The complete search engine and UI must be capable of running using mocks.

Later replace:

```text
MockFlightProvider
        ↓
SkyscannerFlightProvider
```

and:

```text
MockAccommodationProvider
        ↓
BookingAccommodationProvider
```

without changing the core domain logic.

---

# 49. Testing Requirements

The project must include unit and integration tests for:

### Pricing

- fuel calculation
- airport access costs
- round trips
- currency handling
- budget calculations

### Constraints

- hard constraints
- soft preferences
- children
- dates
- driving limits

### Ranking

- deterministic scores
- requirement priorities
- budget weighting
- preference weighting

### Providers

- provider response mapping
- error handling
- missing data
- expired prices

### Search engine

- known destination
- destination discovery
- no results
- multiple transport modes
- flexible date windows

No provider should be able to crash the entire search.

---

# 50. Error Handling

External APIs are unreliable.

The system must handle:

- timeout
- rate limiting
- unavailable provider
- incomplete response
- expired price
- invalid offer
- provider authentication failure
- partial results

If one provider fails, the system should return partial results where possible.

Example:

> "We found 6 destinations. Flight pricing was unavailable for 3 additional destinations."

Never fabricate missing data.

---

# 51. Observability

Every search should have a unique ID.

Example:

```text
SEARCH-2026-000123
```

Provider calls should be traceable to the search.

Log:

- provider
- request type
- duration
- status
- error
- number of results
- cache hit/miss

Never log sensitive personal information unnecessarily.

---

# 52. Security

API keys must never be exposed to the frontend.

All provider API calls must happen server-side.

Secrets must be stored using environment variables/secrets management.

The frontend must never directly call:

- Skyscanner credentials
- Booking credentials
- LLM API keys
- database credentials

---

# 53. V1 Development Strategy

Development should happen in this order.

## Phase 1 — Domain

Implement:

- entities
- search criteria
- travellers
- destinations
- preferences
- cost model
- ranking model

No external APIs.

---

## Phase 2 — Mock Search Engine

Implement:

```text
User request
→ destination candidates
→ mock flights
→ mock hotels
→ costs
→ ranking
→ results
```

---

## Phase 3 — UI

Implement:

- search form
- natural-language input
- interpreted requirements
- results
- result details
- comparison
- saved searches

---

## Phase 4 — LLM Integration

Implement:

- natural-language interpretation
- requirement extraction
- conversational modifications
- recommendation explanations

The LLM must output structured data that is validated before being used.

---

## Phase 5 — Real Flight Provider

Implement the Skyscanner adapter.

The rest of the application must remain unchanged.

---

## Phase 6 — Real Accommodation Provider

Implement Booking.com adapter.

Again, the domain must remain provider-independent.

---

## Phase 7 — Routing

Implement the selected routing provider.

---

## Phase 8 — Weather

Implement weather provider.

---

## Phase 9 — Production Hardening

Implement:

- authentication
- rate limiting
- monitoring
- caching
- provider quotas
- error handling
- analytics
- affiliate attribution

---

# 54. Development Rules

The implementation must follow these principles:

1. **TypeScript strict mode.**
2. Do not use `any`.
3. Keep domain logic independent from providers.
4. Keep LLM logic independent from the domain.
5. Use interfaces for external providers.
6. Validate all external API responses.
7. Never trust provider data blindly.
8. Never let an LLM generate authoritative prices.
9. Write tests for business-critical calculations.
10. Prefer small composable services over large classes.
11. Keep provider-specific models inside provider adapters.
12. Do not prematurely implement V2 features.
13. Do not add infrastructure unless it solves a real V1 requirement.
14. Keep all monetary calculations explicit and deterministic.
15. Store timestamps for provider-derived prices.
16. Make currency handling explicit.
17. Never expose provider credentials to the client.

---

# 55. Product Quality Requirement

The most important quality characteristic is **trust**.

The user must be able to understand:

> Where did this price come from?

> When was it checked?

> Is it bookable?

> Is this an estimate?

> Why is this destination recommended?

The application must always distinguish between:

**FACT**

**INDICATIVE DATA**

**ESTIMATE**

**AI INTERPRETATION**

---

# 56. V1 Success Criteria

The MVP should successfully answer:

> "I have €1,000, four nights, two adults and one child, and I want a warm beach destination in November. Where can I go?"

and return several **concrete, ranked travel options** containing:

- destination
- transport
- accommodation
- concrete prices where available
- estimated costs where necessary
- total trip cost
- Match Score
- explanation
- booking links

The user should be able to compare the results and change their requirements without starting from scratch.

---

# 57. Final Product Principle

The application is NOT:

> "Ask an AI where you should go."

It is:

> **"Search the real travel market for the best destinations and trips that fit my constraints."**

AI is the interface and reasoning layer.

External providers are the source of travel-market data.

The deterministic search, cost and ranking engines are the source of truth for the recommendation.

---

# 58. Immediate Development Goal

Do not attempt to build the entire product at once.

The first technical milestone is:

```text
User
  ↓
Search form
  ↓
Structured search criteria
  ↓
Mock destination candidates
  ↓
Mock transport offers
  ↓
Mock accommodation offers
  ↓
Cost calculation
  ↓
Match Score
  ↓
Top 10 recommendations
```

Only after this flow works end-to-end should real providers be integrated.

---

# 59. Definition of Done for the First MVP

A user must be able to:

1. Enter an origin.
2. Enter an exact date range or flexible date window.
3. Enter an exact number of nights.
4. Enter adults, children and babies.
5. Enter a global budget.
6. Select car, flight or both.
7. Define driving preferences.
8. Define accommodation preferences.
9. Define destination preferences.
10. Enter natural-language requirements.
11. Review/edit interpreted requirements.
12. Run a destination discovery search.
13. Receive at least 10 ranked mock results.
14. See concrete vs estimated costs.
15. See a Match Score.
16. Understand why each result was recommended.
17. Compare results.
18. Save the search.
19. Modify the search conversationally.
20. Re-run the search with the modified constraints.

The first implementation must work entirely with mock providers so that development is not blocked by third-party API approval.

---

# 60. Instruction to the Development Agent

Treat this document as the **V1 source of truth**.

Do not expand the product scope without explicit approval.

Before implementing a feature:

1. Check whether it is explicitly included in V1.
2. Check whether it belongs to the domain, provider, infrastructure or UI layer.
3. Preserve provider independence.
4. Preserve LLM independence.
5. Add tests for business logic.
6. Prefer the simplest implementation that satisfies the requirement.

When a requirement is ambiguous, do not silently invent product behaviour. Document the assumption and choose the implementation that minimizes future architectural constraints.

The goal is to produce a clean, testable, provider-independent foundation that can later evolve into a full travel search engine.