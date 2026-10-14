import type * as React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { Amount } from '@/components/molecules/amount';
import { BudgetDelta } from '@/components/molecules/budget-delta';
import { MatchScore } from '@/components/molecules/match-score';
import { formatDateRange, formatDistance, formatDuration } from '@/lib/format';
import type { TripRecommendation } from '@/lib/types';

/** 0–100 catalogue score → 1–5 stars for the comparison (spec §36). */
const stars = (score: number) => {
  const n = Math.max(1, Math.round(score / 20));
  return <span aria-label={`${n} out of 5`}>{'★'.repeat(n)}<span className="text-muted-foreground/40">{'★'.repeat(5 - n)}</span></span>;
};

type Row = { label: string; cell: (r: TripRecommendation) => React.ReactNode };

const ROWS: Row[] = [
  { label: 'Match', cell: (r) => <MatchScore score={r.score.total} size="sm" /> },
  { label: 'Trip total', cell: (r) => <Amount value={r.costs.tripTotal} rounded className="font-semibold" /> },
  { label: 'Against budget', cell: (r) => <BudgetDelta difference={r.costs.budgetDifference} className="text-xs" /> },
  { label: 'Food (estimate)', cell: (r) => <Amount value={r.costs.estimatedExtras} rounded /> },
  { label: 'Dates', cell: (r) => formatDateRange(r.checkIn, r.checkOut) },
  { label: 'Transport', cell: (r) => (r.transport.mode === 'FLIGHT' ? `Flight from ${r.transport.offer.originAirport}` : 'Car') },
  { label: 'Door to door', cell: (r) => formatDuration(r.transport.doorToDoorMinutes) },
  { label: 'Stay', cell: (r) => r.accommodation.name },
  { label: 'Guest rating', cell: (r) => r.accommodation.rating?.toFixed(1) ?? '—' },
  { label: 'To the centre', cell: (r) => (r.accommodation.distanceToCentreM !== undefined ? formatDistance(r.accommodation.distanceToCentreM) : '—') },
  { label: 'To the beach', cell: (r) => (r.accommodation.distanceToBeachM !== undefined ? formatDistance(r.accommodation.distanceToBeachM) : '—') },
  { label: 'Beach', cell: (r) => stars(r.destination.scores.beach) },
  { label: 'Family', cell: (r) => stars(r.destination.scores.family) },
  { label: 'Culture', cell: (r) => stars(r.destination.scores.culture) },
  { label: 'Weather', cell: (r) => (r.weather ? `${Math.round(r.weather.avgHighC)}°C highs` : '—') },
];

export function CompareTable({ recs }: { recs: readonly TripRecommendation[] }) {
  return (
    <Table className="min-w-[36rem]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40" />
          {recs.map((r) => (
            <TableHead key={r.id} className="font-display text-foreground h-auto py-3 text-lg font-semibold whitespace-normal">
              {r.destination.name}
              <span className="text-muted-foreground block font-sans text-xs font-normal">{r.destination.country}</span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="text-muted-foreground">{row.label}</TableCell>
            {recs.map((r) => (
              <TableCell key={r.id} className="tabular whitespace-normal">
                {row.cell(r)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
