import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FailureInjector } from '@travel-where-to/shared';
import { eur, fixedClock } from '@travel-where-to/shared';
import type { AccommodationProvider, AccommodationSearchRequest, SearchCriteria } from '@travel-where-to/domain';
import { officialParkHotel } from '@travel-where-to/domain';
import { DESTINATION_CATALOGUE, InMemoryDestinationRepository, PORTUGAL_DEPARTURE_AIRPORTS } from '@travel-where-to/destination-engine';
import { MockFlightProvider } from '@travel-where-to/flight-providers';
import { MockAccommodationProvider } from '@travel-where-to/accommodation-providers';
import { MockRoutingProvider } from '@travel-where-to/routing-providers';
import { MockWeatherProvider } from '@travel-where-to/weather-providers';
import { SearchEngine, SearchValidationError, type SearchEngineDeps } from './SearchEngine';
import type { ProviderCallLog } from './observability';

const NOW = '2026-10-05T12:00:00Z';
const clock = fixedClock(NOW);
const airports = [...PORTUGAL_DEPARTURE_AIRPORTS, ...DESTINATION_CATALOGUE.flatMap((d) => d.airports)];
const climate = new Map(DESTINATION_CATALOGUE.map((d) => [d.id, d.climate]));

interface Overrides {
  flightFailures?: FailureInjector;
  flightClock?: string;
  accommodation?: AccommodationProvider;
  logs?: ProviderCallLog[];
  config?: SearchEngineDeps['config'];
}

function engine(o: Overrides = {}): SearchEngine {
  return new SearchEngine({
    destinations: new InMemoryDestinationRepository(),
    flights: new MockFlightProvider({ airports, clock: o.flightClock ? fixedClock(o.flightClock) : clock, ...(o.flightFailures ? { failures: o.flightFailures } : {}) }),
    accommodation: o.accommodation ?? new MockAccommodationProvider({ clock }),
    routing: new MockRoutingProvider(),
    weather: new MockWeatherProvider({ climateFor: (id) => climate.get(id), clock }),
    departureAirports: PORTUGAL_DEPARTURE_AIRPORTS,
    clock,
    ...(o.logs ? { logger: { log: (e) => o.logs!.push(e) } } : {}),
    ...(o.config ? { config: o.config } : {}),
  });
}

