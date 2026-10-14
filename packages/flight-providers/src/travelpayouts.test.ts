import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock } from '@travel-where-to/shared';
import { ProviderError, type FlightDiscoveryRequest } from '@travel-where-to/domain';
import { TravelpayoutsFlightProvider } from './TravelpayoutsFlightProvider';

const clock = fixedClock('2026-10-05T12:00:00Z');
const ticket = (dep: string, ret: string, price: number, extra: Record<string, unknown> = {}) => ({
  origin: 'LIS', destination: 'AGP', origin_airport: 'LIS', destination_airport: 'AGP', price, airline: 'TP', flight_number: 1234,
  departure_at: `${dep}T08:05:00+00:00`, return_at: `${ret}T19:10:00+01:00`, transfers: 0, return_transfers: 0,
  duration: 160, duration_to: 80, duration_back: 80, link: `/search/LIS${dep.slice(8, 10)}${dep.slice(5, 7)}AGP${ret.slice(8, 10)}${ret.slice(5, 7)}1?t=abc`, ...extra,
});

function stub(routes: Record<string, unknown>, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const body = routes[path];
    if (body === undefined) return new Response('{"success":false,"error":"nope"}', { status: 404 });
    if (typeof body === 'number') return new Response('{"message":"x"}', { status: body });
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

const req: FlightDiscoveryRequest = {
  originAirports: ['LIS'], destinationAirports: ['AGP'], outboundDate: '2026-11-14', returnDate: '2026-11-18',
  travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }, { type: 'INFANT', age: 1 }], currency: 'EUR',
};

const grouped = {
  success: true,
  currency: 'eur',
  data: {
    '2026-11-14': ticket('2026-11-14', '2026-11-18', 89),
    '2026-11-15': ticket('2026-11-15', '2026-11-20', 50), // wrong trip length → ignored
    '2026-11-16': { price: 'cheap' }, // invalid → dropped
  },
};

test('indicative: grouped round-trip calls per route-month, exact trip length, party total and INDICATIVE', async () => {
  const calls: string[] = [];
  const p = new TravelpayoutsFlightProvider({ token: 't', market: 'pt', marker: '12345', clock, fetch: stub({ '/aviasales/v3/grouped_prices': grouped }, calls) });
  const r = await p.searchIndicative(req);
  assert.equal(r.length, 1);
  assert.equal(r[0]?.price.confidence, 'INDICATIVE');
  // 89 × (2 adults + 1 child) + 89 × 0.1 infant = 275.90
  assert.deepEqual(r[0]?.price.amount, { amountMinor: 27590, currency: 'EUR' });
  assert.equal(r[0]?.direct, true);
  // second date of the same month comes from cache
  await p.searchIndicative({ ...req, outboundDate: '2026-11-15', returnDate: '2026-11-19' });
  // Round trips are asked for explicitly (no return_at = one-way): returning this month and next.
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => new URL(c).searchParams.get('return_at')).sort(), ['2026-11', '2026-12']);
  const url = new URL(calls[0]!);
  assert.equal(url.searchParams.get('departure_at'), '2026-11');
  assert.equal(url.searchParams.get('min_trip_duration'), '4');
  assert.equal(url.searchParams.get('currency'), 'eur');
  assert.equal(url.searchParams.get('market'), 'pt');
});

test('live: exact-date tickets become offers with legs, basis and an Aviasales link for the whole party', async () => {
  const p = new TravelpayoutsFlightProvider({
    token: 't', marker: '12345', clock,
    fetch: stub({ '/aviasales/v3/grouped_prices': grouped, '/aviasales/v3/prices_for_dates': { success: true, currency: 'eur', data: [ticket('2026-11-14', '2026-11-18', 95, { transfers: 1, duration_to: 200 }), ticket('2026-11-14', '2026-11-18', 89)] } }),
  });
  const offers = await p.searchLive(req);
  assert.equal(offers.length, 2);
  const cheapest = offers[0]!;
  assert.equal(cheapest.price.confidence, 'INDICATIVE');
  assert.equal(cheapest.outbound.departure, '2026-11-14T08:05');
  assert.equal(cheapest.outbound.arrival, '');
  assert.equal(cheapest.outbound.durationMinutes, 80);
  assert.match(cheapest.priceBasis ?? '', /per adult/);
  assert.equal(cheapest.price.attribution.deepLink, 'https://www.aviasales.com/search/LIS1411AGP1811211?t=abc&marker=12345');
  assert.equal(offers[1]?.outbound.stops, 1);
});

