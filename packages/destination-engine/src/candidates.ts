import { haversineKm } from '@travel-where-to/shared';
import type { Destination, ExcludedDestination, SearchCriteria } from '@travel-where-to/domain';
import { destinationMustHaveFailures } from '@travel-where-to/ranking';

/** Destinations closer than this to the origin are not trips. Assumption, configurable. */
export const MIN_TRIP_DISTANCE_KM = 60;

/**
 * Upper bound on average road speed used ONLY to discard destinations that cannot
 * possibly satisfy a hard driving limit. Real road distance ≥ straight line and
 * average speed < 110 km/h, so this never wrongly excludes a destination.
 */
const OPTIMISTIC_ROAD_SPEED_KMH = 110;

export interface CandidateSelection {
    readonly candidates: Destination[];
    readonly excluded: ExcludedDestination[];
}

type Mode = SearchCriteria['transport']['modes'][number];

function carPossible(
    d: Destination,
    straightKm: number,
    modes: ReadonlySet<Mode>,
    maxHours: number | undefined,
): boolean {
    return (
        modes.has('CAR') &&
        d.reachableByCar &&
        (maxHours === undefined || straightKm / OPTIMISTIC_ROAD_SPEED_KMH <= maxHours)
    );
}

/** Why a destination with no usable transport is left out, given the modes the user chose. */
function noTransportReason(d: Destination, modes: ReadonlySet<Mode>): string {
    if (!modes.has('CAR') || modes.has('FLIGHT')) return 'No transport option';
    if (!d.reachableByCar) return 'Not reachable by car';
    return 'Beyond your driving limit';
}

/** The reason a destination is left out, or undefined when it stays a candidate. */
function exclusionReason(
    d: Destination,
    criteria: SearchCriteria,
    straightKm: number,
    modes: ReadonlySet<Mode>,
): string | undefined {
    if (straightKm < MIN_TRIP_DISTANCE_KM) return 'Too close to your origin';
    const mustHave = destinationMustHaveFailures(d, criteria.requirements);
    if (mustHave.length > 0) return mustHave.join('; ');
    const maxHours = criteria.transport.driving?.maxHours;
    const flightPossible = modes.has('FLIGHT') && d.airports.length > 0;
    if (carPossible(d, straightKm, modes, maxHours) || flightPossible) return undefined;
    return noTransportReason(d, modes);
}

export function generateCandidates(
    criteria: SearchCriteria,
    all: readonly Destination[],
): CandidateSelection {
    const excluded: ExcludedDestination[] = [];
    let pool: readonly Destination[] = all;

    if (criteria.destination.kind === 'KNOWN') {
        const ids = new Set(criteria.destination.destinationIds);
        pool = all.filter((d) => ids.has(d.id));
        for (const id of ids) {
            if (!all.some((d) => d.id === id))
                excluded.push({ destinationId: id, reason: 'Unknown destination' });
        }
    }

    // Region filter: places elsewhere are simply not considered (not listed as left out).
    const regions =
        criteria.destination.kind === 'DISCOVER' ? criteria.destination.regions : undefined;
    if (regions && regions.length > 0) pool = pool.filter((d) => regions.includes(d.region));

    const modes = new Set(criteria.transport.modes);
    const candidates: Destination[] = [];

    for (const d of pool) {
        const straightKm = haversineKm(criteria.origin.coordinates, d.coordinates);
        const reason = exclusionReason(d, criteria, straightKm, modes);
        if (reason === undefined) candidates.push(d);
        else excluded.push({ destinationId: d.id, reason });
    }
    return { candidates, excluded };
}
