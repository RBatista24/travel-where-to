import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import type { SearchResult } from '@/lib/types';

/** Partial results and assumptions, said plainly (spec §50). */
export function SearchNotices({ result }: { result: SearchResult }) {
    if (result.notices.length === 0 && result.excluded.length === 0) return null;
    // Same reason → one line, biggest group first; open by default when nothing fits.
    const nothing = result.recommendations.length === 0;
    const byReason = new Map<string, string[]>();
    for (const e of result.excluded)
        byReason.set(e.reason, [
            ...(byReason.get(e.reason) ?? []),
            e.name ?? e.destinationId.replaceAll('-', ' '),
        ]);
    const groups = [...byReason].sort((a, b) => b[1].length - a[1].length);
    return (
        <div className="grid gap-3">
            {result.notices.length > 0 && (
                <Alert variant="info">
                    <InfoIcon />
                    <AlertTitle>Worth knowing</AlertTitle>
                    <AlertDescription>
                        <ul className="grid gap-1">
                            {result.notices.map((n) => (
                                <li key={n}>{n}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            {result.excluded.length > 0 && (
                <details className="group text-sm" open={nothing}>
                    <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                        Why {result.excluded.length} place
                        {result.excluded.length === 1 ? ' is' : 's are'} not shown
                    </summary>
                    <ul className="mt-2 grid gap-2">
                        {groups.map(([reason, names]) => (
                            <li key={reason}>
                                <span className="text-foreground font-medium">
                                    {names.length} × {reason}
                                </span>
                                <span className="text-muted-foreground"> - {names.join(', ')}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