/** Spec §56: "€1,000, four nights, two adults and one child, warm beach destination in November." */
const successCriteria: SearchCriteria = {
  origin: { label: 'Quinta do Anjo', coordinates: { lat: 38.566, lon: -8.94 }, countryCode: 'PT' },
  dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-30', nights: 4 },
  travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
  budget: eur(1000),
  transport: { modes: ['FLIGHT', 'CAR'], driving: { maxHours: 5, preferredMaxHours: 4.5 } },
  destination: { kind: 'DISCOVER' },
  requirements: [{ kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' }],
  accommodation: { types: ['HOTEL', 'APARTMENT'] },
  weather: { preferWarm: true },
};

const exact = (checkIn: string, checkOut: string): SearchCriteria['dates'] => ({ kind: 'EXACT', checkIn, checkOut });

test('destination discovery: success-criteria query returns ranked, concrete, explained options', async () => {
  const r = await engine().search(successCriteria);
  assert.match(r.searchId, /^SEARCH-2026-\d{6}$/);
  assert.ok(r.recommendations.length >= 5, `got ${r.recommendations.length}`);
  assert.ok(r.recommendations.length <= 10);
  const scores = r.recommendations.map((x) => x.score.total);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  for (const rec of r.recommendations) {
    assert.ok(rec.destination.scores.beach >= 60, rec.destination.id);
    assert.ok(rec.checkIn >= '2026-11-01' && rec.checkOut <= '2026-11-30');
    assert.equal(rec.nights, 4);
    assert.ok(rec.costs.tripTotal.amountMinor <= 110_000, 'within budget tolerance');
    // Every provider price is attributed and timestamped; food is a separate estimate.
    for (const item of rec.costs.items) {
      if (item.confidence !== 'ESTIMATED') assert.ok(item.attribution?.retrievedAt instanceof Date, item.label);
      if (item.kind === 'FOOD') assert.equal(item.countsTowardsBudget, false);
    }
    assert.ok(rec.costs.items.some((i) => i.kind === 'ACCOMMODATION' && i.attribution?.deepLink));
    assert.ok(rec.reasons.length > 0);
    if (rec.transport.mode === 'CAR') assert.ok(rec.transport.doorToDoorMinutes <= 300);
  }
});

test('search is deterministic for the same inputs', async () => {
  const strip = (r: Awaited<ReturnType<SearchEngine['search']>>) =>
    JSON.stringify(r.recommendations).replaceAll(/SEARCH-\d{4}-\d{6}/g, 'ID');
  const a = await engine().search(successCriteria);
  const b = await engine().search(successCriteria);
  assert.equal(strip(a), strip(b));
});

test('known destination search returns only that destination', async () => {
  const r = await engine().search({
    ...successCriteria,
    dates: exact('2026-11-14', '2026-11-18'),
    destination: { kind: 'KNOWN', destinationIds: ['rome'] },
    requirements: [],
    transport: { modes: ['FLIGHT'] },
  });
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.recommendations[0]?.destination.id, 'rome');
  assert.equal(r.recommendations[0]?.transport.mode, 'FLIGHT');
});

test('multiple transport modes: car and flight are both evaluated and compared', async () => {
  const r = await engine().search({
    ...successCriteria,
    dates: exact('2026-11-14', '2026-11-18'),
    destination: { kind: 'KNOWN', destinationIds: ['malaga'] },
    transport: { modes: ['FLIGHT', 'CAR'] },
  });
  const rec = r.recommendations[0]!;
  const modes = new Set([rec.transport.mode, ...rec.alternatives.map((a) => a.mode)]);
  assert.deepEqual([...modes].sort(), ['CAR', 'FLIGHT']);
});

test('flexible window: best date combination is chosen, other dates offered as alternatives', async () => {
  const r = await engine().search({
    ...successCriteria,
    dates: { kind: 'FLEXIBLE', windowStart: '2027-03-01', windowEnd: '2027-06-30', nights: 3 },
    destination: { kind: 'KNOWN', destinationIds: ['disneyland-paris'] },
    requirements: [],
    transport: { modes: ['FLIGHT'] },
    budget: eur(2500),
  });
  const rec = r.recommendations[0]!;
  assert.equal(rec.nights, 3);
  assert.ok(rec.checkIn >= '2027-03-01' && rec.checkOut <= '2027-06-30');
  assert.ok(rec.alternatives.length >= 1);
  assert.ok(rec.alternatives.every((a) => a.score <= rec.score.total));
});

test('hard driving limit excludes long drives; car-only never exceeds it', async () => {
  const r = await engine().search({
    ...successCriteria,
    requirements: [],
    transport: { modes: ['CAR'], driving: { maxHours: 3 } },
  });
  assert.ok(r.recommendations.length > 0);
  for (const rec of r.recommendations) {
    assert.equal(rec.transport.mode, 'CAR');
    assert.ok(rec.transport.doorToDoorMinutes <= 180);
  }
  assert.ok(r.excluded.some((e) => /driving limit|exceeds/.test(e.reason)));
});

test('children ages are passed to providers', async () => {
  const seen: AccommodationSearchRequest[] = [];
  const inner = new MockAccommodationProvider({ clock });
  const spy: AccommodationProvider = { name: 'spy', search: (req) => (seen.push(req), inner.search(req)) };
  await engine({ accommodation: spy }).search({
    ...successCriteria,
    dates: exact('2026-11-14', '2026-11-18'),
    destination: { kind: 'KNOWN', destinationIds: ['malaga'] },
    travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 3 }, { type: 'CHILD', age: 7 }, { type: 'INFANT', age: 1 }],
  });
  assert.ok(seen.length > 0);
  assert.deepEqual(seen[0]?.travellers.filter((t) => t.type !== 'ADULT').map((t) => t.age), [3, 7, 1]);
});

