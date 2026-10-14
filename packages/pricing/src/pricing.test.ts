import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyMismatchError, eur, money } from '@travel-where-to/shared';
import type { CostItem, Vehicle } from '@travel-where-to/domain';
import { fuelCost } from './fuel';
import { airportAccessCosts, carTripCosts } from './transportCosts';
import { estimateFoodCost } from './food';
import { buildCostBreakdown, evaluateBudget } from './breakdown';

const diesel: Vehicle = { fuelType: 'DIESEL', consumptionPer100Km: 6.2, fuelPrice: eur(1.65) };

test('fuel: round trip formula from the spec', () => {
  // 500 km one way → 1000 km → 62 L → €102.30
  assert.deepEqual(fuelCost(500, diesel), eur(102.3));
  assert.deepEqual(fuelCost(500, diesel, false), eur(51.15));
  assert.throws(() => fuelCost(-1, diesel), RangeError);
});

test('car trip: tolls are doubled for the round trip and everything is ESTIMATED', () => {
  const items = carTripCosts({ distanceKm: 500, durationMinutes: 300, tolls: eur(20), provider: 'mock' }, diesel);
  assert.equal(items.length, 2);
  assert.deepEqual(items[1]?.amount, eur(40));
  assert.ok(items.every((i) => i.confidence === 'ESTIMATED' && i.countsTowardsBudget));
});

test('airport access: fuel + tolls + parking (spec §16 example shape)', () => {
  const items = airportAccessCosts({
    airportName: 'Porto',
    route: { distanceKm: 340, durationMinutes: 180, tolls: eur(10), provider: 'mock' },
    vehicle: diesel,
    parkingDays: 5,
    parkingPerDay: eur(6),
  });
  assert.deepEqual(items.map((i) => i.kind), ['AIRPORT_ACCESS_FUEL', 'AIRPORT_ACCESS_TOLLS', 'AIRPORT_PARKING']);
  assert.deepEqual(items[0]?.amount, eur(69.56)); // 680 km × 6.2/100 × 1.65
  assert.deepEqual(items[1]?.amount, eur(20));
  assert.deepEqual(items[2]?.amount, eur(30));
});

test('food is an estimate outside the budget; children weighted', () => {
  const food = estimateFoodCost(eur(25), [{ type: 'ADULT' }, { type: 'ADULT' }, { type: 'CHILD', age: 5 }, { type: 'INFANT', age: 1 }], 4);
  assert.deepEqual(food.amount, eur(260)); // 2.6 × 4 × 25
  assert.equal(food.confidence, 'ESTIMATED');
  assert.equal(food.countsTowardsBudget, false);
});

test('breakdown: totals, confidence and budget difference', () => {
  const attribution = { provider: 'mock', providerOfferId: 'x', retrievedAt: new Date() };
  const items: CostItem[] = [
    { kind: 'FLIGHT', label: 'f', amount: eur(284), confidence: 'VERIFIED', attribution, countsTowardsBudget: true },
    { kind: 'ACCOMMODATION', label: 'h', amount: eur(528), confidence: 'VERIFIED', attribution, countsTowardsBudget: true },
    { kind: 'FOOD', label: 'food', amount: eur(220), confidence: 'ESTIMATED', countsTowardsBudget: false },
  ];
  const b = buildCostBreakdown(items, eur(1000));
  assert.deepEqual(b.tripTotal, eur(812));
  assert.equal(b.tripTotalConfidence, 'VERIFIED');
  assert.deepEqual(b.estimatedExtras, eur(220));
  assert.deepEqual(b.estimatedOverall, eur(1032));
  assert.deepEqual(b.budgetDifference, eur(-188));
  assert.equal(b.withinBudget, true);

  const over = buildCostBreakdown([...items, { kind: 'CAR_FUEL', label: 'fuel', amount: eur(200), confidence: 'ESTIMATED', countsTowardsBudget: true }], eur(1000));
  assert.deepEqual(over.budgetDifference, eur(12));
  assert.equal(over.withinBudget, false);
  assert.equal(over.tripTotalConfidence, 'ESTIMATED');
  assert.deepEqual(over.bookableTotal, eur(812));
  assert.deepEqual(over.estimatedInBudget, eur(200));
});

test('breakdown rejects mixed currencies', () => {
  const items: CostItem[] = [{ kind: 'FOOD', label: 'food', amount: money(100, 'GBP'), confidence: 'ESTIMATED', countsTowardsBudget: false }];
  assert.throws(() => buildCostBreakdown(items, eur(1000)), CurrencyMismatchError);
});

test('budget evaluation: slightly above budget stays visible', () => {
  assert.deepEqual(evaluateBudget(eur(1012), eur(1000), 0.1), { ratio: 1.012, withinBudget: false, withinTolerance: true });
  assert.equal(evaluateBudget(eur(1200), eur(1000), 0.1).withinTolerance, false);
});