test('live: routes without a cached month price are not queried; nothing is invented', async () => {
  const calls: string[] = [];
  const p = new TravelpayoutsFlightProvider({ token: 't', clock, fetch: stub({ '/aviasales/v3/grouped_prices': { success: true, data: {} } }, calls) });
  assert.deepEqual(await p.searchLive(req), []);
  assert.equal(calls.filter((c) => c.includes('prices_for_dates')).length, 0);
});

test('errors map to provider error kinds', async () => {
  for (const [status, kind] of [[401, 'AUTHENTICATION'], [429, 'RATE_LIMITED'], [503, 'UNAVAILABLE']] as const) {
    const p = new TravelpayoutsFlightProvider({ token: 't', clock, fetch: stub({ '/aviasales/v3/grouped_prices': status }) });
    await assert.rejects(p.searchIndicative(req), (e: unknown) => e instanceof ProviderError && e.kind === kind);
  }
  const wrongCurrency = new TravelpayoutsFlightProvider({ token: 't', clock, fetch: stub({ '/aviasales/v3/grouped_prices': { ...grouped, currency: 'rub' } }) });
  await assert.rejects(wrongCurrency.searchIndicative(req), (e: unknown) => e instanceof ProviderError && e.kind === 'INVALID_RESPONSE');
  assert.throws(() => new TravelpayoutsFlightProvider({ token: '' }));
});

test('no exact cached trip: nearest date/length within ±3 is used, labelled, with a link for your dates', async () => {
  const calls: string[] = [];
  const p = new TravelpayoutsFlightProvider({
    token: 't', market: 'pt', clock,
    fetch: async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const exact = u.searchParams.has('min_trip_duration');
      // pt market empty → falls back to no market; exact length has nothing near; any length has a 5-night trip 2 days later.
      if (u.searchParams.get('market') === 'pt') return new Response(JSON.stringify({ success: true, currency: 'eur', data: {} }));
      const data = exact ? {} : { '2026-11-16': ticket('2026-11-16', '2026-11-21', 120), '2026-11-28': ticket('2026-11-28', '2026-12-02', 60) };
      return new Response(JSON.stringify({ success: true, currency: 'eur', data }));
    },
  });
  const ind = await p.searchIndicative(req);
  assert.equal(ind.length, 1);
  assert.equal(ind[0]?.outboundDate, '2026-11-14');
  const live = await p.searchLive(req);
  assert.equal(live.length, 1);
  const o = live[0]!;
  assert.match(o.priceBasis ?? '', /5-night trip leaving 2026-11-16 \(no cached price for your exact dates\)/);
  assert.equal(o.outbound.departure, '2026-11-14');
  assert.equal(o.inbound, undefined);
  assert.equal(o.price.attribution.deepLink, 'https://www.aviasales.com/search/LIS1411AGP1811211');
  assert.ok(calls.some((c) => new URL(c).searchParams.get('market') === 'pt'));
  assert.ok(calls.some((c) => !new URL(c).searchParams.has('market')));
  assert.equal(calls.filter((c) => c.includes('prices_for_dates')).length, 0, 'exact-date search only for exact matches');
});

test('quiet routes: a trip up to 14 days away is used as a labelled last resort; nothing further', async () => {
  const p = new TravelpayoutsFlightProvider({
    token: 't', clock,
    fetch: async () => new Response(JSON.stringify({ success: true, currency: 'eur', data: { '2026-11-25': ticket('2026-11-25', '2026-11-29', 40) } })),
  });
  const ind = await p.searchIndicative(req);
  assert.equal(ind.length, 1);
  const live = await p.searchLive(req);
  assert.match(live[0]?.priceBasis ?? '', /4-night trip leaving 2026-11-25/);
  const far = new TravelpayoutsFlightProvider({
    token: 't', clock,
    fetch: async () => new Response(JSON.stringify({ success: true, currency: 'eur', data: { '2026-11-29': ticket('2026-11-29', '2026-12-03', 40) } })),
  });
  assert.deepEqual(await far.searchIndicative({ ...req, outboundDate: '2026-11-02', returnDate: '2026-11-06' }), []);
});

