import { cn } from '@/lib/utils';
import type { ScoreBreakdown as Breakdown } from '@/lib/types';

/** Spec §33 weights, in display order. Kept in sync with packages/ranking DEFAULT_WEIGHTS. */
const PARTS: {
    key: Exclude<keyof Breakdown, 'total' | 'withoutPrice'>;
    label: string;
    weight: number;
}[] = [
    { key: 'budget', label: 'Budget', weight: 27 },
    { key: 'preferences', label: 'Your preferences', weight: 25 },
    { key: 'transport', label: 'Getting there', weight: 15 },
    { key: 'accommodation', label: 'Accommodation', weight: 15 },
    { key: 'weather', label: 'Weather', weight: 10 },
    { key: 'location', label: 'Location', weight: 8 },
];

export function ScoreBreakdown({ score, className }: { score: Breakdown; className?: string }) {
    return (
        <dl className={cn('grid gap-2.5', className)}>
            {PARTS.map((p) => {
                const value = score[p.key];
                return (
                    <div
                        key={p.key}
                        className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm"
                    >
                        <dt>
                            {p.label}{' '}
                            <span className="text-muted-foreground text-xs">· {p.weight}%</span>
                        </dt>
                        <dd className="tabular text-right font-medium">{value}</dd>
                        <div
                            className="bg-muted col-span-2 h-1 overflow-hidden rounded-full"
                            aria-hidden
                        >
                            <div
                                className={cn(
                                    'h-full rounded-full',
                                    value >= 70
                                        ? 'bg-primary'
                                        : value >= 40
                                          ? 'bg-primary/60'
                                          : 'bg-warning',
                                )}
                                style={{ width: `${value}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </dl>
    );
}
