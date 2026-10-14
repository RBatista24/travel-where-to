import { cn } from '@/lib/utils';
import { formatMoney, formatMoneyRounded } from '@/lib/format';
import type { Money } from '@/lib/types';

/** A money value in tabular figures. `rounded` drops cents for headline totals. */
export function Amount({ value, rounded = false, className }: { value: Money; rounded?: boolean; className?: string }) {
  return <span className={cn('tabular', className)}>{rounded ? formatMoneyRounded(value) : formatMoney(value)}</span>;
}
