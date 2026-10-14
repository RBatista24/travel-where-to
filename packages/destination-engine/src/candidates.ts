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

export function generateCandidates(criteria: SearchCriteria, all: readonly Destination[]): CandidateSelection {
  const excluded: ExcludedDestination[] = [];
  let pool: readonly Destination[] = all;

  if (criteria.destination.kind === 'KNOWN') {
    const ids = new Set(criteria.destination.destinationIds);
    pool = all.filter((d) => ids.has(d.id));
    for (const id of ids) {
      if (!all.some((d) => d.id === id)) excluded.push({ destinationId: id, reason: 'Unknown destination' });
    }
  }

  // Region filter: places elsewhere are simply not considered (not listed as left out).
  const regions = criteria.destination.kind === 'DISCOVER' ? criteria.destination.regions : undefined;
  if (regions && regions.length > 0) pool = pool.filter((d) => regions.includes(d.region));

  const modes = new Set(criteria.transport.modes);
  const maxHours = criteria.transport.driving?.maxHours;
  const candidates: Destination[] = [];

  for (const d of pool) {
    const straightKm = haversineKm(criteria.origin.coordinates, d.coordinates);
    if (straightKm < MIN_TRIP_DISTANCE_KM) {
      excluded.push({ destinationId: d.id, reason: 'Too close to your origin' });
      continue;
    }
    const mustHave = destinationMustHaveFailures(d, criteria.requirements);
    if (mustHave.length > 0) {
      excluded.push({ destinationId: d.id, reason: mustHave.join('; ') });
      continue;
    }
    const carPossible =
      modes.has('CAR') && d.reachableByCar && (maxHours === undefined || straightKm / OPTIMISTIC_ROAD_SPEED_KMH <= maxHours);
    const flightPossible = modes.has('FLIGHT') && d.airports.length > 0;
    if (!carPossible && !flightPossible) {
      excluded.push({
        destinationId: d.id,
        reason: modes.has('CAR') && !modes.has('FLIGHT') ? (d.reachableByCar ? 'Beyond your driving limit' : 'Not reachable by car') : 'No transport option',
      });
      continue;
    }
    candidates.push(d);
  }
  return { candidates, excluded };
}
