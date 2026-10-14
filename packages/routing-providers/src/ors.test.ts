import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderError } from '@travel-where-to/domain';
import { OpenRouteServiceRoutingProvider } from './OpenRouteServiceRoutingProvider';

const from = { lat: 38.566, lon: -8.94 };
const to = { lat: 36.7213, lon: -4.4214 };

test('maps distance, duration and estimated tolls; sends [lon, lat]; caches', async () => {
  const bodies: string[] = [];
  const p = new OpenRouteServiceRoutingProvider({
    apiKey: 'k',
    fetch: async (_url, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ routes: [{ summary: { distance: 523456, duration: 18720 }, extras: { tollways: { summary: [{ value: 1, distance: 200000, amount: 38 }, { value: 0, distance: 323456, amount: 62 }] } } }] }));
    },
  });
  const r = await p.calculateRoute({ from, to });
  assert.equal(r.distanceKm, 523.5);
  assert.equal(r.durationMinutes, 312);
  assert.deepEqual(r.tolls, { amountMinor: 1800, currency: 'EUR' }); // 200 km × €0.09
  assert.equal(r.provider, 'openrouteservice');
  assert.deepEqual(JSON.parse(bodies[0]!).coordinates[0], [-8.94, 38.566]);
  await p.calculateRoute({ from, to });
  assert.equal(bodies.length, 1);
});

test('no route and quota errors become provider errors; bad payloads are rejected', async () => {
  const make = (status: number, body: unknown) => new OpenRouteServiceRoutingProvider({ apiKey: 'k', fetch: async () => new Response(JSON.stringify(body), { status }) });
  await assert.rejects(make(404, { error: { code: 2010, message: 'Could not find routable point' } }).calculateRoute({ from, to }), (e: unknown) => e instanceof ProviderError && e.kind === 'UNAVAILABLE');
  await assert.rejects(make(429, { error: 'Rate limit exceeded' }).calculateRoute({ from, to }), (e: unknown) => e instanceof ProviderError && e.kind === 'RATE_LIMITED');
  await assert.rejects(make(403, { error: 'Access to this API has been disallowed' }).calculateRoute({ from, to }), (e: unknown) => e instanceof ProviderError && e.kind === 'AUTHENTICATION');
  await assert.rejects(make(200, { routes: [] }).calculateRoute({ from, to }), (e: unknown) => e instanceof ProviderError && e.kind === 'INVALID_RESPONSE');
});
