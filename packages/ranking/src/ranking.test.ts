import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '@travel-where-to/shared';
import type {
  AccommodationOffer,
  CostBreakdown,
  Destination,
  SearchCriteria,
  TransportOption,
  WeatherResult,
} from '@travel-where-to/domain';
import { computeMatchScore, type ScoringInput } from './score';
import { accommodationFailures, destinationMustHaveFailures, drivingFailures } from './constraints';
import { DEFAULT_WEIGHTS, validateWeights } from './weights';

const now = new Date('2026-10-05T12:00:00Z');
const attribution = { provider: 'test', providerOfferId: 'o1', retrievedAt: now };

const destination: Destination = {
  id: 'malaga',
  name: 'Málaga',
  country: 'Spain',
  countryCode: 'ES',
  region: 'EUROPE',
  coordinates: { lat: 36.72, lon: -4.42 },
  cityCentre: { lat: 36.72, lon: -4.42 },
  beach: { lat: 36.72, lon: -4.41 },
  airports: [],
  reachableByCar: true,
  scores: { beach: 90, city: 75, nature: 50, family: 85, romantic: 70, culture: 75, gastronomy: 85, snow: 0, themePark: 20, tropical: 30, nightlife: 70 },
  climate: { avgHighC: [], avgLowC: [], rainyDays: [] },
  dailyFoodCostPerAdult: eur(30),
};

const hotel: AccommodationOffer = {
  propertyId: 'h1',
  name: 'Test Hotel',
  type: 'HOTEL',
  stars: 4,
  rating: 8.8,
  facilities: ['pool', 'heatedPool'],
  coordinates: { lat: 0, lon: 0 },
  distanceToCentreM: 800,
  distanceToBeachM: 600,
  roomDescription: 'Family room',
  price: { amount: eur(528), confidence: 'VERIFIED', attribution },
  breakfastIncluded: true,
};

const flight: TransportOption = {
  mode: 'FLIGHT',
  departureAirport: { iata: 'LIS', name: 'Lisbon', countryCode: 'PT', coordinates: { lat: 38.77, lon: -9.13 } },
  airportAccess: { distanceKm: 40, durationMinutes: 45, provider: 'test' },
  doorToDoorMinutes: 45 + 120 + 80,
  offer: {
    originAirport: 'LIS',
    destinationAirport: 'AGP',
    outbound: { from: 'LIS', to: 'AGP', departure: '', arrival: '', durationMinutes: 80, stops: 0, carrier: 'X' },
    inbound: { from: 'AGP', to: 'LIS', departure: '', arrival: '', durationMinutes: 80, stops: 0, carrier: 'X' },
    price: { amount: eur(284), confidence: 'VERIFIED', attribution },
    cabinBaggageIncluded: true,
  },
};

const weather: WeatherResult = { avgHighC: 21, avgLowC: 12, rainyDaysExpected: 1, confidence: 'CLIMATE_AVERAGE', attribution: { provider: 't', retrievedAt: now } };

const costs = (total: number): CostBreakdown => ({
  items: [],
  tripTotal: eur(total),
  tripTotalConfidence: 'VERIFIED',
  bookableTotal: eur(total),
  estimatedInBudget: eur(0),
  estimatedExtras: eur(0),
  estimatedOverall: eur(total),
  budgetDifference: eur(total - 1000),
  withinBudget: total <= 1000,
});

const criteria: SearchCriteria = {
  origin: { label: 'Lisbon', coordinates: { lat: 38.72, lon: -9.14 }, countryCode: 'PT' },
  dates: { kind: 'EXACT', checkIn: '2026-11-14', checkOut: '2026-11-18' },
  travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
  budget: eur(1000),
  transport: { modes: ['FLIGHT', 'CAR'], driving: { maxHours: 5, preferredMaxHours: 4.5 } },
  destination: { kind: 'DISCOVER' },
  requirements: [
    { kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' },
    { kind: 'FACILITY', facility: 'heatedPool', priority: 'IMPORTANT' },
    { kind: 'FACILITY', facility: 'breakfast', priority: 'PREFERRED' },
    { kind: 'DESTINATION', attribute: 'nightlife', priority: 'AVOID' },
  ],
  accommodation: { types: ['HOTEL'], minRating: 8 },
  weather: { minAvgHighC: 20 },
};

const input: ScoringInput = { criteria, destination, transport: flight, accommodation: hotel, weather, costs: costs(812), budgetTolerance: 0.1 };

test('weights from the spec sum to 100 and are validated', () => {
  validateWeights(DEFAULT_WEIGHTS);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, budget: 30 }));
});

test('match score is deterministic and produces a breakdown', () => {
  const a = computeMatchScore(input);
  const b = computeMatchScore(structuredClone(input));
  assert.deepEqual(a, b);
  assert.ok(a.score.total > 0 && a.score.total <= 100);
  for (const k of ['budget', 'preferences', 'transport', 'accommodation', 'location', 'weather'] as const) {
    assert.ok(a.score[k] >= 0 && a.score[k] <= 100, k);
  }
  assert.ok(a.reasons.some((r) => r.code === 'FAC_heatedPool' && r.tone === 'POSITIVE'));
  assert.ok(a.reasons.some((r) => r.code === 'AVOID_nightlife' && r.tone === 'WARNING'));
});

