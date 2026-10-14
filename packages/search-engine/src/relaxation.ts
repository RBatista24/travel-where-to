import { addDays, fromMajor, multiplyMoney, toMajor } from '@travel-where-to/shared';
import type { RelaxationSuggestion, Requirement, SearchCriteria } from '@travel-where-to/domain';
import { ATTRIBUTE_LABEL, FACILITY_LABEL } from '@travel-where-to/ranking';
import { formatMoney } from '@travel-where-to/shared';

interface Candidate {
    readonly code: string;
    readonly description: string;
    readonly criteria: SearchCriteria;
}

/** Ways to loosen a search that returned nothing (spec §37). Each is applied on its own. */
export function relaxationCandidates(c: SearchCriteria): Candidate[] {
    const out: Candidate[] = [];

    const newBudget = fromMajor(
        Math.ceil(toMajor(multiplyMoney(c.budget, 1.25)) / 50) * 50,
        c.budget.currency,
    );
    out.push({
        code: 'BUDGET',
        description: `${formatMoney(newBudget)} budget`,
        criteria: { ...c, budget: newBudget },
    });

    if (!c.transport.modes.includes('CAR'))
        out.push({
            code: 'ALLOW_CAR',
            description: 'Allow car',
            criteria: { ...c, transport: { ...c.transport, modes: [...c.transport.modes, 'CAR'] } },
        });
    if (!c.transport.modes.includes('FLIGHT'))
        out.push({
            code: 'ALLOW_FLIGHT',
            description: 'Allow flights',
            criteria: {
                ...c,
                transport: { ...c.transport, modes: [...c.transport.modes, 'FLIGHT'] },
            },
        });

    const fp = c.transport.flights;
    if (fp?.directOnly && c.transport.modes.includes('FLIGHT'))
        out.push({
            code: 'ALLOW_STOPS',
            description: 'Allow flights with stops',
            criteria: {
                ...c,
                transport: { ...c.transport, flights: { ...fp, directOnly: false } },
            },
        });
    if (
        ((fp?.outboundTimes?.length ?? 0) > 0 || (fp?.returnTimes?.length ?? 0) > 0) &&
        c.transport.modes.includes('FLIGHT')
    )
        out.push({
            code: 'ANY_FLIGHT_TIME',
            description: 'Any flight departure time',
            criteria: {
                ...c,
                transport: {
                    ...c.transport,
                    flights: { ...fp, outboundTimes: [], returnTimes: [] },
                },
            },
        });

    const maxHours = c.transport.driving?.maxHours;
    if (maxHours !== undefined && c.transport.modes.includes('CAR'))
        out.push({
            code: 'DRIVING_LIMIT',
            description: `Drive up to ${maxHours + 2}h`,
            criteria: {
                ...c,
                transport: {
                    ...c.transport,
                    driving: { ...c.transport.driving, maxHours: maxHours + 2 },
                },
            },
        });

    if (c.dates.kind === 'EXACT') {
        const nights = Math.round(
            (Date.parse(c.dates.checkOut) - Date.parse(c.dates.checkIn)) / 86_400_000,
        );
        out.push({
            code: 'DATES_FLEXIBLE',
            description: '±2 days flexibility',
            criteria: {
                ...c,
                dates: {
                    kind: 'FLEXIBLE',
                    windowStart: addDays(c.dates.checkIn, -2),
                    windowEnd: addDays(c.dates.checkOut, 2),
                    nights,
                },
            },
        });
    } else {
        if (c.dates.weekdays) {
            const { weekdays: _w, ...rest } = c.dates;
            out.push({
                code: 'ANY_WEEKDAYS',
                description: `Any days of the week (${rest.nights} nights)`,
                criteria: { ...c, dates: rest },
            });
        }
        out.push({
            code: 'DATES_WIDER',
            description: 'Widen the date window by a week',
            criteria: {
                ...c,
                dates: {
                    ...c.dates,
                    windowStart: addDays(c.dates.windowStart, -7),
                    windowEnd: addDays(c.dates.windowEnd, 7),
                },
            },
        });
    }

    const acc = c.accommodation;
    if (acc.minRating !== undefined)
        out.push({
            code: 'MIN_RATING',
            description: `Rating ≥ ${acc.minRating - 1}`,
            criteria: { ...c, accommodation: { ...acc, minRating: acc.minRating - 1 } },
        });
    if (acc.minStars !== undefined && acc.minStars > 1)
        out.push({
            code: 'MIN_STARS',
            description: `${acc.minStars - 1}+ stars`,
            criteria: { ...c, accommodation: { ...acc, minStars: acc.minStars - 1 } },
        });
    if (acc.maxDistanceToCentreM !== undefined)
        out.push({
            code: 'CENTRE_DISTANCE',
            description: `Up to ${(acc.maxDistanceToCentreM * 2) / 1000} km from the centre`,
            criteria: {
                ...c,
                accommodation: { ...acc, maxDistanceToCentreM: acc.maxDistanceToCentreM * 2 },
            },
        });
    if (acc.maxDistanceToBeachM !== undefined)
        out.push({
            code: 'BEACH_DISTANCE',
            description: `Up to ${(acc.maxDistanceToBeachM * 2) / 1000} km from the beach`,
            criteria: {
                ...c,
                accommodation: { ...acc, maxDistanceToBeachM: acc.maxDistanceToBeachM * 2 },
            },
        });
    if (!acc.types.includes('APARTMENT'))
        out.push({
            code: 'ALLOW_APARTMENTS',
            description: 'Include apartments',
            criteria: { ...c, accommodation: { ...acc, types: [...acc.types, 'APARTMENT'] } },
        });

    c.requirements.forEach((r, i) => {
        if (r.priority !== 'MUST_HAVE') return;
        const softened: Requirement = { ...r, priority: 'IMPORTANT' };
        const label =
            r.kind === 'DESTINATION'
                ? ATTRIBUTE_LABEL[r.attribute]
                : FACILITY_LABEL[r.facility].toLowerCase();
        out.push({
            code: `SOFTEN_${r.kind === 'DESTINATION' ? r.attribute : r.facility}`,
            description: `Make "${label}" important instead of required`,
            criteria: {
                ...c,
                requirements: c.requirements.map((x, j) => (j === i ? softened : x)),
            },
        });
    });
    return out;
}

export async function buildRelaxations(
    criteria: SearchCriteria,
    countResults: (c: SearchCriteria) => Promise<number>,
): Promise<RelaxationSuggestion[]> {
    const candidates = relaxationCandidates(criteria);
    const counts = await Promise.all(candidates.map((c) => countResults(c.criteria)));
    return candidates
        .map((c, i) => ({
            code: c.code,
            description: c.description,
            criteria: c.criteria,
            resultCount: counts[i] ?? 0,
        }))
        .filter((s) => s.resultCount > 0)
        .sort((a, b) => b.resultCount - a.resultCount || a.code.localeCompare(b.code));
}
