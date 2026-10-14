/**
 * First-run check of the real providers configured in services/api/.env.
 *   pnpm check:providers            all configured providers
 *   pnpm check:providers serpapi    only one (travelpayouts | openrouteservice | open-meteo | liteapi | serpapi)
 * Uses at most 2 SerpApi searches (to learn whether its prices are per person or total).
 */
import { addDays, formatMoney, toLocalDate } from '@travel-where-to/shared';
import type { Traveller } from '@travel-where-to/domain';
import { TravelpayoutsFlightProvider, SerpApiGoogleFlightsProvider } from '@travel-where-to/flight-providers';
import { LiteApiAccommodationProvider } from '@travel-where-to/accommodation-providers';
import { OpenRouteServiceRoutingProvider } from '@travel-where-to/routing-providers';
import { OpenMeteoWeatherProvider } from '@travel-where-to/weather-providers';

import { loadEnv } from './loadEnv';
import { checkedKey } from './composition';

const files = loadEnv();
console.log(files.length ? `Using ${files.join(', ')}` : 'No .env found (services/api/.env or repo root).');
const env = process.env;
const only = process.argv[2];
const key = (provider: string, ...names: string[]) => {
  if (only && only !== provider) return '';
  const v = names.map((n) => env[n]?.trim()).find(Boolean) ?? '';
  if (!v) return '';
  try {
    return checkedKey(names[0]!, v);
  } catch (e) {
    console.log(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return '';
  }
};
const SERPAPI = key('serpapi', 'SERPAPI_KEY', 'SERPAPI_API_KEY');
const LITEAPI = key('liteapi', 'LITEAPI_KEY', 'LITEAPI_API_KEY', 'LITE_API_KEY');
const ORS = key('openrouteservice', 'ORS_API_KEY', 'OPENROUTESERVICE_API_KEY');
const TP = key('travelpayouts', 'TRAVELPAYOUTS_TOKEN', 'TRAVELPAYOUTS_API_TOKEN');
const want = (name: string, configured: boolean) => (only ? only === name : configured);

const start = addDays(toLocalDate(new Date()), 30);
const end = addDays(start, 4);
const two: Traveller[] = [{ type: 'ADULT' }, { type: 'ADULT' }];
const one: Traveller[] = [{ type: 'ADULT' }];
const lisbon = { lat: 38.7223, lon: -9.1393 };
const malaga = { lat: 36.7213, lon: -4.4214 };

async function step(name: string, fn: () => Promise<string>) {
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    console.log(`  ✓ ${await fn()}`);
  } catch (e) {
    console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

if (want('travelpayouts', !!TP)) {
  await step('Travelpayouts - LIS → AGP, cached round trips', async () => {
    const p = new TravelpayoutsFlightProvider({ token: TP, market: env.TRAVELPAYOUTS_MARKET || 'pt' });
    let found = 0;
    let sample = '';
    for (let i = 0; i < 20 && found < 3; i++) {
      const out = addDays(start, i);
      const r = await p.searchIndicative({ originAirports: ['LIS'], destinationAirports: ['AGP'], outboundDate: out, returnDate: addDays(out, 4), travellers: one, currency: 'EUR' });
      if (r[0]) {
        found++;
        sample ||= `${out}: ${formatMoney(r[0].price.amount)} per adult (direct: ${r[0].direct})`;
      }
    }
    return found ? `${found} dated prices found, e.g. ${sample}` : 'token OK but no cached prices for these dates (try another month)';
  });
}

if (want('openrouteservice', !!ORS)) {
  await step('openrouteservice - Lisbon → Málaga by car', async () => {
    const r = await new OpenRouteServiceRoutingProvider({ apiKey: ORS }).calculateRoute({ from: lisbon, to: malaga });
    return `${r.distanceKm} km, ${Math.floor(r.durationMinutes / 60)}h${String(r.durationMinutes % 60).padStart(2, '0')}, tolls ≈ ${r.tolls ? formatMoney(r.tolls) : 'n/a'}`;
  });
}

if (want('open-meteo', env.WEATHER_PROVIDER?.trim() === 'open-meteo')) {
  await step('Open-Meteo - Málaga forecast and climate', async () => {
    const p = new OpenMeteoWeatherProvider(env.OPEN_METEO_API_KEY ? { apiKey: env.OPEN_METEO_API_KEY } : {});
    const soon = toLocalDate(new Date());
    const f = await p.getForecast({ locationId: 'malaga', coordinates: malaga, startDate: addDays(soon, 2), endDate: addDays(soon, 5) });
    const c = await p.getForecast({ locationId: 'malaga', coordinates: malaga, startDate: start, endDate: end });
    return `forecast ${f.avgHighC}°C/${f.avgLowC}°C (${f.confidence}); in a month ${c.avgHighC}°C/${c.avgLowC}°C (${c.confidence})`;
  });
}

if (want('liteapi', !!LITEAPI)) {
  await step('LiteAPI - hotels around Málaga centre, 2 adults + child 5', async () => {
    const p = new LiteApiAccommodationProvider({ apiKey: LITEAPI });
    const offers = await p.search({
      locationId: 'malaga', locationName: 'Málaga, Spain', centre: malaga, checkIn: start, checkOut: end,
      travellers: [...two, { type: 'CHILD', age: 5 }], types: ['HOTEL'], currency: 'EUR',
    });
    const cheapest = [...offers].sort((a, b) => a.price.amount.amountMinor - b.price.amount.amountMinor).slice(0, 3);
    return `${offers.length} hotels with rates. Cheapest: ${cheapest.map((o) => `${o.name} ${formatMoney(o.price.amount)}${o.rating ? ` (${o.rating})` : ''}`).join('; ') || '-'}`;
  });
}

if (want('serpapi', !!SERPAPI)) {
  await step('SerpApi Google Flights - per person or total? (uses 2 searches)', async () => {
    const p = new SerpApiGoogleFlightsProvider({ apiKey: SERPAPI, gl: env.SERPAPI_GL || 'pt' });
    const req = { originAirports: ['LIS'], destinationAirports: ['AGP'], outboundDate: start, returnDate: end, currency: 'EUR' };
    const a = (await p.searchLive({ ...req, travellers: one }))[0];
    const b = (await p.searchLive({ ...req, travellers: two }))[0];
    if (!a || !b) return 'key OK but no flights returned for this test route';
    const ratio = b.price.amount.amountMinor / a.price.amount.amountMinor;
    const verdict = ratio > 1.6 ? 'prices are TOTAL for all passengers → keep SERPAPI_PRICE_PER_PERSON=false' : 'prices look PER PERSON → set SERPAPI_PRICE_PER_PERSON=true';
    return `1 adult ${formatMoney(a.price.amount)}, 2 adults ${formatMoney(b.price.amount)} (×${ratio.toFixed(2)}): ${verdict}`;
  });
}
console.log('');