test('budget weighting: cheaper scores higher; over budget is penalised but still scored within tolerance', () => {
  const cheap = computeMatchScore({ ...input, costs: costs(600) }).score;
  const mid = computeMatchScore({ ...input, costs: costs(950) }).score;
  const over = computeMatchScore({ ...input, costs: costs(1050) }).score;
  const wayOver = computeMatchScore({ ...input, costs: costs(1200) }).score;
  assert.ok(cheap.budget > mid.budget && mid.budget > over.budget && over.budget > wayOver.budget);
  assert.equal(wayOver.budget, 0);
  assert.ok(computeMatchScore({ ...input, costs: costs(1012) }).reasons.some((r) => r.message === '€12 above your budget'));
});

test('preference weighting: IMPORTANT outweighs PREFERRED; AVOID lowers the score', () => {
  const importantMissing = computeMatchScore({ ...input, accommodation: { ...hotel, facilities: ['pool'] } }).score.accommodation;
  const preferredMissing = computeMatchScore({ ...input, accommodation: { ...hotel, breakfastIncluded: false } }).score.accommodation;
  assert.ok(importantMissing < preferredMissing);

  const quiet = { ...destination, scores: { ...destination.scores, nightlife: 10 } };
  assert.ok(computeMatchScore({ ...input, destination: quiet }).score.preferences > computeMatchScore(input).score.preferences);
});

test('soft driving preference lowers transport score; hard limit excludes', () => {
  const car = (minutes: number): TransportOption => ({ mode: 'CAR', route: { distanceKm: 400, durationMinutes: minutes, provider: 't' }, doorToDoorMinutes: minutes });
  const within = computeMatchScore({ ...input, transport: car(250) }).score.transport;
  const above = computeMatchScore({ ...input, transport: car(290) }).score.transport;
  assert.ok(within - above >= 15);
  assert.deepEqual(drivingFailures(290, { maxHours: 5 }), []);
  assert.equal(drivingFailures(310, { maxHours: 5 }).length, 1);
  assert.deepEqual(drivingFailures(900, undefined), []);
});

test('MUST_HAVE failures are hard exclusions', () => {
  assert.deepEqual(destinationMustHaveFailures(destination, criteria.requirements), []);
  const inland = { ...destination, scores: { ...destination.scores, beach: 10 } };
  assert.equal(destinationMustHaveFailures(inland, criteria.requirements).length, 1);

  assert.deepEqual(accommodationFailures(hotel, criteria.accommodation, criteria.requirements), []);
  assert.ok(accommodationFailures({ ...hotel, rating: 7.9 }, criteria.accommodation, criteria.requirements).length > 0);
  // Missing data never passes a hard filter.
  const { rating: _omit, ...unrated } = hotel;
  assert.ok(accommodationFailures(unrated, criteria.accommodation, criteria.requirements).length > 0);
  const mustPool = [{ kind: 'FACILITY', facility: 'pool', priority: 'MUST_HAVE' } as const];
  assert.deepEqual(accommodationFailures({ ...hotel, facilities: ['heatedPool'] }, { types: ['HOTEL'] }, mustPool), []);
  assert.equal(accommodationFailures({ ...hotel, facilities: [] }, { types: ['HOTEL'] }, mustPool).length, 1);
});

test('missing weather is never invented', () => {
  const r = computeMatchScore({ ...input, weather: null });
  assert.equal(r.score.weather, 50);
  assert.ok(r.reasons.some((x) => x.code === 'WEATHER_UNAVAILABLE'));
});

test('flight preferences: known mismatches fail, missing details are unconfirmed, provider filters count', async () => {
  const { flightPreferenceCheck } = await import('./constraints');
  const price = { amount: eur(300), confidence: 'INDICATIVE' as const, attribution };
  const leg = (departure: string, stops = 0) => ({ from: 'LIS', to: 'AGP', departure, arrival: '', durationMinutes: 80, stops, carrier: 'TP' });
  const offer = { originAirport: 'LIS', destinationAirport: 'AGP', outbound: leg('2026-11-14T08:05'), inbound: leg('2026-11-18T19:10'), price };
  const prefs = { directOnly: true, outboundTimes: ['MORNING' as const], returnTimes: ['EVENING' as const] };
  assert.deepEqual(flightPreferenceCheck(offer, prefs), { failures: [], unconfirmed: [] });
  assert.deepEqual(flightPreferenceCheck({ ...offer, inbound: leg('2026-11-18T19:10', 1) }, prefs).failures, ['Not a direct flight']);
  assert.deepEqual(flightPreferenceCheck(offer, { outboundTimes: ['AFTERNOON', 'EVENING'] }).failures, ['Outbound flight leaves outside the afternoon or evening']);
  // Date-only outbound and no return leg: can't tell.
  const vague = { ...offer, outbound: leg('2026-11-14'), inbound: undefined };
  assert.equal(flightPreferenceCheck(vague, prefs).failures.length, 0);
  assert.equal(flightPreferenceCheck(vague, prefs).unconfirmed.length, 3);
  assert.deepEqual(flightPreferenceCheck({ ...vague, filteredBy: { directOnly: true, returnTimes: true } }, prefs).unconfirmed, ['outbound flight leaves in the morning']);
});
