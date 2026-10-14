'use client';

import * as React from 'react';
import { ClockIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAgo, isPast } from '@/lib/format';
import { providerLabel } from '@/lib/labels';
import type { PriceConfidence, ProviderAttribution } from '@/lib/types';

/** "Price checked 4 minutes ago" / "Indicative price - may have changed" / expiry warning. */
export function Freshness({
    attribution,
    confidence,
    className,
}: {
    attribution?: ProviderAttribution;
    confidence: PriceConfidence;
    className?: string;
}) {
    const [now, setNow] = React.useState<Date | null>(null);
    React.useEffect(() => {
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(t);
    }, []);

    if (!attribution || confidence === 'ESTIMATED') return null;
    const expired = now !== null && isPast(attribution.expiresAt, now);
    let text: string;
    if (confidence === 'INDICATIVE') {
        text = `Indicative price from ${providerLabel(attribution.provider)} - may have changed`;
    } else if (expired) {
        text = 'Price may have changed - search again before booking';
    } else {
        text = `Price checked ${now ? formatAgo(attribution.retrievedAt, now) : 'recently'} with ${providerLabel(attribution.provider)}`;
    }
    const Icon = expired ? TriangleAlertIcon : ClockIcon;
    return (
        <span
            className={cn(
                'text-muted-foreground inline-flex items-center gap-1 text-xs',
                expired && 'text-warning',
                className,
            )}
        >
            <Icon className="size-3 shrink-0" />
            {text}
        </span>
    );
}
