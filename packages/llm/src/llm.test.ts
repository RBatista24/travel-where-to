import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretTravelRequest, LlmOutputError, type LlmProvider } from './index';

const fake = (output: unknown): LlmProvider => ({
    name: 'fake',
    interpretTravelRequest: async () => output,
    explainRecommendation: async () => '',
});

test('valid structured output is accepted and labelled as AI interpretation', async () => {
    const r = await interpretTravelRequest(
        fake({
            requirements: [
                { kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' },
                { kind: 'DESTINATION', attribute: 'nightlife', priority: 'AVOID' },
                { kind: 'FACILITY', facility: 'heatedPool', priority: 'IMPORTANT' },
            ],
            budget: { amount: 1000, currency: 'EUR' },
        }),
        'beach, no party area, heated pool, €1000',
    );
    assert.equal(r.origin, 'AI_INTERPRETATION');
    assert.equal(r.intent.requirements.length, 3);
    assert.deepEqual(r.intent.unmapped, []);
});

test('invented fields such as prices are rejected', async () => {
    await assert.rejects(
        interpretTravelRequest(fake({ requirements: [], flightPrice: 284 }), 'x'),
        LlmOutputError,
    );
    await assert.rejects(
        interpretTravelRequest(
            fake({
                requirements: [
                    { kind: 'DESTINATION', attribute: 'casinos', priority: 'MUST_HAVE' },
                ],
            }),
            'x',
        ),
        LlmOutputError,
    );
});
