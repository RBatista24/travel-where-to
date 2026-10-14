import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, fixedClock } from '@travel-where-to/shared';
import { ProviderError } from '@travel-where-to/domain';
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider';

const clock = fixedClock('2026-10-05T12:00:00Z');
const req = (startDate: string, endDate: string) => ({
    locationId: 'malaga',
    coordinates: { lat: 36.72, lon: -4.42 },
    startDate,
    endDate,
});

function series(
    start: string,
    end: string,
    f: (day: string) => [number | null, number | null, number | null],
) {
    const time: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) time.push(d);
    const v = time.map(f);
    return {
        daily: {
            time,
            temperature_2m_max: v.map((x) => x[0]),
            temperature_2m_min: v.map((x) => x[1]),
            precipitation_sum: v.map((x) => x[2]),
        },
    };
}

test('near trips use the forecast for the nights of the stay', async () => {
    const urls: string[] = [];
    const p = new OpenMeteoWeatherProvider({
        clock,
        fetch: async (url) => {
            urls.push(url);
            return new Response(
                JSON.stringify(
                    series('2026-10-10', '2026-10-12', (d) => [
                        d.endsWith('10') ? 24 : 22,
                        15,
                        d.endsWith('11') ? 3.2 : 0,
                    ]),
                ),
            );
        },
    });
    const w = await p.getForecast(req('2026-10-10', '2026-10-13'));
    assert.equal(w.confidence, 'FORECAST');
    assert.equal(w.avgHighC, 22.7);
    assert.equal(w.rainyDaysExpected, 1);
    const u = new URL(urls[0]!);
    assert.equal(u.hostname, 'api.open-meteo.com');
    assert.equal(u.searchParams.get('end_date'), '2026-10-12');
});

test('later trips use monthly averages from the archive, fetched once per place', async () => {
    const urls: string[] = [];
    const p = new OpenMeteoWeatherProvider({
        clock,
        climateYears: 2,
        fetch: async (url) => {
            urls.push(url);
            // November: highs 20, lows 12, rain on the 1st–6th of each November; December: highs 16.
            return new Response(
                JSON.stringify(
                    series('2024-01-01', '2025-12-31', (d) => {
                        const m = d.slice(5, 7);
                        return [
                            m === '11' ? 20 : m === '12' ? 16 : 25,
                            m === '11' ? 12 : 8,
                            m === '11' && Number(d.slice(8, 10)) <= 6 ? 5 : 0,
                        ];
                    }),
                ),
            );
        },
    });
    const w = await p.getForecast(req('2026-11-28', '2026-12-02'));
    assert.equal(w.confidence, 'CLIMATE_AVERAGE');
    assert.equal(w.avgHighC, 19); // 3 November nights (20) + 1 December night (16)
    assert.equal(w.rainyDaysExpected, 0.6); // 6/30 per November night × 3
    await p.getForecast(req('2026-11-14', '2026-11-18'));
    assert.equal(urls.length, 1);
    const u = new URL(urls[0]!);
    assert.equal(u.hostname, 'archive-api.open-meteo.com');
    assert.equal(u.searchParams.get('start_date'), '2024-01-01');
});

test('errors and empty data become provider errors, never made-up weather', async () => {
    const bad = new OpenMeteoWeatherProvider({
        clock,
        fetch: async () =>
            new Response(JSON.stringify({ error: true, reason: 'Latitude must be in range' }), {
                status: 400,
            }),
    });
    await assert.rejects(bad.getForecast(req('2026-10-10', '2026-10-12')), ProviderError);
    const empty = new OpenMeteoWeatherProvider({
        clock,
        fetch: async () =>
            new Response(
                JSON.stringify(series('2026-10-10', '2026-10-11', () => [null, null, null])),
            ),
    });
    await assert.rejects(
        empty.getForecast(req('2026-10-10', '2026-10-12')),
        (e: unknown) => e instanceof ProviderError && e.kind === 'INVALID_RESPONSE',
    );
});
