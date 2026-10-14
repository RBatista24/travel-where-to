import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eur, fixedClock } from '@travel-where-to/shared';
import { TravelpayoutsFlightProvider } from '@travel-where-to/flight-providers';
import { OpenRouteServiceRoutingProvider } from '@travel-where-to/routing-providers';
import { OpenMeteoWeatherProvider } from '@travel-where-to/weather-providers';
import { createSearchEngine, mockProviders } from './composition';
import { fakeHttp } from './fakeProviderHttp';

/**
 * The search engine running on the real adapters, with HTTP answered by recorded-shape
 * stubs (no network). Proves the adapters' output flows through costs, ranking and UI data.
 */
const clock = fixedClock('2026-10-05T12:00:00Z');
test('discovery on Travelpayouts + openrouteservice + Open-Meteo adapters', async () => {
    const engine = createSearchEngine(
        {
            ...mockProviders(clock),
            flights: new TravelpayoutsFlightProvider({ token: 't', clock, fetch: fakeHttp }),
            routing: new OpenRouteServiceRoutingProvider({ apiKey: 'k', fetch: fakeHttp }),
            weather: new OpenMeteoWeatherProvider({ clock, fetch: fakeHttp }),
        },
        { clock },
    );
    const r = await engine.search({
        origin: { label: 'Lisbon', coordinates: { lat: 38.72, lon: -9.14 }, countryCode: 'PT' },
        dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-30', nights: 4 },
        travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
        budget: eur(1200),
        transport: { modes: ['FLIGHT', 'CAR'], driving: { maxHours: 5 } },
        destination: { kind: 'DISCOVER' },
        requirements: [{ kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' }],
        accommodation: { types: ['HOTEL', 'APARTMENT'] },
    });
    assert.ok(r.recommendations.length >= 5, `got ${r.recommendations.length}`);
    assert.deepEqual(r.sources.flights, { provider: 'travelpayouts', mock: false });
    assert.deepEqual(r.sources.accommodation, { provider: 'mock-accommodation', mock: true });
    const flight = r.recommendations.find((x) => x.transport.mode === 'FLIGHT');
    assert.ok(flight, 'at least one flight trip');
    const item = flight.costs.items.find((i) => i.kind === 'FLIGHT')!;
    assert.equal(item.confidence, 'INDICATIVE');
    assert.match(item.basis ?? '', /per adult/);
    assert.match(
        item.attribution?.deepLink ?? '',
        /^https:\/\/www\.aviasales\.com\/search\/.+21\?t=x$/,
    );
    assert.equal(flight.costs.tripTotalConfidence, 'ESTIMATED');
    assert.equal(flight.weather?.confidence, 'CLIMATE_AVERAGE');
    const car = r.recommendations.find((x) => x.transport.mode === 'CAR');
    if (car && car.transport.mode === 'CAR')
        assert.equal(car.transport.route.provider, 'openrouteservice');
});
