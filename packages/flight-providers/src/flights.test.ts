import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock } from '@travel-where-to/shared';
import { ProviderError, type Airport, type FlightDiscoveryRequest } from '@travel-where-to/domain';
import { MockFlightProvider } from './MockFlightProvider';
import { mapLiveQuotes } from './mockFlightPayload';

const airports: Airport[] = [
  { iata: 'LIS', name: 'Lisbon', countryCode: 'PT', coordinates: { lat: 38.7742, lon: -9.1342 } },
  { iata: 'AGP', name: 'Málaga', countryCode: 'ES', coordinates: { lat: 36.6749, lon: -4.4991 } },
];
const now = new Date('2026-10-05T10:00:00Z');
const req: FlightDiscoveryRequest = {
  originAirports: ['LIS'],
  destinationAirports: ['AGP'],
  outboundDate: '2026-11-14',
  returnDate: '2026-11-18',
  travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
  currency: 'EUR',
};

test('mock live flights are deterministic, VERIFIED, timestamped and expire', async () => {
  const p = new MockFlightProvider({ airports, clock: fixedClock(now) });
  const a = await p.searchLive(req);
  const b = await p.searchLive(req);
  assert.equal(a.length, 1);
  assert.deepEqual(a, b);
  const offer = a[0]!;
  assert.equal(offer.price.confidence, 'VERIFIED');
  assert.equal(offer.price.attribution.retrievedAt.toISOString(), now.toISOString());
  assert.equal(offer.price.attribution.expiresAt?.toISOString(), '2026-10-05T10:30:00.000Z');
  assert.ok(offer.price.attribution.deepLink?.startsWith('https://mock-flights.invalid/'));
});

test('indicative prices are marked INDICATIVE', async () => {
  const p = new MockFlightProvider({ airports, clock: fixedClock(now) });
  const r = await p.searchIndicative(req);
  assert.equal(r[0]?.price.confidence, 'INDICATIVE');
});

test('children cost more than infants; more travellers cost more', async () => {
  const p = new MockFlightProvider({ airports, clock: fixedClock(now) });
  const solo = (await p.searchLive({ ...req, travellers: [{ type: 'ADULT' }] }))[0]!;
  const withInfant = (await p.searchLive({ ...req, travellers: [{ type: 'ADULT' }, { type: 'INFANT', age: 1 }] }))[0]!;
  const withChild = (await p.searchLive({ ...req, travellers: [{ type: 'ADULT' }, { type: 'CHILD', age: 6 }] }))[0]!;
  assert.ok(solo.price.amount.amountMinor < withInfant.price.amount.amountMinor);
  assert.ok(withInfant.price.amount.amountMinor < withChild.price.amount.amountMinor);
});

test('simulated provider failures surface as ProviderError', async () => {
  const p = new MockFlightProvider({ airports, clock: fixedClock(now), failures: () => 'RATE_LIMITED' });
  await assert.rejects(p.searchLive(req), (e: unknown) => e instanceof ProviderError && e.kind === 'RATE_LIMITED');
});

test('response mapping: invalid payload rejected, invalid quotes and wrong currency dropped', () => {
  const ctx = { provider: 'x', retrievedAt: now, expectedCurrency: 'EUR' };
  assert.throws(() => mapLiveQuotes({ status: 'ERROR' }, ctx), (e: unknown) => e instanceof ProviderError && e.kind === 'INVALID_RESPONSE');
  const good = {
    quoteId: 'q1', from: 'LIS', to: 'AGP', outboundDate: '2026-11-14', returnDate: '2026-11-18', totalPriceCents: 28400,
    currency: 'EUR', direct: true, carrier: 'MockAir', outboundDeparture: '2026-11-14T08:05', outboundDurationMin: 80,
    inboundDeparture: '2026-11-18T18:15', inboundDurationMin: 80, stops: 0, cabinBag: true, bookingUrl: 'https://mock-flights.invalid/q1',
  };
  const r = mapLiveQuotes({ status: 'OK', quotes: [good, { ...good, totalPriceCents: -5 }, { ...good, currency: 'GBP' }, { foo: 1 }] }, ctx);
  assert.equal(r.items.length, 1);
  assert.equal(r.rejected, 3);
  assert.equal(r.items[0]?.outbound.arrival, '2026-11-14T09:25');
});