test('no results → constraint relaxation suggestions instead of an empty answer', async () => {
  const r = await engine().search({
    ...successCriteria,
    dates: exact('2026-11-14', '2026-11-18'),
    budget: eur(500),
    transport: { modes: ['FLIGHT'] },
    accommodation: { types: ['HOTEL'], minRating: 9 },
  });
  assert.equal(r.recommendations.length, 0);
  const budget = r.relaxations.find((s) => s.code === 'BUDGET');
  assert.ok(budget, 'budget relaxation suggested');
  assert.ok(budget.resultCount > 0);
  assert.equal(budget.description, '€650 budget');
  assert.equal(budget.criteria.budget.amountMinor, 65_000);
  for (const s of r.relaxations) assert.ok(s.resultCount > 0);
});

test('a failing flight provider yields partial results and a clear notice, never a crash', async () => {
  const failing = new Set(['AGP', 'ALC', 'VLC']);
  const logs: ProviderCallLog[] = [];
  const r = await engine({
    flightFailures: (op, key) => (op === 'searchLive' && key.split(',').some((k) => failing.has(k)) ? 'UNAVAILABLE' : undefined),
    logs,
  }).search({ ...successCriteria, dates: exact('2026-11-14', '2026-11-18') });
  assert.ok(r.recommendations.length > 0);
  assert.ok(r.notices.some((n) => /^Flight pricing was unavailable for 3 destinations\.$/.test(n)), r.notices.join(' | '));
  assert.ok(logs.some((l) => l.status === 'ERROR' && l.errorKind === 'UNAVAILABLE' && l.searchId === r.searchId));
  assert.ok(r.recommendations.filter((x) => ['malaga', 'alicante', 'valencia'].includes(x.destination.id)).every((x) => x.transport.mode === 'CAR'));
});

test('accommodation provider down for everything → empty results with notices, no fabricated data', async () => {
  const down: AccommodationProvider = { name: 'down', search: async () => Promise.reject(new Error('boom')) };
  const r = await engine({ accommodation: down }).search({ ...successCriteria, dates: exact('2026-11-14', '2026-11-18') });
  assert.equal(r.recommendations.length, 0);
  assert.ok(r.notices.some((n) => n.startsWith('Accommodation availability was unavailable')));
});

test('timeouts are reported as provider issues', async () => {
  const slow: AccommodationProvider = { name: 'slow', search: () => new Promise(() => undefined) };
  const r = await engine({ accommodation: slow, config: { providerTimeoutMs: 20 } }).search({
    ...successCriteria,
    dates: exact('2026-11-14', '2026-11-18'),
    destination: { kind: 'KNOWN', destinationIds: ['malaga'] },
  });
  assert.equal(r.recommendations.length, 0);
  assert.ok(r.issues.some((i) => i.kind === 'TIMEOUT'));
});

test('expired provider prices are discarded', async () => {
  const r = await engine({ flightClock: '2026-10-05T09:00:00Z' }).search({
    ...successCriteria,
    dates: exact('2026-11-14', '2026-11-18'),
  });
  assert.ok(r.recommendations.every((x) => x.transport.mode === 'CAR'));
  assert.ok(r.notices.some((n) => n.includes('expired')));
});

test('invalid criteria are rejected before any provider call', async () => {
  const logs: ProviderCallLog[] = [];
  await assert.rejects(
    engine({ logs }).search({ ...successCriteria, travellers: [{ type: 'CHILD', age: 5 }] }),
    SearchValidationError,
  );
  assert.equal(logs.length, 0);
});

