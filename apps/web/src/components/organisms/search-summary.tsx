import Link from 'next/link';
import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { formatDate, formatMoneyRounded, plural } from '@/lib/format';
import type { SearchCriteria } from '@/lib/types';
import { describeFlightPreferences, describeWeekdays } from '@/lib/trip-preferences';
import { describeRegions } from '@/lib/regions';

export function describeDates(d: SearchCriteria['dates']): string {
  if (d.kind === 'EXACT') return `${formatDate(d.checkIn)} → ${formatDate(d.checkOut)}`;
  if (d.weekdays) return `${describeWeekdays(d.weekdays)} between ${formatDate(d.windowStart)} and ${formatDate(d.windowEnd)}`;
  return `${plural(d.nights, 'night')} between ${formatDate(d.windowStart)} and ${formatDate(d.windowEnd)}`;
}

export function describeTravellers(t: SearchCriteria['travellers']): string {
  const adults = t.filter((x) => x.type === 'ADULT').length;
  const children = t.filter((x) => x.type === 'CHILD').length;
  const infants = t.filter((x) => x.type === 'INFANT').length;
  return [plural(adults, 'adult'), children ? plural(children, 'child', 'children') : '', infants ? plural(infants, 'baby', 'babies') : ''].filter(Boolean).join(', ');
}

/** The search in one line, with a way back to change it. */
export function SearchSummary({ searchId, criteria }: { searchId: string; criteria: SearchCriteria }) {
  const parts = [
    `From ${criteria.origin.label}`,
    criteria.destination.kind === 'DISCOVER' ? describeRegions(criteria.destination.regions) : '',
    describeDates(criteria.dates),
    describeTravellers(criteria.travellers),
    `${formatMoneyRounded(criteria.budget)} budget`,
    criteria.transport.modes.length === 2 ? 'Fly or drive' : criteria.transport.modes[0] === 'FLIGHT' ? 'Fly' : 'Drive',
    describeFlightPreferences(criteria.transport.flights),
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">{parts.join(' · ')}</p>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={`/?from=${encodeURIComponent(searchId)}`}>
          <PencilIcon /> Change search
        </Link>
      </Button>
    </div>
  );
}
