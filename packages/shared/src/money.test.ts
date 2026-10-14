import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMoney, CurrencyMismatchError, eur, formatMoney, money, multiplyMoney, sumMoney } from './money';
import { addDays, daysBetween, enumerateStays, isValidLocalDate } from './dates';

test('money uses integer minor units and rounds half away from zero', () => {
  assert.deepEqual(eur(1.005), { amountMinor: 101, currency: 'EUR' });
  assert.deepEqual(multiplyMoney(eur(10), 0.333), { amountMinor: 333, currency: 'EUR' });
  assert.throws(() => money(1.5, 'EUR'), RangeError);
  assert.throws(() => money(100, 'eur'), RangeError);
});

test('money refuses to mix currencies', () => {
  assert.throws(() => addMoney(eur(1), money(100, 'GBP')), CurrencyMismatchError);
  assert.throws(() => sumMoney([eur(1)], 'GBP'), CurrencyMismatchError);
});

test('formatMoney', () => {
  assert.equal(formatMoney(eur(812)), '€812');
  assert.equal(formatMoney(eur(107.5)), '€107.50');
});

test('local dates', () => {
  assert.equal(isValidLocalDate('2026-02-30'), false);
  assert.equal(addDays('2026-11-28', 4), '2026-12-02');
  assert.equal(daysBetween('2026-11-14', '2026-11-18'), 4);
  const stays = enumerateStays('2026-11-01', '2026-11-06', 4);
  assert.deepEqual(stays, [
    { checkIn: '2026-11-01', checkOut: '2026-11-05' },
    { checkIn: '2026-11-02', checkOut: '2026-11-06' },
  ]);
  assert.deepEqual(enumerateStays('2026-11-01', '2026-11-03', 4), []);
});

test('days-of-week stays: Thursday → Sunday and weekends inside a window', async () => {
  const { enumeratePatternStays } = await import('./dates');
  // Nov 2026: Thursdays 5, 12, 19, 26; the 26th → 29th fits, the window ends on the 29th.
  assert.deepEqual(enumeratePatternStays('2026-11-01', '2026-11-29', [4], [0]).map((s) => s.checkIn), ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26']);
  assert.equal(enumeratePatternStays('2026-11-01', '2026-11-28', [4], [0]).length, 3);
  // Fri → Sun or Mon: two lengths per Friday.
  assert.deepEqual(enumeratePatternStays('2026-11-06', '2026-11-09', [5], [0, 1]), [
    { checkIn: '2026-11-06', checkOut: '2026-11-08' },
    { checkIn: '2026-11-06', checkOut: '2026-11-09' },
  ]);
});
