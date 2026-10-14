'use client';

import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';

/** Number input as − value + (travellers). */
export function Stepper({
    id,
    label,
    hint,
    value,
    min = 0,
    max = 9,
    onChange,
}: {
    id: string;
    label: string;
    hint?: string;
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <div id={`${id}-label`} className="text-sm font-medium">
                    {label}
                </div>
                {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
            </div>
            <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-full"
                    disabled={value <= min}
                    onClick={() => onChange(value - 1)}
                    aria-label={`Fewer ${label.toLowerCase()}`}
                >
                    <MinusIcon />
                </Button>
                <output id={id} className="tabular w-6 text-center font-medium" aria-live="polite">
                    {value}
                </output>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-full"
                    disabled={value >= max}
                    onClick={() => onChange(value + 1)}
                    aria-label={`More ${label.toLowerCase()}`}
                >
                    <PlusIcon />
                </Button>
            </div>
        </div>
    );
}
