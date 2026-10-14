import { cn } from '@/lib/utils';
import { formatMoneyRounded } from '@/lib/format';
import type { Money } from '@/lib/types';

/** "€188 under budget" or "⚠ €12 above your budget" (spec §11). */
export function BudgetDelta({ difference, className }: { difference: Money; className?: string }) {
  const over = difference.amountMinor > 0;
  const abs = { ...difference, amountMinor: Math.abs(difference.amountMinor) };
  return (
    <span className={cn('tabular text-sm', over ? 'text-warning font-medium' : 'text-muted-foreground', className)}>
      {over ? `⚠ ${formatMoneyRounded(abs)} above your budget` : `${formatMoneyRounded(abs)} under budget`}
    </span>
  );
}
