'use client';

import { Button } from '@/components/atoms/button';
import { Checkbox } from '@/components/atoms/checkbox';
import { Amount } from '@/components/molecules/amount';
import { BudgetDelta } from '@/components/molecules/budget-delta';
import { MatchScore } from '@/components/molecules/match-score';
import { TransportLine } from '@/components/molecules/transport-line';
import { cn } from '@/lib/utils';
import { formatDateRange } from '@/lib/format';
import type { TripRecommendation } from '@/lib/types';
import type { ResultActions } from './result-card';

/** Results 4–10: the same facts, one line each. */
export function ResultRow({ rec, rank, selected, canSelect, onToggleCompare, onOpen }: { rec: TripRecommendation; rank: number } & ResultActions) {
  return (
    <li className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1.2fr)_auto_auto]', selected && 'bg-accent/40 -mx-3 rounded-lg px-3')}>
      <Checkbox checked={selected} disabled={!selected && !canSelect} onCheckedChange={onToggleCompare} aria-label={`Compare ${rec.destination.name}`} />
      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <span className="font-display block truncate text-lg font-semibold hover:underline">
          <span className="text-muted-foreground tabular mr-2 text-sm font-normal">#{rank}</span>
          {rec.destination.name}
        </span>
        <span className="text-muted-foreground block text-sm">
          {formatDateRange(rec.checkIn, rec.checkOut)}
          <span className="sm:hidden"> · {rec.score.total}% match</span>
        </span>
      </button>
      <TransportLine transport={rec.transport} className="text-muted-foreground col-span-3 col-start-2 sm:col-span-1 sm:col-start-auto" />
      <div className="col-start-3 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
        <Amount value={rec.costs.tripTotal} rounded className="font-semibold" />
        <BudgetDelta difference={rec.costs.budgetDifference} className="block text-xs" />
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <MatchScore score={rec.score.total} size="sm" />
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Details
        </Button>
      </div>
    </li>
  );
}
