import type { Money } from '@travel-where-to/shared';

/**
 * VERIFIED   – recently retrieved, bookable provider price
 * INDICATIVE – provider-generated price that may not be currently bookable
 * ESTIMATED  – calculated by this application (fuel, food, parking…)
 */
export const PriceConfidence = {
  VERIFIED: 'VERIFIED',
  INDICATIVE: 'INDICATIVE',
  ESTIMATED: 'ESTIMATED',
} as const;
export type PriceConfidence = (typeof PriceConfidence)[keyof typeof PriceConfidence];

const CONFIDENCE_RANK: Record<PriceConfidence, number> = { VERIFIED: 2, INDICATIVE: 1, ESTIMATED: 0 };

/** The weakest confidence in a set of values. */
export function weakestConfidence(values: readonly PriceConfidence[]): PriceConfidence {
  return values.reduce<PriceConfidence>(
    (acc, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[acc] ? c : acc),
    PriceConfidence.VERIFIED,
  );
}

/** Where a provider-derived value came from. Required for every non-estimated price. */
export interface ProviderAttribution {
  readonly provider: string;
  readonly providerOfferId: string;
  readonly retrievedAt: Date;
  readonly expiresAt?: Date;
  readonly deepLink?: string;
}

export interface ProviderPrice {
  readonly amount: Money;
  /** ESTIMATED only for our own fallback estimates (e.g. no cached flight price), always labelled. */
  readonly confidence: PriceConfidence;
  readonly attribution: ProviderAttribution;
}

export function isExpired(attribution: ProviderAttribution, now: Date): boolean {
  return attribution.expiresAt !== undefined && attribution.expiresAt.getTime() <= now.getTime();
}

export const CostKind = {
  FLIGHT: 'FLIGHT',
  ACCOMMODATION: 'ACCOMMODATION',
  CAR_FUEL: 'CAR_FUEL',
  CAR_TOLLS: 'CAR_TOLLS',
  AIRPORT_ACCESS_FUEL: 'AIRPORT_ACCESS_FUEL',
  AIRPORT_ACCESS_TOLLS: 'AIRPORT_ACCESS_TOLLS',
  AIRPORT_PARKING: 'AIRPORT_PARKING',
  FOOD: 'FOOD',
  PARK_TICKETS: 'PARK_TICKETS',
} as const;
export type CostKind = (typeof CostKind)[keyof typeof CostKind];

export interface CostItem {
  readonly kind: CostKind;
  readonly label: string;
  readonly amount: Money;
  readonly confidence: PriceConfidence;
  /** Present for provider-derived prices. Absent only for ESTIMATED items. */
  readonly attribution?: ProviderAttribution;
  /** Food is shown separately and is NOT part of the primary budget in V1. */
  readonly countsTowardsBudget: boolean;
  /** Human-readable explanation of how an estimate was produced. */
  readonly basis?: string;
  /** Where to check or buy it (e.g. the park's official ticket page). */
  readonly link?: string;
}

export interface CostBreakdown {
  readonly items: readonly CostItem[];
  /** Sum of items that count towards the budget (transport, accommodation, known extras). */
  readonly tripTotal: Money;
  readonly tripTotalConfidence: PriceConfidence;
  /** Part of tripTotal backed by provider prices (VERIFIED or INDICATIVE): what you would pay when booking. */
  readonly bookableTotal: Money;
  /** Part of tripTotal that is our own estimate (fuel, tolls, parking). */
  readonly estimatedInBudget: Money;
  /** Sum of estimates shown outside the budget (food). */
  readonly estimatedExtras: Money;
  readonly estimatedOverall: Money;
  /** tripTotal − budget. Positive = above budget. */
  readonly budgetDifference: Money;
  readonly withinBudget: boolean;
}
