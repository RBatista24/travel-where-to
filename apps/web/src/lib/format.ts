import { formatMoney as formatMoneyShared, type Money } from '@travel-where-to/shared';
import { formatDistance, formatDuration } from '@travel-where-to/ranking';

export { formatDistance, formatDuration };

export const formatMoney = (m: Money): string => formatMoneyShared(m, 'en-IE');

/** Whole currency units, for headline totals ("€812"). */
export function formatMoneyRounded(m: Money): string {
    return new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: m.currency,
        maximumFractionDigits: 0,
    }).format(Math.round(m.amountMinor / 100));
}

const dayMonth = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
});
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** "Thu 14 – Sun 17 Nov 2026" (weekdays help with weekend trips) */
export function formatDateRange(checkIn: string, checkOut: string): string {
    return `${weekday.format(asDate(checkIn))} ${dayMonth.format(asDate(checkIn))} – ${weekday.format(asDate(checkOut))} ${dayMonthYear.format(asDate(checkOut))}`;
}

/** "Sat 14 Nov" */
export function formatDayShort(date: string): string {
    return `${weekday.format(asDate(date))} ${dayMonth.format(asDate(date))}`;
}

export function formatDate(date: string): string {
    return dayMonthYear.format(asDate(date));
}

export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** "4 minutes ago", "just now", "2 hours ago". */
export function formatAgo(iso: string, now: Date = new Date()): string {
    const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${plural(hours, 'hour')} ago`;
    return `${plural(Math.round(hours / 24), 'day')} ago`;
}

export function isPast(iso: string | undefined, now: Date = new Date()): boolean {
    return iso !== undefined && new Date(iso).getTime() <= now.getTime();
}
