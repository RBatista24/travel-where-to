'use client';

import { BedDoubleIcon, StarIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Checkbox } from '@/components/atoms/checkbox';
import { Label } from '@/components/atoms/label';
import { Amount } from '@/components/molecules/amount';
import { BudgetDelta } from '@/components/molecules/budget-delta';
import { MatchScore } from '@/components/molecules/match-score';
import { ReasonList, pickReasons } from '@/components/molecules/reason-list';
import { TransportLine } from '@/components/molecules/transport-line';
import { cn } from '@/lib/utils';
import { formatDateRange } from '@/lib/format';
import type { TripRecommendation } from '@/lib/types';

export interface ResultActions {
    readonly selected: boolean;
    readonly canSelect: boolean;
    readonly onToggleCompare: () => void;
    readonly onOpen: () => void;
}

/** A top-3 result: big score, the trip in three lines, the total, and why. */
export function ResultCard({
    rec,
    rank,
    selected,
    canSelect,
    onToggleCompare,
    onOpen,
}: { rec: TripRecommendation; rank: number } & ResultActions) {
    const stay = rec.accommodation;
    return (
        <article
            aria-labelledby={`${rec.id}-name`}
            className={cn(
                'bg-card flex flex-col rounded-xl border p-5 transition-shadow',
                selected && 'ring-primary ring-2',
                rank === 1 && 'lg:shadow-md',
            )}
        >
            <header className="grid gap-1">
                <div className="flex items-start justify-between gap-4">
                    <p className="text-muted-foreground pt-1 text-sm">
                        <span className="tabular">#{rank}</span> · {rec.destination.country}
                    </p>
                    <MatchScore score={rec.score.total} size="md" className="w-28 shrink-0" />
                </div>
                <h3 id={`${rec.id}-name`} className="text-2xl leading-tight font-semibold">
                    {rec.destination.name}
                </h3>
                <p className="text-muted-foreground text-sm">
                    {formatDateRange(rec.checkIn, rec.checkOut)} · {rec.nights} nights
                </p>
            </header>

            <div className="mt-4 grid gap-1.5">
                <TransportLine transport={rec.transport} />
                <span className="inline-flex items-center gap-1.5 text-sm">
                    <BedDoubleIcon className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">{stay.name}</span>
                    {stay.rating !== undefined && (
                        <span className="text-muted-foreground inline-flex items-center gap-0.5">
                            · <StarIcon className="size-3" /> {stay.rating.toFixed(1)}
                        </span>
                    )}
                </span>
            </div>

            <div className="mt-4 grid gap-1 border-t pt-4">
                <div className="flex items-baseline justify-between gap-3">
                    <Amount
                        value={rec.costs.tripTotal}
                        rounded
                        className="font-display text-3xl font-semibold"
                    />
                    <BudgetDelta
                        difference={rec.costs.budgetDifference}
                        className="text-right text-xs"
                    />
                </div>
                <p className="text-muted-foreground text-xs">
                    <Amount value={rec.costs.bookableTotal} rounded /> bookable +{' '}
                    <Amount value={rec.costs.estimatedInBudget} rounded /> our estimate · food
                    extra, about <Amount value={rec.costs.estimatedExtras} rounded />
                </p>
            </div>

            <ReasonList reasons={pickReasons(rec.reasons, 4)} className="mt-4" />

            <footer className="mt-auto flex items-center justify-between gap-3 pt-5">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`compare-${rec.id}`}
                        checked={selected}
                        disabled={!selected && !canSelect}
                        onCheckedChange={onToggleCompare}
                    />
                    <Label htmlFor={`compare-${rec.id}`} className="font-normal">
                        Compare
                    </Label>
                </div>
                <Button variant="outline" onClick={onOpen}>
                    See the details
                </Button>
            </footer>
        </article>
    );
}
