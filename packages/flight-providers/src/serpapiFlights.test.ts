import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock } from '@travel-where-to/shared';
import { ProviderError, type FlightDiscoveryRequest } from '@travel-where-to/domain';
import { SerpApiGoogleFlightsProvider } from './SerpApiGoogleFlightsProvider';

const clock = fixedClock('2026-10-05T12:00:00Z');
const req: FlightDiscoveryRequest = {
    originAirports: ['LIS'],
    destinationAirports: ['AGP'],
    outboundDate: '2026-11-14',
    returnDate: '2026-11-18',
    currency: 'EUR',
    travellers: [
        { type: 'ADULT' },
        { type: 'ADULT' },
        { type: 'CHILD', age: 5 },
        { type: 'CHILD', age: 13 },
        { type: 'INFANT', age: 1 },
    ],
};
const itinerary = (price: number, segments: number) => ({
    flights: Array.from({ length: segments }, (_, i) => ({
        departure_airport: {
            id: i === 0 ? 'LIS' : 'MAD',
            name: 'x',
            time: i === 0 ? '2026-11-14 08:05' : '2026-11-14 12:00',
        },
        arrival_airport: {
            id: i === segments - 1 ? 'AGP' : 'MAD',
            name: 'y',
            time: i === segments - 1 ? '2026-11-14 14:30' : '2026-11-14 10:30',
        },
        duration: 90,
        airline: i === 0 ? 'TAP Air Portugal' : 'Iberia',
        flight_number: `TP ${100 + i}`,
    })),
    total_duration: segments === 1 ? 85 : 265,
    price,
    type: 'Round trip',
    departure_token: 'tok',
});

test('maps Google Flights itineraries to VERIFIED offers with an expiry and the search link', async () => {
    const urls: string[] = [];
    const p = new SerpApiGoogleFlightsProvider({
        apiKey: 'k',
        clock,
        fetch: async (url) => {
            urls.push(url);
            return new Response(
                JSON.stringify({
                    search_metadata: {
                        google_flights_url: 'https://www.google.com/travel/flights?tfs=abc',
                    },
                    best_flights: [itinerary(612, 1)],
                    other_flights: [itinerary(540, 2), { price: 'x' }],
                }),
            );
        },
    });
    const offers = await p.searchLive(req);
    assert.equal(offers.length, 2);
    assert.equal(offers[0]?.price.amount.amountMinor, 54000); // sorted, total as returned
    assert.equal(offers[0]?.outbound.stops, 1);
    assert.equal(offers[0]?.outbound.carrier, 'TAP Air Portugal + Iberia');
    assert.equal(offers[1]?.outbound.arrival, '2026-11-14T14:30');
    assert.equal(offers[1]?.inbound, undefined);
    assert.equal(offers[1]?.price.confidence, 'VERIFIED');
    assert.equal(offers[1]?.price.attribution.expiresAt?.toISOString(), '2026-10-05T13:00:00.000Z');
    assert.equal(
        offers[1]?.price.attribution.deepLink,
        'https://www.google.com/travel/flights?tfs=abc',
    );
    const u = new URL(urls[0]!);
    // 13-year-old flies as an adult on Google Flights; baby on lap.
    assert.equal(u.searchParams.get('adults'), '3');
    assert.equal(u.searchParams.get('children'), '1');
    assert.equal(u.searchParams.get('infants_on_lap'), '1');
    assert.equal(u.searchParams.get('type'), '1');
    await p.searchLive(req);
    assert.equal(urls.length, 1, 'cached');
});

test('per-person mode multiplies by travellers; "no results" is an empty answer; quota is RATE_LIMITED', async () => {
    const perPerson = new SerpApiGoogleFlightsProvider({
        apiKey: 'k',
        clock,
        pricePerPerson: true,
        fetch: async () => new Response(JSON.stringify({ best_flights: [itinerary(100, 1)] })),
    });
    assert.equal((await perPerson.searchLive(req))[0]?.price.amount.amountMinor, 50000);
    const none = new SerpApiGoogleFlightsProvider({
        apiKey: 'k',
        clock,
        fetch: async () =>
            new Response(
                JSON.stringify({
                    error: "Google Flights hasn't returned any results for this query.",
                }),
            ),
    });
    assert.deepEqual(await none.searchLive(req), []);
    const quota = new SerpApiGoogleFlightsProvider({
        apiKey: 'k',
        clock,
        fetch: async () =>
            new Response(JSON.stringify({ error: 'Your account has run out of searches.' })),
    });
    await assert.rejects(
        quota.searchLive(req),
        (e: unknown) => e instanceof ProviderError && e.kind === 'RATE_LIMITED',
    );
    const auth = new SerpApiGoogleFlightsProvider({
        apiKey: 'k',
        clock,
        fetch: async () =>
            new Response(JSON.stringify({ error: 'Invalid API key.' }), { status: 401 }),
    });
    await assert.rejects(
        auth.searchLive(req),
        (e: unknown) => e instanceof ProviderError && e.kind === 'AUTHENTICATION',
    );
});

test('flight preferences are sent to Google Flights (non-stop, hour ranges) and marked on offers', async () => {
    const urls: string[] = [];
    const p = new SerpApiGoogleFlightsProvider({
        apiKey: 'k',
        clock,
        fetch: async (url) => (
            urls.push(url),
            new Response(JSON.stringify({ best_flights: [itinerary(300, 1)] }))
        ),
    });
    const offers = await p.searchLive({
        ...req,
        preferences: {
            directOnly: true,
            outboundTimes: ['MORNING', 'AFTERNOON'],
            returnTimes: ['MORNING', 'EVENING'],
        },
    });
    const u = new URL(urls[0]!);
    assert.equal(u.searchParams.get('stops'), '1');
    assert.equal(u.searchParams.get('outbound_times'), '5,17');
    assert.equal(u.searchParams.get('return_times'), '5,23');
    // Morning + evening isn't one range: Google gets the span, the return time stays unconfirmed.
    assert.deepEqual(offers[0]?.filteredBy, { directOnly: true, outboundTimes: true });
    assert.equal(
        SerpApiGoogleFlightsProvider.timeRange(['NIGHT', 'MORNING', 'AFTERNOON', 'EVENING']),
        undefined,
    );
});
