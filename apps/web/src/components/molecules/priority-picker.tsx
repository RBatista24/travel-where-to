'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/toggle-group';
import { PRIORITY_HINT, PRIORITY_LABEL } from '@/lib/labels';
import type { RequirementPriority } from '@/lib/types';

const ORDER: RequirementPriority[] = ['MUST_HAVE', 'IMPORTANT', 'PREFERRED', 'AVOID'];

export function PriorityPicker({
    value,
    onChange,
    label,
}: {
    value: RequirementPriority | null;
    onChange: (value: RequirementPriority | null) => void;
    label: string;
}) {
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={value ?? ''}
            onValueChange={(v) => onChange(v ? (v as RequirementPriority) : null)}
            aria-label={`Priority for ${label}`}
            className="w-full sm:w-auto"
        >
            {ORDER.map((p) => (
                <ToggleGroupItem
                    key={p}
                    value={p}
                    title={PRIORITY_HINT[p]}
                    className={
                        p === 'AVOID'
                            ? 'data-[state=on]:bg-destructive-soft data-[state=on]:text-destructive px-2.5 text-xs'
                            : 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-2.5 text-xs'
                    }
                >
                    {PRIORITY_LABEL[p]}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}