test('live verification checks only the top results, re-prices them and never runs during relaxation', async () => {
  const inner = new MockFlightProvider({ airports, clock });
  // Indicative-only flights (like Travelpayouts).
  const indicative: SearchEngineDeps['flights'] = {
    name: 'cached-flights',
    searchIndicative: (r) => inner.searchIndicative(r),
    searchLive: async (r) => (await inner.searchLive(r)).map((o) => ({ ...o, price: { ...o.price, confidence: 'INDICATIVE' as const } })),
  };
  const calls: string[] = [];
  const verifier: NonNullable<SearchEngineDeps['flightVerifier']> = {
    name: 'live-flights',
    searchLive: async (r) => {
      calls.push(r.destinationAirports[0]!);
      if (r.destinationAirports[0] === 'ALC') return []; // live search finds nothing
      const base = (await inner.searchLive(r))[0];
      return base ? [{ ...base, price: { ...base.price, amount: { amountMinor: 20000, currency: 'EUR' }, attribution: { ...base.price.attribution, provider: 'live-flights' } } }] : [];
    },
  };
  const e = new SearchEngine({
    destinations: new InMemoryDestinationRepository(),
    flights: indicative,
    flightVerifier: verifier,
    accommodation: new MockAccommodationProvider({ clock }),
    routing: new MockRoutingProvider(),
    weather: new MockWeatherProvider({ climateFor: (id) => climate.get(id), clock }),
    departureAirports: PORTUGAL_DEPARTURE_AIRPORTS,
    clock,
    config: { verifyTop: 3 },
  });
  const r = await e.search({ ...successCriteria, transport: { modes: ['FLIGHT'] }, dates: exact('2026-11-14', '2026-11-18') });
  assert.ok(calls.length > 0 && calls.length <= 3);
  const verified = r.recommendations.filter((x) => x.reasons.some((m) => m.code === 'FLIGHT_VERIFIED'));
  assert.ok(verified.length >= 1);
  for (const v of verified) {
    const item = v.costs.items.find((i) => i.kind === 'FLIGHT')!;
    assert.equal(item.confidence, 'VERIFIED');
    assert.equal(item.amount.amountMinor, 20000);
  }
  assert.ok(r.notices.some((n) => n.startsWith('Flight prices of the top')));
  assert.deepEqual(r.sources.flightCheck, { provider: 'live-flights', mock: false });

  calls.length = 0;
  const none = await e.search({ ...successCriteria, transport: { modes: ['FLIGHT'] }, dates: exact('2026-11-14', '2026-11-18'), budget: eur(150) });
  assert.equal(none.recommendations.length, 0);
  assert.equal(calls.length, 0, 'relaxation re-runs never call the live verifier');
});

test('theme parks: tickets are included as an estimate; official park hotels only when asked', async () => {
  const park = (extra: Partial<SearchCriteria>) =>
    engine().search({
      ...successCriteria,
      dates: exact('2026-11-14', '2026-11-17'),
      destination: { kind: 'KNOWN', destinationIds: ['disneyland-paris'] },
      travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 6 }, { type: 'INFANT', age: 1 }],
      requirements: [],
      transport: { modes: ['FLIGHT'] },
      budget: eur(4000),
      ...extra,
    });
  const r = await park({});
  const rec = r.recommendations[0]!;
  const tickets = rec.costs.items.find((i) => i.kind === 'PARK_TICKETS')!;
  assert.equal(tickets.confidence, 'ESTIMATED');
  assert.equal(tickets.countsTowardsBudget, true);
  // 3 nights → 3-day ticket, middle of €210–€300 = €255 × 3 payers (baby under 3 is free)
  assert.deepEqual(tickets.amount, eur(765));
  assert.match(tickets.basis ?? '', /1 under 3 free/);
  assert.equal(tickets.link, 'https://www.disneylandparis.com/en-gb/tickets/');
  assert.ok(rec.reasons.some((x) => x.code === 'PARK_TICKETS'));

  const noTickets = await park({ parkTickets: { include: false } });
  assert.ok(!noTickets.recommendations[0]!.costs.items.some((i) => i.kind === 'PARK_TICKETS'));
  const twoDays = await park({ parkTickets: { days: 6 } });
  assert.match(twoDays.recommendations[0]!.costs.items.find((i) => i.kind === 'PARK_TICKETS')!.basis ?? '', /Longest ticket sold is 4 days/);

  // Mock stays have no Disney hotels → none qualify, with a clear reason.
  const onlyPark = await park({ accommodation: { types: ['HOTEL', 'APARTMENT'], parkHotelsOnly: true } });
  assert.equal(onlyPark.recommendations.length, 0);
  assert.ok(onlyPark.excluded.some((e) => /official Disneyland Paris hotel/.test(e.reason)));
});

