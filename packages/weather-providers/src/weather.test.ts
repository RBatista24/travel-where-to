import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock } from '@travel-where-to/shared';
import { ProviderError, type ClimateMetadata } from '@travel-where-to/domain';
import { MockWeatherProvider } from './MockWeatherProvider';

const climate: ClimateMetadata = {
    avgHighC: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    avgLowC: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    rainyDays: Array(12).fill(6),
};

test('far-off trips use climate averages; near trips use forecast confidence', async () => {
    const p = new MockWeatherProvider({
        climateFor: (id) => (id === 'x' ? climate : undefined),
        clock: fixedClock('2026-10-05T00:00:00Z'),
    });
    const far = await p.getForecast({
        locationId: 'x',
        coordinates: { lat: 0, lon: 0 },
        startDate: '2026-11-28',
        endDate: '2026-12-02',
    });
    assert.equal(far.confidence, 'CLIMATE_AVERAGE');
    assert.equal(far.avgHighC, 20.3); // Nov 28–30 (20°C) + Dec 1 (21°C) → 20.25
    assert.equal(far.rainyDaysExpected, 0.8);
    const near = await p.getForecast({
        locationId: 'x',
        coordinates: { lat: 0, lon: 0 },
        startDate: '2026-10-08',
        endDate: '2026-10-10',
    });
    assert.equal(near.confidence, 'FORECAST');
    await assert.rejects(
        p.getForecast({
            locationId: 'y',
            coordinates: { lat: 0, lon: 0 },
            startDate: '2026-11-01',
            endDate: '2026-11-02',
        }),
        ProviderError,
    );
});
