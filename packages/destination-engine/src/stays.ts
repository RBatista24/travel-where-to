import type { StayDates } from '@travel-where-to/shared';
import { enumeratePatternStays, enumerateStays } from '@travel-where-to/shared';
import type { DateSelection } from '@travel-where-to/domain';

/**
 * All stay date combinations to evaluate. For long flexible windows the list is
 * sampled evenly (always keeping the first and last) to bound provider calls.
 * Assumption: default cap of 16 combinations per destination (configurable).
 */
export function buildStayOptions(dates: DateSelection, maxOptions = 16): StayDates[] {
    if (dates.kind === 'EXACT') return [{ checkIn: dates.checkIn, checkOut: dates.checkOut }];
    const all = dates.weekdays
        ? enumeratePatternStays(
              dates.windowStart,
              dates.windowEnd,
              dates.weekdays.departOn,
              dates.weekdays.returnOn,
          )
        : enumerateStays(dates.windowStart, dates.windowEnd, dates.nights);
    if (all.length <= maxOptions) return all;
    if (maxOptions <= 1) return all.slice(0, 1);
    const picked: StayDates[] = [];
    const step = (all.length - 1) / (maxOptions - 1);
    for (let i = 0; i < maxOptions; i++) {
        const s = all[Math.round(i * step)];
        if (s && picked[picked.length - 1] !== s) picked.push(s);
    }
    return picked;
}
