import type { Money } from '@travel-where-to/shared';
import { DEFAULT_WEIGHTS, type RankingWeights } from '@travel-where-to/ranking';

export interface SearchEngineConfig {
    /** Results up to this fraction above budget are still shown, flagged as above budget. */
    readonly budgetTolerance: number;
    readonly maxResults: number;
    /** Max date combinations considered per destination for flexible windows. */
    readonly maxStayOptions: number;
    /** After indicative pricing, how many date combinations per destination get live searches. */
    readonly liveStaysPerDestination: number;
    readonly providerTimeoutMs: number;
    readonly concurrency: number;
    readonly weights: RankingWeights;
    /** Check-in, security and boarding time added to door-to-door flight time (one way). */
    readonly airportOverheadMinutes: number;
    /** Arrival airport → accommodation transfer time (one way). */
    readonly arrivalTransferMinutes: number;
    readonly airportParkingPerDay?: Money;
    /** Run constraint relaxation when fewer than this many results are found. */
    readonly relaxWhenFewerThan: number;
    readonly maxAlternatives: number;
    /** How many top results get a live flight price check when a verifier is configured. */
    readonly verifyTop: number;
    /** Size of each budget view (cheapest, best within budget). 0 turns them off. */
    readonly picksPerList: number;
    /** "Best use of your budget" prefers trips costing at least this share of the budget. */
    readonly fullBudgetFloor: number;
}

export const DEFAULT_CONFIG: SearchEngineConfig = {
    budgetTolerance: 0.1,
    maxResults: 10,
    maxStayOptions: 16,
    liveStaysPerDestination: 3,
    providerTimeoutMs: 8000,
    concurrency: 6,
    weights: DEFAULT_WEIGHTS,
    airportOverheadMinutes: 120,
    arrivalTransferMinutes: 30,
    relaxWhenFewerThan: 1,
    maxAlternatives: 5,
    verifyTop: 5,
    picksPerList: 5,
    fullBudgetFloor: 0.75,
};
