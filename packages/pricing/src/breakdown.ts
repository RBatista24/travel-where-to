import type { Money } from '@travel-where-to/shared';
import { addMoney, subtractMoney, sumMoney } from '@travel-where-to/shared';
import type { CostBreakdown, CostItem, PriceConfidence } from '@travel-where-to/domain';
import { weakestConfidence } from '@travel-where-to/domain';

export function buildCostBreakdown(items: readonly CostItem[], budget: Money): CostBreakdown {
    const currency = budget.currency;
    const inBudget = items.filter((i) => i.countsTowardsBudget);
    const extras = items.filter((i) => !i.countsTowardsBudget);
    const tripTotal = sumMoney(
        inBudget.map((i) => i.amount),
        currency,
    );
    const estimatedExtras = sumMoney(
        extras.map((i) => i.amount),
        currency,
    );
    const budgetDifference = subtractMoney(tripTotal, budget);
    const confidences: PriceConfidence[] = inBudget.map((i) => i.confidence);
    return {
        items,
        tripTotal,
        tripTotalConfidence: confidences.length ? weakestConfidence(confidences) : 'ESTIMATED',
        bookableTotal: sumMoney(
            inBudget.filter((i) => i.confidence !== 'ESTIMATED').map((i) => i.amount),
            currency,
        ),
        estimatedInBudget: sumMoney(
            inBudget.filter((i) => i.confidence === 'ESTIMATED').map((i) => i.amount),
            currency,
        ),
        estimatedExtras,
        estimatedOverall: addMoney(tripTotal, estimatedExtras),
        budgetDifference,
        withinBudget: budgetDifference.amountMinor <= 0,
    };
}

export interface BudgetEvaluation {
    /** tripTotal / budget */
    readonly ratio: number;
    readonly withinBudget: boolean;
    /** Above budget but within the display tolerance: shown with a warning. */
    readonly withinTolerance: boolean;
}

/**
 * Budget is soft in V1: results up to `tolerance` above budget are kept and flagged.
 * Assumption: default tolerance is 10% (configurable in the search engine).
 */
export function evaluateBudget(
    tripTotal: Money,
    budget: Money,
    tolerance: number,
): BudgetEvaluation {
    const ratio = tripTotal.amountMinor / budget.amountMinor;
    return { ratio, withinBudget: ratio <= 1, withinTolerance: ratio <= 1 + tolerance };
}
