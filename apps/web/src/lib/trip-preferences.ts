import type { SearchCriteria } from './types';

/** Days of the week and flight times for the form and the search summary. 0 = Sunday. */

export type TimeOfDay = 'NIGHT' | 'MORNING' | 'AFTERNOON' | 'EVENING';
export const TIMES_OF_DAY: readonly { value: TimeOfDay; label: string; hours: string }[] = [
    { value: 'MORNING', label: 'Morning', hours: '05–12h' },
    { value: 'AFTERNOON', label: 'Afternoon', hours: '12–18h' },
    { value: 'EVENING', label: 'Evening', hours: '18–24h' },
    { value: 'NIGHT', label: 'Night', hours: '00–05h' },
];

export const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const;
/** Monday-first order for pickers. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type WeekdayPreset = 'ANY' | 'WEEKEND' | 'THU_SUN' | 'FRI_MON' | 'CUSTOM';
export const WEEKDAY_PRESETS: readonly {
    value: WeekdayPreset;
    label: string;
    departOn?: number;
    returnOn?: number;
}[] = [
    { value: 'ANY', label: 'Any days' },
    { value: 'WEEKEND', label: 'Weekend · Fri → Sun', departOn: 5, returnOn: 0 },
    { value: 'THU_SUN', label: 'Long weekend · Thu → Sun', departOn: 4, returnOn: 0 },
    { value: 'FRI_MON', label: 'Long weekend · Fri → Mon', departOn: 5, returnOn: 1 },
    { value: 'CUSTOM', label: 'Choose the days…' },
];

/** Nights from leaving on `depart` to coming back on the next `ret` (1–7). */
export function patternNights(depart: number, ret: number): number {
    return (ret - depart + 7) % 7 || 7;
}

export function presetFor(depart: number, ret: number): WeekdayPreset {
    return (
        WEEKDAY_PRESETS.find((p) => p.departOn === depart && p.returnOn === ret)?.value ?? 'CUSTOM'
    );
}

/** How many trips with this pattern fit inside the window. */
export function countPatternTrips(
    windowStart: string,
    windowEnd: string,
    depart: number,
    ret: number,
): number {
    const start = Date.parse(`${windowStart}T00:00:00Z`);
    const end = Date.parse(`${windowEnd}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    const n = patternNights(depart, ret);
    let count = 0;
    for (let t = start; t + n * 86_400_000 <= end; t += 86_400_000)
        if (new Date(t).getUTCDay() === depart) count++;
    return count;
}

const short = (d: number) => (WEEKDAY_NAMES[d] ?? '').slice(0, 3);

export function describeWeekdays(w: {
    departOn: readonly number[];
    returnOn: readonly number[];
}): string {
    return `${w.departOn.map(short).join('/')} → ${w.returnOn.map(short).join('/')}`;
}

export function timesText(times: readonly string[] | undefined): string {
    return TIMES_OF_DAY.filter((t) => times?.includes(t.value))
        .map((t) => t.label.toLowerCase())
        .join(' or ');
}

/** "Direct only · out morning · back evening" - empty when no flight preferences. */
export function describeFlightPreferences(f: SearchCriteria['transport']['flights']): string {
    if (!f) return '';
    const parts: string[] = [];
    if (f.directOnly) parts.push('Direct flights only');
    if (f.outboundTimes?.length) parts.push(`out in the ${timesText(f.outboundTimes)}`);
    if (f.returnTimes?.length) parts.push(`back in the ${timesText(f.returnTimes)}`);
    return parts.join(', ');
}
