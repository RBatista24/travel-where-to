'use client';

import * as React from 'react';
import { CircleAlertIcon, RotateCwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Button } from '@/components/atoms/button';
import { errorLines } from '@/lib/api';

/** Error block with the reason and a retry button. */
export function ErrorState({
    error,
    onRetry,
    title = "We couldn't load this",
}: {
    error: unknown;
    onRetry?: () => void;
    title?: string;
}) {
    const [first, ...rest] = errorLines(error);
    return (
        <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>
                <p>{first}</p>
                {rest.length > 0 && (
                    <ul className="list-disc pl-4">
                        {rest.map((l) => (
                            <li key={l}>{l}</li>
                        ))}
                    </ul>
                )}
                {onRetry && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                        <RotateCwIcon /> Try again
                    </Button>
                )}
            </AlertDescription>
        </Alert>
    );
}
