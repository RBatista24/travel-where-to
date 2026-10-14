import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { fixedClock } from '@travel-where-to/shared';
import { InMemoryDestinationRepository } from '@travel-where-to/destination-engine';
import { createApp } from './app';
import { createMockSearchEngine } from './composition';
import { InMemorySearchRepository } from './searchRepository';
import { MockLlmProvider } from '@travel-where-to/llm';

let server: Server;
let base = '';

before(async () => {
  server = createApp({
    engine: createMockSearchEngine({ clock: fixedClock('2026-10-05T12:00:00Z') }),
    searches: new InMemorySearchRepository(),
    destinations: new InMemoryDestinationRepository(),
    llm: new MockLlmProvider(() => new Date('2026-10-05T12:00:00Z')),
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const body = {
  origin: { label: 'Lisbon', coordinates: { lat: 38.72, lon: -9.14 }, countryCode: 'PT' },
  dates: { kind: 'EXACT', checkIn: '2026-11-14', checkOut: '2026-11-18' },
  travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
  budget: { amount: 1000, currency: 'EUR' },
  transport: { modes: ['FLIGHT', 'CAR'], driving: { maxHours: 5 } },
  requirements: [{ kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' }],
};

test('POST /api/searches runs a search and stores it', async () => {
  const res = await fetch(`${base}/api/searches`, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 201);
  const json = (await res.json()) as { searchId: string; recommendations: unknown[] };
  assert.ok(json.recommendations.length > 0);
  const again = await fetch(`${base}/api/searches/${json.searchId}`);
  assert.equal(again.status, 200);
});

test('invalid requests are rejected with details', async () => {
  const bad = await fetch(`${base}/api/searches`, { method: 'POST', body: JSON.stringify({ ...body, budget: { amount: -1, currency: 'EUR' } }) });
  assert.equal(bad.status, 400);
  const unknownField = await fetch(`${base}/api/searches`, { method: 'POST', body: JSON.stringify({ ...body, flightPrice: 10 }) });
  assert.equal(unknownField.status, 400);
  const domainInvalid = await fetch(`${base}/api/searches`, { method: 'POST', body: JSON.stringify({ ...body, travellers: [{ type: 'CHILD', age: 4 }] }) });
  assert.equal(domainInvalid.status, 422);
  assert.equal((await fetch(`${base}/api/searches/SEARCH-0`)).status, 404);
});

test('GET /api/destinations lists the catalogue', async () => {
  const res = await fetch(`${base}/api/destinations`);
  const json = (await res.json()) as { destinations: { id: string }[] };
  assert.ok(json.destinations.some((d) => d.id === 'malaga'));
});

test('POST /api/interpret returns validated AI interpretation', async () => {
  const res = await fetch(`${base}/api/interpret`, { method: 'POST', body: JSON.stringify({ text: 'Beach, no nightlife, heated pool, €1000' }) });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { origin: string; intent: { requirements: unknown[]; budget: unknown } };
  assert.equal(json.origin, 'AI_INTERPRETATION');
  assert.equal(json.intent.requirements.length, 3);
  assert.equal((await fetch(`${base}/api/interpret`, { method: 'POST', body: JSON.stringify({ text: '' }) })).status, 400);
});

test('providers are chosen from env and missing keys fail loudly', async () => {
  const { providersFromEnv } = await import('./composition');
  const all = providersFromEnv({});
  assert.deepEqual([all.flights.name, all.accommodation.name, all.routing.name, all.weather.name], ['mock-flights', 'mock-accommodation', 'mock-routing', 'mock-weather']);
  const real = providersFromEnv({ FLIGHT_PROVIDER: 'travelpayouts', TRAVELPAYOUTS_TOKEN: 'xxxxxxxxxxxx', ROUTING_PROVIDER: 'openrouteservice', ORS_API_KEY: 'yyyyyyyyyyyy', WEATHER_PROVIDER: 'open-meteo' });
  assert.deepEqual([real.flights.name, real.routing.name, real.weather.name], ['travelpayouts', 'openrouteservice', 'open-meteo']);
  assert.throws(() => providersFromEnv({ FLIGHT_PROVIDER: 'travelpayouts' }), /TRAVELPAYOUTS_TOKEN/);
  assert.throws(() => providersFromEnv({ ROUTING_PROVIDER: 'google' }), /Unknown ROUTING_PROVIDER/);
  const stays = providersFromEnv({ ACCOMMODATION_PROVIDER: 'liteapi', LITEAPI_KEY: 'llllllllllll', FLIGHT_VERIFIER: 'serpapi', SERPAPI_KEY: 'ssssssssssss' });
  assert.equal(stays.accommodation.name, 'liteapi');
  assert.equal(stays.flightVerifier?.name, 'serpapi-google-flights');
  assert.equal(providersFromEnv({ ACCOMMODATION_PROVIDER: 'serpapi', SERPAPI_KEY: 'ssssssssssss' }).accommodation.name, 'serpapi-google-hotels');
  assert.equal(providersFromEnv({}).flightVerifier, undefined);
  // Aliases and defaults when only keys are present.
  const keysOnly = providersFromEnv({ SERPAPI_API_KEY: 'ssssssssssss', LITEAPI_API_KEY: 'llllllllllll' });
  assert.equal(keysOnly.accommodation.name, 'liteapi');
  assert.equal(keysOnly.flightVerifier?.name, 'serpapi-google-flights');
  assert.equal(providersFromEnv({ SERPAPI_API_KEY: 'ssssssssssss', FLIGHT_VERIFIER: 'none', ACCOMMODATION_PROVIDER: 'mock', LITEAPI_KEY: 'llllllllllll' }).flightVerifier, undefined);
  assert.throws(() => providersFromEnv({ FLIGHT_VERIFIER: 'serpapi' }), /SERPAPI_KEY/);
  assert.throws(() => providersFromEnv({ ACCOMMODATION_PROVIDER: 'liteapi' }), /LITEAPI_KEY/);
  assert.throws(() => providersFromEnv({ ROUTING_PROVIDER: 'openrouteservice', ORS_API_KEY: '…' }), /placeholder/);
});

test('interpret resolves destination names to catalogue ids; destinations expose parks', async () => {
  const res = await fetch(`${base}/api/interpret`, { method: 'POST', body: JSON.stringify({ text: 'Disneyland with a Disney hotel' }) });
  const json = (await res.json()) as { intent: { parkHotelsOnly?: boolean }; destinations: { id: string }[] };
  assert.deepEqual(json.destinations.map((d) => d.id), ['disneyland-paris']);
  assert.equal(json.intent.parkHotelsOnly, true);
  const d = (await (await fetch(`${base}/api/destinations`)).json()) as { destinations: { id: string; park?: { officialHotels: string[]; maxTicketDays: number } }[] };
  const dlp = d.destinations.find((x) => x.id === 'disneyland-paris');
  assert.equal(dlp?.park?.officialHotels.length, 7);
  assert.equal(dlp?.park?.maxTicketDays, 4);
});

test('searches accept flight preferences and days of the week', async () => {
  const res = await fetch(`${base}/api/searches`, {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-30', nights: 3, weekdays: { departOn: [4], returnOn: [0] } },
      transport: { modes: ['FLIGHT'], flights: { directOnly: true, outboundTimes: ['MORNING'] } },
      budget: { amount: 1500, currency: 'EUR' },
    }),
  });
  assert.equal(res.status, 201);
  const json = (await res.json()) as { recommendations: { checkIn: string; nights: number }[]; criteria: { transport: { flights: unknown } } };
  assert.ok(json.recommendations.length > 0);
  assert.ok(json.recommendations.every((r) => new Date(`${r.checkIn}T00:00:00Z`).getUTCDay() === 4 && r.nights === 3));
  assert.deepEqual(json.criteria.transport.flights, { directOnly: true, outboundTimes: ['MORNING'] });
  const bad = await fetch(`${base}/api/searches`, {
    method: 'POST',
    body: JSON.stringify({ ...body, transport: { modes: ['FLIGHT'], flights: { outboundTimes: ['DAWN'] } } }),
  });
  assert.equal(bad.status, 400);
});
