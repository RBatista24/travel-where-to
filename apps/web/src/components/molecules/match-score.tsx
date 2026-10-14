import { cn } from '@/lib/utils';

/**
 * The Match Score: a deterministic 0–100 number computed by the ranking engine.
 * Large: display numeral with a marigold rule whose length is the score.
 */
export function MatchScore({ score, size = 'md', className }: { score: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <div className={cn('inline-flex flex-col', className)} aria-label={`${score}% match`}>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-display tabular leading-none font-semibold tracking-tight',
            size === 'lg' && 'text-6xl',
            size === 'md' && 'text-4xl',
            size === 'sm' && 'text-2xl',
          )}
        >
          {score}
        </span>
        <span className={cn('text-muted-foreground font-medium', size === 'sm' ? 'text-xs' : 'text-sm')}>% match</span>
      </div>
      <div className={cn('bg-muted mt-2 h-1.5 overflow-hidden rounded-full', size === 'sm' ? 'w-16' : 'w-full min-w-24')}>
        <div className="bg-marigold h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}
