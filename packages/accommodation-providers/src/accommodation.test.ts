import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock } from '@travel-where-to/shared';
import { ProviderError, type AccommodationSearchRequest } from '@travel-where-to/domain';
import { MockAccommodationProvider } from './MockAccommodationProvider';
import { mapAccommodationResponse } from './mockAccommodationPayload';

const now = new Date('2026-10-05T10:00:00Z');
const req: AccommodationSearchRequest = {
    locationId: 'malaga',
    centre: { lat: 36.7213, lon: -4.4214 },
    beach: { lat: 36.719, lon: -4.413 },
    checkIn: '2026-11-14',
    checkOut: '2026-11-18',
    travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
    types: ['HOTEL', 'APARTMENT'],
    currency: 'EUR',
};

test('mock accommodation is deterministic and attributed', async () => {
    const p = new MockAccommodationProvider({ clock: fixedClock(now) });
    const a = await p.search(req);
    assert.ok(a.length >= 5);
    assert.deepEqual(a, await p.search(req));
    for (const o of a) {
        assert.equal(o.price.confidence, 'VERIFIED');
        assert.ok(o.price.attribution.expiresAt);
        assert.ok(o.distanceToBeachM !== undefined);
    }
});

test('type filter is passed to the provider; no beach reference → no beach distance', async () => {
    const p = new MockAccommodationProvider({ clock: fixedClock(now) });
    const { beach: _b, ...inland } = req;
    const r = await p.search({ ...inland, types: ['APARTMENT'] });
    assert.ok(r.every((o) => o.type === 'APARTMENT' && o.distanceToBeachM === undefined));
});

test('bigger party costs more for the same property', async () => {
    const p = new MockAccommodationProvider({ clock: fixedClock(now) });
    const couple = await p.search({ ...req, travellers: [{ type: 'ADULT' }, { type: 'ADULT' }] });
    const family = await p.search(req);
    const shared = couple.find((c) => family.some((f) => f.propertyId === c.propertyId))!;
    const fam = family.find((f) => f.propertyId === shared.propertyId)!;
    assert.ok(fam.price.amount.amountMinor > shared.price.amount.amountMinor);
});

test('mapping handles missing data and rejects bad records', () => {
    const ctx = { provider: 'x', retrievedAt: now, ttlMinutes: 60, expectedCurrency: 'EUR' };
    assert.throws(() => mapAccommodationResponse({ nope: [] }, ctx), ProviderError);
    const base = {
        hotel_id: 'h',
        name: 'H',
        accommodation_type: 'hotel',
        class: null,
        review_score: null,
        review_count: 0,
        facilities: ['heated_pool', 'spa'],
        latitude: 1,
        longitude: 1,
        distance_to_centre_m: null,
        distance_to_beach_m: null,
        room_name: 'r',
        meal_plan: 'room_only',
        total_price_cents: 10000,
        currency: 'EUR',
        url: 'https://mock-stays.invalid/h',
    };
    const r = mapAccommodationResponse(
        { result: [base, { ...base, total_price_cents: 0 }, { ...base, latitude: 200 }] },
        ctx,
    );
    assert.equal(r.items.length, 1);
    assert.equal(r.rejected, 2);
    const o = r.items[0]!;
    assert.equal(o.rating, undefined);
    assert.equal(o.stars, undefined);
    assert.deepEqual(o.facilities, ['heatedPool']);
});
