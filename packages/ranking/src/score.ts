import type {
    AccommodationOffer,
    CostBreakdown,
    Destination,
    MatchReason,
    ScoreBreakdown,
    SearchCriteria,
    TransportOption,
    WeatherResult,
} from '@travel-where-to/domain';
import { DEFAULT_WEIGHTS, validateWeights, type RankingWeights } from './weights';
import {
    scoreAccommodation,
    scoreBudget,
    scoreLocation,
    scorePreferences,
    scoreTransport,
    scoreWeather,
} from './components';

export interface ScoringInput {
    readonly criteria: SearchCriteria;
    readonly destination: Destination;
    readonly transport: TransportOption;
    readonly accommodation: AccommodationOffer;
    readonly weather: WeatherResult | null;
    readonly costs: CostBreakdown;
    readonly budgetTolerance: number;
}

export interface ScoringResult {
    readonly score: ScoreBreakdown;
    readonly reasons: MatchReason[];
}

/**
 * Deterministic Match Score. Pure function of structured data: same input → same output.
 * The LLM may explain this score but never computes it.
 */
export function computeMatchScore(
    input: ScoringInput,
    weights: RankingWeights = DEFAULT_WEIGHTS,
): ScoringResult {
    validateWeights(weights);
    const budget = scoreBudget(input.costs, input.criteria.budget, input.budgetTolerance);
    const preferences = scorePreferences(input.destination, input.criteria.requirements);
    const transport = scoreTransport(input.transport, input.criteria);
    const accommodation = scoreAccommodation(input.accommodation, input.criteria.requirements);
    const location = scoreLocation(input.accommodation, input.criteria);
    const weather = scoreWeather(input.weather, input.criteria);

    const total =
        (budget.score * weights.budget +
            preferences.score * weights.preferences +
            transport.score * weights.transport +
            accommodation.score * weights.accommodation +
            location.score * weights.location +
            weather.score * weights.weather) /
        100;

    return {
        score: {
            total: Math.round(total),
            budget: budget.score,
            preferences: preferences.score,
            transport: transport.score,
            accommodation: accommodation.score,
            location: location.score,
            weather: weather.score,
            withoutPrice: Math.round(
                (preferences.score * weights.preferences +
                    transport.score * weights.transport +
                    accommodation.score * weights.accommodation +
                    location.score * weights.location +
                    weather.score * weights.weather) /
                    Math.max(1, 100 - weights.budget),
            ),
        },
        reasons: [
            ...budget.reasons,
            ...preferences.reasons,
            ...transport.reasons,
            ...accommodation.reasons,
            ...location.reasons,
            ...weather.reasons,
        ],
    };
}

/** Stable ordering: score desc, then cheaper, then shorter travel, then id. */
export function compareRanked(
    a: { score: ScoreBreakdown; costs: CostBreakdown; transport: TransportOption; id: string },
    b: { score: ScoreBreakdown; costs: CostBreakdown; transport: TransportOption; id: string },
): number {
    return (
        b.score.total - a.score.total ||
        a.costs.tripTotal.amountMinor - b.costs.tripTotal.amountMinor ||
        a.transport.doorToDoorMinutes - b.transport.doorToDoorMinutes ||
        a.id.localeCompare(b.id)
    );
}