test('flight preferences: direct=true is asked of the cache; tickets at the asked times come first', async () => {
  const calls: string[] = [];
  const dates = {
    success: true,
    currency: 'eur',
    data: [
      ticket('2026-11-14', '2026-11-18', 95, { departure_at: '2026-11-14T15:00:00+00:00' }),
      ticket('2026-11-14', '2026-11-18', 110, { departure_at: '2026-11-14T07:30:00+00:00' }),
    ],
  };
  const p = new TravelpayoutsFlightProvider({ token: 't', clock, fetch: stub({ '/aviasales/v3/grouped_prices': grouped, '/aviasales/v3/prices_for_dates': dates }, calls) });
  const offers = await p.searchLive({ ...req, preferences: { directOnly: true, outboundTimes: ['MORNING'] } });
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.outbound.departure, '2026-11-14T07:30');
  assert.deepEqual(offers[0]?.filteredBy, { directOnly: true });
  assert.ok(calls.every((c) => new URL(c).searchParams.get('direct') === 'true'));
  // No ticket at the asked time: the cheapest off-time one is returned so the engine can say why it's left out.
  const late = await p.searchLive({ ...req, preferences: { outboundTimes: ['NIGHT'] } });
  assert.equal(late.length, 1);
  assert.equal(late[0]?.outbound.departure, '2026-11-14T15:00');
});

test('estimate fallback: only when the cache has nothing; labelled ESTIMATED with a basis and no times', async () => {
  const { EstimatedFlightFallback } = await import('./EstimatedFlightFallback');
  const airports = [
    { iata: 'LIS', name: 'Lisbon', countryCode: 'PT', coordinates: { lat: 38.7697, lon: -9.1281 } },
    { iata: 'PUJ', name: 'Punta Cana', countryCode: 'DO', coordinates: { lat: 18.5674, lon: -68.3634 } },
    { iata: 'AGP', name: 'Málaga', countryCode: 'ES', coordinates: { lat: 36.6749, lon: -4.4991 } },
  ];
  const empty = new TravelpayoutsFlightProvider({ token: 't', clock, fetch: async () => new Response(JSON.stringify({ success: true, currency: 'eur', data: {} })) });
  const p = new EstimatedFlightFallback(empty, { airports, clock });
  const r = { ...req, destinationAirports: ['PUJ'], outboundDate: '2027-05-01', returnDate: '2027-05-08' };
  const live = await p.searchLive(r);
  assert.equal(live.length, 1);
  assert.equal(live[0]?.price.confidence, 'ESTIMATED');
  assert.equal(live[0]?.outbound.departure, '2027-05-01');
  assert.match(live[0]?.priceBasis ?? '', /^Our estimate: no recent prices for LIS–PUJ/);
  // ~6,600 km → ≈ €640 per seat; 3 seats + a baby at 10%.
  const perSeat = p.farePerSeat(6600);
  assert.ok(perSeat > 550 && perSeat < 750, String(perSeat));
  assert.equal((await p.searchIndicative(r))[0]?.price.confidence, 'ESTIMATED');
  // Real cached prices win; errors are not hidden.
  const real = new EstimatedFlightFallback(new TravelpayoutsFlightProvider({ token: 't', clock, fetch: stub({ '/aviasales/v3/grouped_prices': grouped }) }), { airports, clock });
  assert.equal((await real.searchIndicative(req))[0]?.price.confidence, 'INDICATIVE');
  const failing = new EstimatedFlightFallback(new TravelpayoutsFlightProvider({ token: 't', clock, fetch: stub({ '/aviasales/v3/grouped_prices': 401 }) }), { airports, clock });
  await assert.rejects(failing.searchIndicative(req));
});