test('official park hotel names are matched despite accents and apostrophes', () => {
  const park = DESTINATION_CATALOGUE.find((d) => d.id === 'disneyland-paris')!.park!;
  assert.equal(officialParkHotel(park, "Disney's Hotel Cheyenne®")?.name, 'Disney Hotel Cheyenne');
  assert.equal(officialParkHotel(park, 'Disney Hotel New York - The Art of Marvel')?.name, 'Disney Hotel New York – The Art of Marvel');
  assert.equal(officialParkHotel(park, 'Disneyland Hotel')?.atParkEntrance, true);
  assert.equal(officialParkHotel(park, 'Radisson Blu Hotel at Disneyland Paris'), undefined);
  assert.equal(officialParkHotel(park, "Disney's Davy Crockett Ranch")?.name, 'Disney Davy Crockett Ranch');
});

test('flight preferences: direct only and departure times are hard filters; relaxations offered', async () => {
  const base: SearchCriteria = { ...successCriteria, transport: { modes: ['FLIGHT'] } };
  const all = await engine().search(base);
  assert.ok(all.recommendations.some((r) => r.transport.mode === 'FLIGHT' && r.transport.offer.outbound.stops > 0), 'fixture has flights with stops');

  const prefs: SearchCriteria = { ...base, transport: { modes: ['FLIGHT'], flights: { directOnly: true, outboundTimes: ['MORNING'], returnTimes: ['EVENING'] } } };
  const r = await engine().search(prefs);
  assert.ok(r.recommendations.length > 0);
  for (const rec of r.recommendations) {
    assert.equal(rec.transport.mode, 'FLIGHT');
    if (rec.transport.mode !== 'FLIGHT') continue;
    const o = rec.transport.offer;
    assert.equal(o.outbound.stops, 0);
    assert.equal(o.inbound?.stops, 0);
    const outHour = Number(o.outbound.departure.slice(11, 13));
    const backHour = Number(o.inbound?.departure.slice(11, 13));
    assert.ok(outHour >= 5 && outHour <= 11, `outbound ${o.outbound.departure}`);
    assert.ok(backHour >= 18 && backHour <= 23, `return ${o.inbound?.departure}`);
  }

  // Ways out when nothing fits: allow stops, any time, any weekday.
  const { relaxationCandidates } = await import('./relaxation');
  const codes = relaxationCandidates({
    ...prefs,
    dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-30', nights: 3, weekdays: { departOn: [4], returnOn: [0] } },
  }).map((x) => x.code);
  for (const code of ['ALLOW_STOPS', 'ANY_FLIGHT_TIME', 'ANY_WEEKDAYS']) assert.ok(codes.includes(code), code);
});

test('flexible window with days of the week: only Thursday → Sunday trips', async () => {
  const c: SearchCriteria = {
    ...successCriteria,
    budget: eur(1500),
    dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-12-15', nights: 3, weekdays: { departOn: [4], returnOn: [0] } },
  };
  const r = await engine().search(c);
  assert.ok(r.recommendations.length > 0);
  for (const rec of r.recommendations) {
    assert.equal(new Date(`${rec.checkIn}T00:00:00Z`).getUTCDay(), 4, rec.checkIn);
    assert.equal(new Date(`${rec.checkOut}T00:00:00Z`).getUTCDay(), 0, rec.checkOut);
    assert.equal(rec.nights, 3);
    for (const alt of rec.alternatives) assert.equal(new Date(`${alt.checkIn}T00:00:00Z`).getUTCDay(), 4);
  }
  // A window without a Thursday → Sunday inside is invalid.
  await assert.rejects(
    engine().search({ ...c, dates: { kind: 'FLEXIBLE', windowStart: '2026-11-02', windowEnd: '2026-11-07', nights: 3, weekdays: { departOn: [4], returnOn: [0] } } }),
    SearchValidationError,
  );
});

