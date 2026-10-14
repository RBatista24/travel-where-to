/**
 * Calendar dates without time or timezone, as ISO strings "YYYY-MM-DD".
 * Travel dates are local calendar days, so we avoid Date/timezone ambiguity.
 */
export type LocalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isValidLocalDate(value: string): boolean {
    const m = DATE_RE.exec(value);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.toISOString().slice(0, 10) === value;
}

function toUtcMs(date: LocalDate): number {
    if (!isValidLocalDate(date)) throw new RangeError(`Invalid date: ${date}`);
    return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: LocalDate, days: number): LocalDate {
    return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
    return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 1–12 */
export function monthOf(date: LocalDate): number {
    return Number(date.slice(5, 7));
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: LocalDate): number {
    return new Date(toUtcMs(date)).getUTCDay();
}

export function toLocalDate(instant: Date): LocalDate {
    return instant.toISOString().slice(0, 10);
}

export interface StayDates {
    readonly checkIn: LocalDate;
    readonly checkOut: LocalDate;
}

/** Every stay of exactly `nights` nights that fits entirely inside [windowStart, windowEnd]. */
export function enumerateStays(
    windowStart: LocalDate,
    windowEnd: LocalDate,
    nights: number,
): StayDates[] {
    const stays: StayDates[] = [];
    const lastCheckIn = addDays(windowEnd, -nights);
    for (let d = windowStart; daysBetween(d, lastCheckIn) >= 0; d = addDays(d, 1)) {
        stays.push({ checkIn: d, checkOut: addDays(d, nights) });
    }
    return stays;
}

/**
 * Stays that leave on one of `departOn` weekdays and return on the next `returnOn` weekday
 * (1–7 nights later), entirely inside [windowStart, windowEnd]. Sorted by check-in, then length.
 */
export function enumeratePatternStays(
    windowStart: LocalDate,
    windowEnd: LocalDate,
    departOn: readonly number[],
    returnOn: readonly number[],
): StayDates[] {
    const stays: StayDates[] = [];
    const back = [...new Set(returnOn)];
    for (let d = windowStart; daysBetween(d, windowEnd) > 0; d = addDays(d, 1)) {
        const dow = dayOfWeek(d);
        if (!departOn.includes(dow)) continue;
        const lengths = back.map((r) => (r - dow + 7) % 7 || 7).sort((a, b) => a - b);
        for (const n of lengths) {
            const out = addDays(d, n);
            if (daysBetween(out, windowEnd) >= 0) stays.push({ checkIn: d, checkOut: out });
        }
    }
    return stays;
}
