import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretTravelRequest } from './index';
import { MockLlmProvider } from './MockLlmProvider';

const llm = new MockLlmProvider(() => new Date('2026-10-05T12:00:00Z'));

test('spec §5.4 example → structured, validated requirements', async () => {
    const r = await interpretTravelRequest(
        llm,
        "I want a romantic getaway near the sea, with good restaurants and a nice hotel, but I don't want a party area.",
    );
    const req = r.intent.requirements;
    assert.ok(
        req.some(
            (x) =>
                x.kind === 'DESTINATION' &&
                x.attribute === 'romantic' &&
                x.priority === 'IMPORTANT',
        ),
    );
    assert.ok(req.some((x) => x.kind === 'DESTINATION' && x.attribute === 'beach'));
    assert.ok(req.some((x) => x.kind === 'DESTINATION' && x.attribute === 'gastronomy'));
    assert.ok(
        req.some(
            (x) =>
                x.kind === 'DESTINATION' && x.attribute === 'nightlife' && x.priority === 'AVOID',
        ),
    );
    assert.ok(r.intent.unmapped.includes('a nice hotel'));
});

test('spec §56 query: budget, nights, travellers, month and warmth', async () => {
    const r = await interpretTravelRequest(
        llm,
        'I have €1,000, four nights, two adults and one child aged 5, and I want a warm beach destination in November. Must have a heated pool.',
    );
    assert.deepEqual(r.intent.budget, { amount: 1000, currency: 'EUR' });
    assert.equal(r.intent.nights, 4);
    assert.equal(r.intent.adults, 2);
    assert.deepEqual(r.intent.childAges, [5]);
    assert.deepEqual(r.intent.dateWindow, { start: '2026-11-01', end: '2026-11-30' });
    assert.equal(r.intent.minAvgHighC, 20);
    assert.ok(
        r.intent.requirements.some(
            (x) =>
                x.kind === 'FACILITY' && x.facility === 'heatedPool' && x.priority === 'MUST_HAVE',
        ),
    );
    assert.ok(!r.intent.requirements.some((x) => x.kind === 'FACILITY' && x.facility === 'pool'));
});

test('transport and driving limits', async () => {
    const r = await interpretTravelRequest(
        llm,
        "We don't want to fly, maximum 5 hours of driving, near the mountains",
    );
    assert.deepEqual(r.intent.transportModes, ['CAR']);
    assert.equal(r.intent.maxDrivingHours, 5);
    assert.ok(
        r.intent.requirements.some((x) => x.kind === 'DESTINATION' && x.attribute === 'nature'),
    );
});

test('theme park requests: destination, official hotels, park days', async () => {
    const r = await interpretTravelRequest(
        llm,
        'Disneyland Paris for 3 nights in December with the kids, staying in a hotel inside the park, 2 days in the park',
    );
    assert.deepEqual(r.intent.destinationNames, ['Disneyland Paris']);
    assert.equal(r.intent.parkHotelsOnly, true);
    assert.equal(r.intent.parkDays, 2);
    assert.equal(r.intent.nights, 3);
    assert.deepEqual(r.intent.unmapped, []);
});

test('flight preferences and days of the week', async () => {
    const llm = new MockLlmProvider(() => new Date('2026-10-05T00:00:00Z'));
    const a = (await llm.interpretTravelRequest(
        'Beach in November, only direct flights, leave in the morning and come back in the evening, thursday to sunday',
    )) as Record<string, unknown>;
    assert.equal(a.directFlightsOnly, true);
    assert.deepEqual(a.outboundTimes, ['MORNING']);
    assert.deepEqual(a.returnTimes, ['EVENING']);
    assert.deepEqual([a.departOn, a.returnOn], [[4], [0]]);
    assert.deepEqual(a.unmapped, []);
    const b = (await llm.interpretTravelRequest(
        'weekends in December with morning flights',
    )) as Record<string, unknown>;
    assert.deepEqual([b.departOn, b.returnOn], [[5], [0]]);
    assert.deepEqual([b.outboundTimes, b.returnTimes], [['MORNING'], ['MORNING']]);
    const c = (await llm.interpretTravelRequest('go on thu and back on sun, 3 nights')) as Record<
        string,
        unknown
    >;
    assert.equal(c.minAvgHighC, undefined, '"sun" the day is not sunshine');
    assert.deepEqual(c.unmapped, []);
});
