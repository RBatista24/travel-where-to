import * as React from 'react';

/** Results: headline + summary, notices, the ranked list, and a slot for overlays (sheet, compare tray). */
export function ResultsLayout({
    headline,
    summary,
    notices,
    children,
    overlays,
}: {
    headline: React.ReactNode;
    summary: React.ReactNode;
    notices?: React.ReactNode;
    children: React.ReactNode;
    overlays?: React.ReactNode;
}) {
    return (
        <div className="grid gap-6">
            <div className="grid gap-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h1>
                {summary}
            </div>
            {notices}
            {children}
            {overlays}
        </div>
    );
}
