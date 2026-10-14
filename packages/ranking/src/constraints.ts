import type {
    AccommodationCriteria,
    AccommodationFacility,
    AccommodationOffer,
    Destination,
    DrivingConstraints,
    FlightLeg,
    FlightOffer,
    FlightPreferences,
    Requirement,
    TimeOfDay,
} from '@travel-where-to/domain';
import { ATTRIBUTE_PRESENT_THRESHOLD, timeOfDayOf } from '@travel-where-to/domain';
import {
    ATTRIBUTE_LABEL,
    FACILITY_LABEL,
    formatDistance,
    formatDuration,
    timesLabel,
} from './labels';

/** Hard constraints. Each returns human-readable failures; empty array = passes. */

export function destinationMustHaveFailures(
    destination: Destination,
    requirements: readonly Requirement[],
): string[] {
    const failures: string[] = [];
    for (const r of requirements) {
        if (r.kind !== 'DESTINATION' || r.priority !== 'MUST_HAVE') continue;
        if (destination.scores[r.attribute] < ATTRIBUTE_PRESENT_THRESHOLD) {
            failures.push(`Not a ${ATTRIBUTE_LABEL[r.attribute]} destination`);
        }
    }
    return failures;
}

export function hasFacility(offer: AccommodationOffer, facility: AccommodationFacility): boolean {
    // A heated pool is also a pool.
    if (facility === 'pool')
        return offer.facilities.includes('pool') || offer.facilities.includes('heatedPool');
    if (facility === 'breakfast')
        return offer.breakfastIncluded || offer.facilities.includes('breakfast');
    return offer.facilities.includes(facility);
}

/**
 * Accommodation filters are hard. Missing provider data never counts as a pass:
 * if the user requires ≥8 rating and the provider has no rating, the offer is excluded.
 */
export function accommodationFailures(
    offer: AccommodationOffer,
    filters: AccommodationCriteria,
    requirements: readonly Requirement[],
): string[] {
    const f: string[] = [];
    if (!filters.types.includes(offer.type)) f.push(`Type ${offer.type} not selected`);
    if (filters.minStars !== undefined && (offer.stars ?? 0) < filters.minStars)
        f.push(`Below ${filters.minStars} stars`);
    if (
        filters.minRating !== undefined &&
        (offer.rating === undefined || offer.rating < filters.minRating)
    )
        f.push(`Rating below ${filters.minRating}`);
    if (
        filters.maxDistanceToCentreM !== undefined &&
        (offer.distanceToCentreM === undefined ||
            offer.distanceToCentreM > filters.maxDistanceToCentreM)
    )
        f.push(`More than ${formatDistance(filters.maxDistanceToCentreM)} from the centre`);
    if (
        filters.maxDistanceToBeachM !== undefined &&
        (offer.distanceToBeachM === undefined ||
            offer.distanceToBeachM > filters.maxDistanceToBeachM)
    )
        f.push(`More than ${formatDistance(filters.maxDistanceToBeachM)} from the beach`);
    for (const r of requirements) {
        if (r.kind !== 'FACILITY') continue;
        if (r.priority === 'MUST_HAVE' && !hasFacility(offer, r.facility))
            f.push(`No ${FACILITY_LABEL[r.facility].toLowerCase()}`);
    }
    return f;
}

export function drivingFailures(
    drivingMinutes: number,
    driving: DrivingConstraints | undefined,
): string[] {
    if (driving?.maxHours === undefined) return [];
    return drivingMinutes > driving.maxHours * 60
        ? [`Drive of ${formatDuration(drivingMinutes)} exceeds the ${driving.maxHours}h limit`]
        : [];
}

/** Hour of a leg's departure, or undefined when the provider gave only the date. */
export function departureHour(leg: FlightLeg | undefined): number | undefined {
    const m = leg ? /T(\d{2}):\d{2}/.exec(leg.departure) : null;
    return m ? Number(m[1]) : undefined;
}

export interface FlightPreferenceCheck {
    /** Known mismatches: the offer must be dropped. */
    readonly failures: string[];
    /** Things the provider didn't tell us: the trip stays, with a warning. */
    readonly unconfirmed: string[];
}

/**
 * Hard flight filters (direct only, departure time of day). Known details are checked;
 * details the provider filtered in its own search count as met; anything else is "unconfirmed".
 */
export function flightPreferenceCheck(
    offer: FlightOffer,
    prefs: FlightPreferences | undefined,
): FlightPreferenceCheck {
    const failures: string[] = [];
    const unconfirmed: string[] = [];
    if (!prefs) return { failures, unconfirmed };
    const by = offer.filteredBy ?? {};
    if (prefs.directOnly) {
        if (offer.outbound.stops > 0 || (offer.inbound?.stops ?? 0) > 0)
            failures.push('Not a direct flight');
        else if (!offer.inbound && !by.directOnly) unconfirmed.push('return flight is direct');
    }
    const leg = (
        times: readonly TimeOfDay[] | undefined,
        l: FlightLeg | undefined,
        filtered: boolean | undefined,
        name: 'Outbound' | 'Return',
    ) => {
        if (!times || times.length === 0) return;
        const hour = departureHour(l);
        if (hour !== undefined) {
            if (!times.includes(timeOfDayOf(hour)))
                failures.push(`${name} flight leaves outside the ${timesLabel(times)}`);
        } else if (!filtered)
            unconfirmed.push(`${name.toLowerCase()} flight leaves in the ${timesLabel(times)}`);
    };
    leg(prefs.outboundTimes, offer.outbound, by.outboundTimes, 'Outbound');
    leg(prefs.returnTimes, offer.inbound, by.returnTimes, 'Return');
    return { failures, unconfirmed };
}
