import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eur, haversineKm } from '@travel-where-to/shared';
import { DESTINATION_ATTRIBUTES, type SearchCriteria } from '@travel-where-to/domain';
import { DESTINATION_CATALOGUE } from './catalogue';
import { generateCandidates } from './candidates';
import { buildStayOptions } from './stays';

const criteria: SearchCriteria = {
  origin: { label: 'Quinta do Anjo', coordinates: { lat: 38.566, lon: -8.94 }, countryCode: 'PT' },
  dates: { kind: 'EXACT', checkIn: '2026-11-14', checkOut: '2026-11-18' },
  travellers: [{ type: 'ADULT' }],
  budget: eur(1000),
  transport: { modes: ['FLIGHT', 'CAR'] },
  destination: { kind: 'DISCOVER' },
  requirements: [],
  accommodation: { types: ['HOTEL'] },
};

test('catalogue integrity', () => {
  const ids = new Set<string>();
  for (const d of DESTINATION_CATALOGUE) {
    assert.ok(!ids.has(d.id), `duplicate ${d.id}`);
    ids.add(d.id);
    assert.equal(d.climate.avgHighC.length, 12, d.id);
    assert.equal(d.climate.avgLowC.length, 12, d.id);
    assert.equal(d.climate.rainyDays.length, 12, d.id);
    assert.ok(d.airports.length > 0, d.id);
    for (const a of DESTINATION_ATTRIBUTES) assert.ok(d.scores[a] >= 0 && d.scores[a] <= 100, `${d.id}.${a}`);
    for (const ap of d.airports) assert.ok(haversineKm(ap.coordinates, d.coordinates) < 120, `${d.id} airport ${ap.iata} too far`);
  }
  assert.ok(DESTINATION_CATALOGUE.length >= 20);
});

test('MUST_HAVE destination attributes filter candidates', () => {
  const r = generateCandidates({ ...criteria, requirements: [{ kind: 'DESTINATION', attribute: 'beach', priority: 'MUST_HAVE' }] }, DESTINATION_CATALOGUE);
  assert.ok(r.candidates.every((d) => d.scores.beach >= 60));
  assert.ok(r.excluded.some((e) => e.destinationId === 'madrid'));
});

test('car-only searches drop islands and destinations beyond the hard driving limit', () => {
  const r = generateCandidates({ ...criteria, transport: { modes: ['CAR'], driving: { maxHours: 5 } } }, DESTINATION_CATALOGUE);
  const ids = r.candidates.map((d) => d.id);
  assert.ok(!ids.includes('funchal'));
  assert.ok(!ids.includes('paris'));
  assert.ok(ids.includes('seville'));
  assert.equal(r.excluded.find((e) => e.destinationId === 'funchal')?.reason, 'Not reachable by car');
});

test('known destination search keeps only the requested ids and reports unknown ones', () => {
  const r = generateCandidates({ ...criteria, destination: { kind: 'KNOWN', destinationIds: ['rome', 'atlantis'] } }, DESTINATION_CATALOGUE);
  assert.deepEqual(r.candidates.map((d) => d.id), ['rome']);
  assert.ok(r.excluded.some((e) => e.destinationId === 'atlantis'));
});

test('stay options: exact, flexible and sampled', () => {
  assert.equal(buildStayOptions(criteria.dates).length, 1);
  const nov = buildStayOptions({ kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-30', nights: 4 }, 100);
  assert.equal(nov.length, 26);
  const sampled = buildStayOptions({ kind: 'FLEXIBLE', windowStart: '2027-03-01', windowEnd: '2027-06-30', nights: 3 }, 16);
  assert.equal(sampled.length, 16);
  assert.equal(sampled[0]?.checkIn, '2027-03-01');
  assert.equal(sampled[15]?.checkOut, '2027-06-30');
});
