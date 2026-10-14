import type { Money } from '@travel-where-to/shared';
import { formatMoney, multiplyMoney } from '@travel-where-to/shared';
import type { CostItem, Traveller } from '@travel-where-to/domain';
import { countTravellers } from '@travel-where-to/domain';

/** Assumptions: a child eats ~60% of an adult's food budget; infants are not costed. */
export const CHILD_FOOD_FACTOR = 0.6;

export function estimateFoodCost(dailyPerAdult: Money, travellers: readonly Traveller[], nights: number): CostItem {
  const c = countTravellers(travellers);
  const adultEquivalents = c.adults + c.children * CHILD_FOOD_FACTOR;
  return {
    kind: 'FOOD',
    label: 'Food',
    amount: multiplyMoney(dailyPerAdult, adultEquivalents * nights),
    confidence: 'ESTIMATED',
    countsTowardsBudget: false,
    basis: `${nights} days × ${adultEquivalents} adult-equivalents × ${formatMoney(dailyPerAdult)} (cost-of-living reference)`,
  };
}
