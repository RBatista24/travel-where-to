import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Amount } from '@/components/molecules/amount';
import { BudgetDelta } from '@/components/molecules/budget-delta';
import { Freshness } from '@/components/molecules/freshness';
import { INFO_RULE, InfoTag } from '@/components/molecules/info-tag';
import type { CostBreakdown, CostItem } from '@/lib/types';

/**
 * The trip's costs as a ledger. Each line's left rule says what kind of number it is
 * (solid = provider price, dashed = our estimate), next to who provided it and when.
 */
export function CostLedger({ costs, className }: { costs: CostBreakdown; className?: string }) {
  const inBudget = costs.items.filter((i) => i.countsTowardsBudget);
  const extras = costs.items.filter((i) => !i.countsTowardsBudget);
  return (
    <div className={cn('grid gap-4', className)}>
      <ul className="grid gap-2">
        {inBudget.map((item) => (
          <LedgerLine key={`${item.kind}-${item.label}`} item={item} />
        ))}
      </ul>
      <dl className="grid gap-1 border-t pt-3 text-sm">
        <Row label="Trip total" value={<Amount value={costs.tripTotal} className="text-base font-semibold" />} strong />
        <Row label="Bookable with providers" value={<Amount value={costs.bookableTotal} />} />
        <Row label="Our estimates included" value={<Amount value={costs.estimatedInBudget} />} />
        <div className="pt-1 text-right">
          <BudgetDelta difference={costs.budgetDifference} />
        </div>
      </dl>
      {extras.length > 0 && (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs">Not in your budget</p>
          <ul className="grid gap-2">
            {extras.map((item) => (
              <LedgerLine key={`${item.kind}-${item.label}`} item={item} />
            ))}
          </ul>
          <dl className="grid gap-1 border-t pt-3 text-sm">
            <Row label="Likely overall spend" value={<Amount value={costs.estimatedOverall} className="font-medium" />} />
          </dl>
        </div>
      )}
    </div>
  );
}

function LedgerLine({ item }: { item: CostItem }) {
  return (
    <li className={cn('grid gap-1 border-l-[3px] py-0.5 pl-3', INFO_RULE[item.confidence])}>
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0">{item.label}</span>
        <Amount value={item.amount} className="font-medium" />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <InfoTag kind={item.confidence} />
        {item.basis && <span className="text-muted-foreground text-xs">{item.basis}</span>}
        <Freshness attribution={item.attribution} confidence={item.confidence} />
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-azulejo text-xs underline-offset-2 hover:underline">
            Check the price on the official site
          </a>
        )}
      </div>
    </li>
  );
}

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
