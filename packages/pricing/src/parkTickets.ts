import { fromMajor } from '@travel-where-to/shared';
import type { CostItem, ThemePark, Traveller } from '@travel-where-to/domain';
import { countTravellers } from '@travel-where-to/domain';

export interface ParkTicketPlan {
    /** Days the user asked for. */
    readonly requestedDays: number;
    /** Ticket length actually priced (capped at the longest ticket sold). */
    readonly days: number;
    readonly payers: number;
    readonly free: number;
    readonly item: CostItem;
}

/**
 * Entrance tickets for a theme park, as an ESTIMATE: the middle of the published price
 * range for that ticket length (prices change by date), × everyone old enough to pay.
 * Children are priced like adults because child prices aren't published (usually a bit less).
 */
export function estimateParkTickets(
    park: ThemePark,
    travellers: readonly Traveller[],
    requestedDays: number,
    currency: string,
): ParkTicketPlan | null {
    const t = park.tickets;
    if (t.currency !== currency) return null; // no conversion in V1
    const lengths = Object.keys(t.adultRangeByDays)
        .map(Number)
        .sort((a, b) => a - b);
    const longest = lengths[lengths.length - 1];
    if (!longest) return null;
    const days = Math.max(1, Math.min(requestedDays, longest));
    const range = t.adultRangeByDays[days];
    if (!range) return null;
    const [min, max] = range;
    const c = countTravellers(travellers);
    const kidAges = [...c.childAges, ...c.infantAges];
    const free = kidAges.filter((a) => a < t.freeUnderAge).length;
    const payers = c.adults + kidAges.length - free;
    const mid = Math.round((min + max) / 2);
    const capped = requestedDays > days ? ` Longest ticket sold is ${days} days.` : '';
    const freeNote = free ? `; ${free} under ${t.freeUnderAge} free` : '';
    return {
        requestedDays,
        days,
        payers,
        free,
        item: {
            kind: 'PARK_TICKETS',
            label: `${park.name} tickets · ${days} day${days === 1 ? '' : 's'}, ${t.accessByDays[days] ?? ''}`.trim(),
            amount: fromMajor(mid * payers, currency),
            confidence: 'ESTIMATED',
            countsTowardsBudget: true,
            basis:
                `~€${mid} per person, middle of the published €${min}–€${max} range (price depends on the date) × ${payers} ${payers === 1 ? 'person' : 'people'}` +
                `${freeNote}; child tickets priced as adult (usually a little cheaper).${capped} Check the exact price on the official site.`,
            link: t.officialUrl,
        },
    };
}
