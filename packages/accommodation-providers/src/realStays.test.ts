import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock } from '@travel-where-to/shared';
import { ProviderError, type AccommodationSearchRequest } from '@travel-where-to/domain';
import { LiteApiAccommodationProvider } from './LiteApiAccommodationProvider';
import { mapAmenities, SerpApiGoogleHotelsProvider } from './SerpApiGoogleHotelsProvider';

const clock = fixedClock('2026-10-05T12:00:00Z');
const req: AccommodationSearchRequest = {
    locationId: 'malaga',
    locationName: 'Málaga, Spain',
    centre: { lat: 36.7213, lon: -4.4214 },
    beach: { lat: 36.719, lon: -4.413 },
    checkIn: '2026-11-14',
    checkOut: '2026-11-18',
    travellers: [
        { type: 'ADULT' },
        { type: 'ADULT' },
        { type: 'CHILD', age: 5 },
        { type: 'INFANT', age: 1 },
    ],
    types: ['HOTEL', 'APARTMENT'],
    currency: 'EUR',
};

test('LiteAPI: request carries real occupancy; cheapest rate per hotel; VERIFIED; distances computed', async () => {
    let sent: Record<string, unknown> = {};
    let headers: Headers | undefined;
    const p = new LiteApiAccommodationProvider({
        apiKey: 'sand_key',
        clock,
        fetch: async (_url, init) => {
            sent = JSON.parse(String(init?.body));
            headers = new Headers(init?.headers);
            return new Response(
                JSON.stringify({
                    data: [
                        {
                            hotelId: 'lp1',
                            roomTypes: [
                                {
                                    offerId: 'o-exp',
                                    offerRetailRate: { amount: 640.5, currency: 'EUR' },
                                    rates: [
                                        {
                                            name: 'Family Room',
                                            boardType: 'RO',
                                            boardName: 'Room Only',
                                        },
                                    ],
                                },
                                {
                                    offerId: 'o-cheap',
                                    offerRetailRate: { amount: 512.2, currency: 'EUR' },
                                    rates: [
                                        {
                                            name: 'Double Room',
                                            boardType: 'BB',
                                            boardName: 'Bed & Breakfast',
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            hotelId: 'lp2',
                            roomTypes: [
                                { offerId: 'x', offerRetailRate: { amount: 300, currency: 'USD' } },
                            ],
                        }, // wrong currency
                        {
                            hotelId: 'lp3',
                            roomTypes: [
                                { offerId: 'y', offerRetailRate: { amount: 280, currency: 'EUR' } },
                            ],
                        }, // no hotel data
                    ],
                    hotels: [
                        {
                            id: 'lp1',
                            name: 'Hotel Molina Lario',
                            rating: 8.9,
                            reviewCount: 1200,
                            stars: 4,
                            latitude: 36.7196,
                            longitude: -4.4196,
                        },
                        { id: 'lp2', name: 'Other', latitude: 36.72, longitude: -4.42 },
                    ],
                }),
            );
        },
    });
    const offers = await p.search(req);
    assert.equal(offers.length, 1);
    const o = offers[0]!;
    assert.equal(o.name, 'Hotel Molina Lario');
    assert.deepEqual(o.price.amount, { amountMinor: 51220, currency: 'EUR' });
    assert.equal(o.price.confidence, 'VERIFIED');
    assert.ok(o.price.attribution.expiresAt);
    assert.equal(o.breakfastIncluded, true);
    assert.deepEqual(o.facilities, ['breakfast']);
    assert.equal(o.stars, 4);
    assert.ok((o.distanceToCentreM ?? 0) > 100 && (o.distanceToCentreM ?? 0) < 400);
    assert.deepEqual(sent.occupancies, [{ adults: 2, children: [5, 1] }]);
    assert.equal(sent.includeHotelData, true);
    assert.equal(headers?.get('X-API-Key'), 'sand_key');
});

test('LiteAPI: apartments-only searches return nothing; errors mapped', async () => {
    const p = new LiteApiAccommodationProvider({
        apiKey: 'k',
        clock,
        fetch: async () => new Response('{"error":{"message":"invalid key"}}', { status: 401 }),
    });
    assert.deepEqual(await p.search({ ...req, types: ['APARTMENT'] }), []);
    await assert.rejects(
        p.search(req),
        (e: unknown) => e instanceof ProviderError && e.kind === 'AUTHENTICATION',
    );
});

test('SerpApi Google Hotels: total stay price, rating ×2, amenities mapped, children ages sent', async () => {
    let url = '';
    const p = new SerpApiGoogleHotelsProvider({
        apiKey: 'k',
        clock,
        fetch: async (u) => {
            url = u;
            return new Response(
                JSON.stringify({
                    search_metadata: {
                        google_hotels_url: 'https://www.google.com/travel/search?q=malaga',
                    },
                    properties: [
                        {
                            type: 'hotel',
                            name: 'Room Mate Valeria',
                            link: 'https://room-matehotels.com/valeria',
                            gps_coordinates: { latitude: 36.7175, longitude: -4.4255 },
                            total_rate: { lowest: '€548', extracted_lowest: 548 },
                            extracted_hotel_class: 4,
                            overall_rating: 4.4,
                            reviews: 2100,
                            amenities: [
                                'Free Wi-Fi',
                                'Outdoor pool',
                                'Breakfast ($)',
                                'Pool table',
                            ],
                        },
                        {
                            type: 'hotel',
                            name: 'No price',
                            gps_coordinates: { latitude: 36.7, longitude: -4.4 },
                        },
                    ],
                }),
            );
        },
    });
    const offers = await p.search(req);
    assert.equal(offers.length, 1);
    const o = offers[0]!;
    assert.equal(o.rating, 8.8);
    assert.deepEqual([...o.facilities].sort(), ['breakfast', 'pool']);
    assert.equal(o.price.attribution.deepLink, 'https://room-matehotels.com/valeria');
    const u = new URL(url);
    assert.equal(u.searchParams.get('q'), 'Málaga, Spain');
    assert.equal(u.searchParams.get('children'), '2');
    assert.equal(u.searchParams.get('children_ages'), '5,1');
    assert.deepEqual(mapAmenities(['Heated pool', 'Free parking', 'Kid-friendly']).sort(), [
        'familyRooms',
        'heatedPool',
        'parking',
    ]);
});
