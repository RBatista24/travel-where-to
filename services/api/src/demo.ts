/**
 * Runs the V1 success-criteria query (spec §56) against the mock providers and prints the results.
 *   pnpm demo
 */
import { eur, formatMoney } from '@travel-where-to/shared';
import type { SearchCriteria } from '@travel-where-to/domain';
import { formatDuration } from '@travel-where-to/ranking';
import { createMockSearchEngine } from './composition';

const criteria: SearchCriteria = {
  origin: { label: 'Quinta do Anjo', coordinates: { lat: 38.566, lon: -8.94 }, countryCode: 'PT' },
  dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-30', nights: 4 },
  travellers: [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }],
  budget: eur(1000),
  transport: { modes: ['FLIGHT', 'CAR'], driving: { maxHours: 5, preferredMaxHours: 4.5 } },
  destination: { kind: 'DISCOVER' },
  requirements: [
    { kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' },
    { kind: 'FACILITY', facility: 'heatedPool', priority: 'IMPORTANT' },
    { kind: 'DESTINATION', attribute: 'nightlife', priority: 'AVOID' },
  ],
  accommodation: { types: ['HOTEL', 'APARTMENT'], minRating: 8 },
  weather: { preferWarm: true },
};

const result = await createMockSearchEngine().search(criteria);
console.log(`\n${result.searchId} - "€1,000, four nights, two adults and one child, warm beach destination in November"`);
console.log('All prices come from MOCK providers.\n');
result.recommendations.forEach((r, i) => {
  const t = r.transport;
  const how = t.mode === 'FLIGHT' ? `flight from ${t.departureAirport.iata}` : `car, ${formatDuration(t.route.durationMinutes)}`;
  console.log(
    `${String(i + 1).padStart(2)}. ${r.destination.name.padEnd(28)} ${String(r.score.total).padStart(3)}% match  ` +
      `${formatMoney(r.costs.tripTotal).padStart(9)} = ${formatMoney(r.costs.bookableTotal)} bookable + ${formatMoney(r.costs.estimatedInBudget)} est.  | food ~${formatMoney(r.costs.estimatedExtras)}  ` +
      `${r.checkIn} → ${r.checkOut}  ${how}`,
  );
  for (const reason of r.reasons.slice(0, 8)) console.log(`      ${reason.tone === 'WARNING' ? '⚠' : reason.tone === 'POSITIVE' ? '✓' : '·'} ${reason.message}`);
});
if (result.notices.length) console.log(`\nNotices:\n  ${result.notices.join('\n  ')}`);
if (result.relaxations.length) console.log(`\nTry instead:\n  ${result.relaxations.map((s) => `${s.description} → ${s.resultCount} options`).join('\n  ')}`);
