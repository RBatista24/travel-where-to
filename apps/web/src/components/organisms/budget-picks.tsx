'use client';

import { BedDoubleIcon, PiggyBankIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Amount } from '@/components/molecules/amount';
import { TransportLine } from '@/components/molecules/transport-line';
import { formatDateRange, formatMoneyRounded } from '@/lib/format';
import type { ResultView } from '@/lib/result-views';
import type { Money, TripRecommendation } from '@/lib/types';

/**
 * The two budget answers side by side: the cheapest trip, and the best trip that
 * makes the most of the budget. Each opens the trip or its top-5 list.
 */
export function BudgetPicks({
  cheapest,
  fullBudget,
  budget,
  onOpen,
  onShowList,
}: {
  cheapest: TripRecommendation | undefined;
  fullBudget: TripRecommendation | undefined;
  budget: Money;
  onOpen: (id: string) => void;
  onShowList: (view: ResultView) => void;
}) {
  if (!cheapest && !fullBudget) return null;
  return (
    <section aria-label="Budget picks" className="grid gap-3 sm:grid-cols-2">
      {cheapest && (
        <PickTile
          icon={<PiggyBankIcon className="size-4" />}
          title="Lowest price"
          caption="The cheapest trip that fits"
          rec={cheapest}
          budget={budget}
          onOpen={() => onOpen(cheapest.id)}
          onList={() => onShowList('CHEAPEST')}
          listLabel="Top 5 cheapest"
        />
      )}
      {fullBudget && (
        <PickTile
          icon={<SparklesIcon className="size-4" />}
          title={`Best use of ${formatMoneyRounded(budget)}`}
          caption="The best trip that spends most of your budget"
          rec={fullBudget}
          budget={budget}
          onOpen={() => onOpen(fullBudget.id)}
          onList={() => onShowList('FULL_BUDGET')}
          listLabel="Top 5 for your budget"
        />
      )}
    </section>
  );
}

function PickTile({
  icon,
  title,
  caption,
  rec,
  budget,
  onOpen,
  onList,
  listLabel,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  rec: TripRecommendation;
  budget: Money;
  onOpen: () => void;
  onList: () => void;
  listLabel: string;
}) {
  const used = Math.round((rec.costs.tripTotal.amountMinor / budget.amountMinor) * 100);
  const stay = rec.accommodation;
  return (
    <article aria-labelledby={`${rec.id}-pick`} className="bg-card grid gap-3 rounded-xl border p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-primary inline-flex items-center gap-1.5 text-sm font-semibold">
            {icon} {title}
          </p>
          <p className="text-muted-foreground text-xs">{caption}</p>
        </div>
        <div className="text-right">
          <Amount value={rec.costs.tripTotal} rounded className="font-display text-2xl font-semibold" />
          <p className="text-muted-foreground text-xs tabular">{used}% of your budget</p>
        </div>
      </header>
      <div className="grid gap-1">
        <h3 id={`${rec.id}-pick`} className="text-lg leading-tight font-semibold">
          {rec.destination.name} <span className="text-muted-foreground text-sm font-normal">· {rec.destination.country}</span>
        </h3>
        <p className="text-muted-foreground text-sm">
          {formatDateRange(rec.checkIn, rec.checkOut)} · {rec.nights} nights
        </p>
        <TransportLine transport={rec.transport} />
        <span className="inline-flex items-center gap-1.5 text-sm">
          <BedDoubleIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{stay.name}</span>
          {stay.stars !== undefined && <span className="text-muted-foreground shrink-0">· {stay.stars}★</span>}
        </span>
      </div>
      <footer className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onOpen}>
          See this trip
        </Button>
        <Button size="sm" variant="ghost" onClick={onList}>
          {listLabel}
        </Button>
      </footer>
    </article>
  );
}
