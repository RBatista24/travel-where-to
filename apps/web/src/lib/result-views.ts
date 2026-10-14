import type { SearchResult, TripRecommendation } from './types';

/** The three ways to look at one search's results. */
export type ResultView = 'MATCH' | 'CHEAPEST' | 'FULL_BUDGET';

export function viewList(result: SearchResult, view: ResultView): readonly TripRecommendation[] {
    if (view === 'CHEAPEST') return result.picks?.cheapest ?? [];
    if (view === 'FULL_BUDGET') return result.picks?.fullBudget ?? [];
    return result.recommendations;
}

/** Every trip shown anywhere on the results page, once each. */
export function allTrips(result: SearchResult): TripRecommendation[] {
    const seen = new Map<string, TripRecommendation>();
    for (const r of [
        ...result.recommendations,
        ...(result.picks?.cheapest ?? []),
        ...(result.picks?.fullBudget ?? []),
    ])
        if (!seen.has(r.id)) seen.set(r.id, r);
    return [...seen.values()];
}

/** Short key for a trip inside its search (used in the compare URL). Plain destination ids still work. */
export function tripKey(searchId: string, rec: TripRecommendation): string {
    return rec.id.startsWith(`${searchId}:`)
        ? rec.id.slice(searchId.length + 1)
        : rec.destination.id;
}

export function findTrip(result: SearchResult, key: string): TripRecommendation | undefined {
    return (
        allTrips(result).find((r) => r.id === `${result.searchId}:${key}`) ??
        result.recommendations.find((r) => r.destination.id === key)
    );
}
