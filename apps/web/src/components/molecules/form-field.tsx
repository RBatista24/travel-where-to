import * as React from 'react';
import { Label } from '@/components/atoms/label';

/** The error message wins over the hint when both are present. */
function describedByFor(
    id: string,
    error: string | null | undefined,
    hint: React.ReactNode,
): string | undefined {
    if (error) return `${id}-error`;
    if (hint) return `${id}-hint`;
    return undefined;
}

/** Label + control + optional hint or error, wired together for accessibility. */
export function FormField({
    id,
    label,
    hint,
    error,
    children,
}: {
    id: string;
    label: string;
    hint?: React.ReactNode;
    error?: string | null;
    children: React.ReactElement<{
        id?: string;
        'aria-invalid'?: boolean;
        'aria-describedby'?: string;
    }>;
}) {
    const describedBy = describedByFor(id, error, hint);
    return (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            {React.cloneElement(children, {
                id,
                'aria-invalid': error ? true : undefined,
                'aria-describedby': describedBy,
            })}
            {error ? (
                <p id={`${id}-error`} className="text-destructive text-sm">
                    {error}
                </p>
            ) : null}
            {!error && hint ? (
                <p id={`${id}-hint`} className="text-muted-foreground text-xs">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
