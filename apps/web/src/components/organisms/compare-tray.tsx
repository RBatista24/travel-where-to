'use client';

import Link from 'next/link';
import { ColumnsIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { tripKey } from '@/lib/result-views';
import type { TripRecommendation } from '@/lib/types';

export const MAX_COMPARE = 4;

/** Appears when trips are ticked for comparison. */
export function CompareTray({
    searchId,
    selected,
    onRemove,
    onClear,
}: {
    searchId: string;
    selected: readonly TripRecommendation[];
    onRemove: (id: string) => void;
    onClear: () => void;
}) {
    if (selected.length === 0) return null;
    const ids = selected.map((r) => tripKey(searchId, r)).join(',');
    return (
        <div
            role="region"
            aria-label="Trips to compare"
            className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-8px_24px_-12px_rgb(19_33_60/0.25)] backdrop-blur"
        >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {selected.map((r) => (
                        <li
                            key={r.id}
                            className="bg-secondary inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
                        >
                            {r.destination.name}
                            <button
                                type="button"
                                className="hover:bg-background rounded-full p-0.5"
                                onClick={() => onRemove(r.id)}
                                aria-label={`Remove ${r.destination.name}`}
                            >
                                <XIcon className="size-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
                <span className="text-muted-foreground text-xs">
                    {selected.length < 2 ? 'Pick one more to compare' : `Up to ${MAX_COMPARE}`}
                </span>
                <Button variant="ghost" size="sm" onClick={onClear}>
                    Clear
                </Button>
                {selected.length >= 2 ? (
                    <Button asChild>
                        <Link
                            href={`/results/${encodeURIComponent(searchId)}/compare?d=${encodeURIComponent(ids)}`}
                        >
                            <ColumnsIcon /> Compare {selected.length} trips
                        </Link>
                    </Button>
                ) : (
                    <Button disabled>
                        <ColumnsIcon /> Compare
                    </Button>
                )}
            </div>
        </div>
    );
}
