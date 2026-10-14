'use client';

import { PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A pill that adds something to a list. */
export function ChoiceChip({
    label,
    onClick,
    className,
}: {
    label: string;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'border-input hover:border-primary hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-[3px]',
                className,
            )}
        >
            <PlusIcon className="size-3.5" />
            {label}
        </button>
    );
}
