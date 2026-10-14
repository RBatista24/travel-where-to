import { CheckIcon, MinusIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchReason } from '@/lib/types';

const ICON = { POSITIVE: CheckIcon, NEUTRAL: MinusIcon, WARNING: TriangleAlertIcon } as const;
const TONE = { POSITIVE: 'text-verified', NEUTRAL: 'text-muted-foreground', WARNING: 'text-warning' } as const;

/** Why a result scored what it did. Lines come from the ranking engine, not from an LLM. */
export function ReasonList({ reasons, limit, className }: { reasons: readonly MatchReason[]; limit?: number; className?: string }) {
  const shown = limit ? reasons.slice(0, limit) : reasons;
  return (
    <ul className={cn('grid gap-1.5 text-sm', className)}>
      {shown.map((r) => {
        const Icon = ICON[r.tone];
        return (
          <li key={r.code} className="flex items-start gap-2">
            <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[r.tone])} aria-label={r.tone === 'WARNING' ? 'Warning' : undefined} />
            <span>{r.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A short list for cards: the strongest positives plus up to two warnings, so a short
 * list never hides a problem. Budget lines are skipped because cards show the budget difference.
 */
export function pickReasons(reasons: readonly MatchReason[], n: number): MatchReason[] {
  const useful = reasons.filter((r) => !r.code.startsWith('BUDGET_'));
  const warnings = useful.filter((r) => r.tone === 'WARNING');
  const positives = useful.filter((r) => r.tone === 'POSITIVE');
  const firstWarnings = warnings.slice(0, Math.min(2, warnings.length));
  return [...positives.slice(0, n - firstWarnings.length), ...firstWarnings];
}
