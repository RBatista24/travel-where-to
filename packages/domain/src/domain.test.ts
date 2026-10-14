import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '@travel-where-to/shared';
import { countTravellers, validateTravellers } from './travellers';
import { nightsOf, validateCriteria, type SearchCriteria } from './criteria';
import { weakestConfidence } from './pricing';

const base: SearchCriteria = {
  origin: { label: 'Lisbon', coordinates: { lat: 38.72, lon: -9.14 }, countryCode: 'PT' },
  dates: { kind: 'EXACT', checkIn: '2026-11-14', checkOut: '2026-11-18' },
  travellers: [{ type: 'ADULT' }],
  budget: eur(1000),
  transport: { modes: ['FLIGHT'] },
  destination: { kind: 'DISCOVER' },
  requirements: [],
  accommodation: { types: ['HOTEL'] },
};

test('travellers: children and infants need valid ages; adults required', () => {
  assert.deepEqual(validateTravellers([{ type: 'ADULT' }, { type: 'CHILD', age: 5 }, { type: 'INFANT', age: 1 }]), []);
  assert.ok(validateTravellers([{ type: 'CHILD', age: 5 }]).some((e) => e.includes('adult')));
  assert.ok(validateTravellers([{ type: 'ADULT' }, { type: 'CHILD' }]).some((e) => e.includes('age is required')));
  assert.ok(validateTravellers([{ type: 'ADULT' }, { type: 'CHILD', age: 1 }]).length > 0);
  assert.ok(validateTravellers([{ type: 'ADULT' }, { type: 'INFANT', age: 0 }, { type: 'INFANT', age: 1 }]).length > 0);
  const c = countTravellers([{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 3 }, { type: 'CHILD', age: 7 }]);
  assert.deepEqual(c.childAges, [3, 7]);
});

test('criteria: date validation', () => {
  assert.deepEqual(validateCriteria(base, '2026-10-05'), []);
  assert.equal(nightsOf(base.dates), 4);
  assert.ok(validateCriteria(base, '2026-12-01').some((e) => e.includes('past')));
  const short: SearchCriteria = { ...base, dates: { kind: 'FLEXIBLE', windowStart: '2026-11-01', windowEnd: '2026-11-03', nights: 4 } };
  assert.ok(validateCriteria(short, '2026-10-05').some((e) => e.includes('shorter')));
  const bad: SearchCriteria = { ...base, dates: { kind: 'EXACT', checkIn: '2026-11-18', checkOut: '2026-11-18' } };
  assert.ok(validateCriteria(bad, '2026-10-05').some((e) => e.includes('after')));
});

test('weakest confidence', () => {
  assert.equal(weakestConfidence(['VERIFIED', 'INDICATIVE']), 'INDICATIVE');
  assert.equal(weakestConfidence(['VERIFIED', 'ESTIMATED', 'INDICATIVE']), 'ESTIMATED');
  assert.equal(weakestConfidence(['VERIFIED']), 'VERIFIED');
});