test('budget picks: cheapest trips and the best trips that use most of the budget', async () => {
  const c: SearchCriteria = { ...successCriteria, budget: eur(1500), requirements: [{ kind: 'DESTINATION', attribute: 'beach', priority: 'IMPORTANT' }] };
  const r = await engine().search(c);
  const picks = r.picks!;
  assert.equal(picks.cheapest.length, 5);
  assert.equal(picks.fullBudget.length, 5);
  const totals = (xs: readonly { costs: { tripTotal: { amountMinor: number } } }[]) => xs.map((x) => x.costs.tripTotal.amountMinor);
  assert.deepEqual(totals(picks.cheapest), [...totals(picks.cheapest)].sort((a, b) => a - b));
  // The cheapest pick is the cheapest viable trip of all; every budget pick is within budget and spends ≥ 75% of it.
  const cheapestOfAll = Math.min(...r.recommendations.map((x) => x.costs.tripTotal.amountMinor));
  assert.ok(totals(picks.cheapest)[0]! <= cheapestOfAll);
  for (const t of totals(picks.fullBudget)) assert.ok(t <= 150_000 && t >= 112_500, String(t));
  // One trip per place in each list; ids don't collide with the best-match list.
  for (const list of [picks.cheapest, picks.fullBudget]) assert.equal(new Set(list.map((x) => x.destination.id)).size, list.length);
  const ids = new Set(r.recommendations.map((x) => x.id));
  assert.ok([...picks.cheapest, ...picks.fullBudget].every((x) => !ids.has(x.id)));
  assert.equal(picks.cheapest[0]?.reasons[0]?.code, 'PICK_CHEAPEST');
  assert.equal(picks.fullBudget[0]?.reasons[0]?.code, 'PICK_FULL_BUDGET');
});

test('left-out places say why: over budget with the cheapest price, flight preferences, region filter', async () => {
  const tight = await engine().search({ ...successCriteria, budget: eur(150), transport: { modes: ['FLIGHT'] } });
  const over = tight.excluded.filter((e) => e.reason.startsWith('Over your budget') || e.reason.startsWith('Flights alone exceed'));
  assert.ok(over.length > 0, JSON.stringify(tight.excluded.slice(0, 5)));
  assert.ok(!tight.excluded.some((e) => e.reason === 'No trip within budget matched your accommodation requirements'));

  const far: SearchCriteria = {
    ...successCriteria,
    budget: eur(4000),
    dates: { kind: 'FLEXIBLE', windowStart: '2027-04-28', windowEnd: '2027-05-31', nights: 7 },
    transport: { modes: ['FLIGHT'] },
    destination: { kind: 'DISCOVER', regions: ['AFRICA', 'AMERICAS', 'MIDDLE_EAST', 'ASIA_PACIFIC', 'INDIAN_OCEAN'] },
    requirements: [],
  };
  const r = await engine().search(far);
  assert.ok(r.recommendations.length >= 5, `got ${r.recommendations.length}`);
  for (const rec of r.recommendations) assert.notEqual(rec.destination.countryCode, 'ES');
  assert.ok(r.recommendations.every((x) => !['ES', 'PT', 'FR', 'IT', 'GB', 'NL', 'GR'].includes(x.destination.countryCode)));
  assert.ok(new Set(r.picks!.fullBudget.map((x) => x.destination.id)).size >= 3);
});
