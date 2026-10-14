import { cn } from '@/lib/utils';
import { providerLabel } from '@/lib/labels';
import type { SearchResult } from '@/lib/types';

const ROWS = [
    { key: 'flights', label: 'Flights', real: 'cached prices from recent searches' },
    { key: 'accommodation', label: 'Stays', real: 'live prices' },
    { key: 'routing', label: 'Roads', real: 'real routes, tolls estimated' },
    { key: 'weather', label: 'Weather', real: 'forecast or past years' },
] as const;

/** Says, per kind of data, whether this search used a real provider or a mock (fictional) one. */
export function DataSources({
    sources,
    className,
}: {
    sources: SearchResult['sources'] | undefined;
    className?: string;
}) {
    if (!sources) return null;
    const anyMock = ROWS.some((r) => sources[r.key].mock);
    return (
        <p className={cn('text-muted-foreground text-xs', className)}>
            <span className="text-foreground font-medium">Data used: </span>
            {ROWS.map((r, i) => {
                const s = sources[r.key];
                return (
                    <span key={r.key}>
                        {i > 0 && ' · '}
                        {r.label}:{' '}
                        {s.mock ? (
                            <span className="text-warning font-medium">fictional (mock)</span>
                        ) : (
                            `${providerLabel(s.provider)}, ${r.real}`
                        )}
                    </span>
                );
            })}
            {sources.flightCheck && (
                <span>
                    {' · '}Top flights checked live: {providerLabel(sources.flightCheck.provider)}
                </span>
            )}
            {anyMock && '. Fictional prices are for testing only.'}
        </p>
    );
}
