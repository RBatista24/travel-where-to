import { CarFrontIcon, PlaneTakeoffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/format';
import type { TransportOption } from '@/lib/types';

/** One-line description of how you get there. */
export function TransportLine({
    transport,
    className,
}: {
    transport: TransportOption;
    className?: string;
}) {
    if (transport.mode === 'CAR') {
        return (
            <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
                <CarFrontIcon className="text-muted-foreground size-4 shrink-0" />
                Drive · {formatDuration(transport.route.durationMinutes)} ·{' '}
                {Math.round(transport.route.distanceKm)} km
            </span>
        );
    }
    const o = transport.offer;
    return (
        <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
            <PlaneTakeoffIcon className="text-muted-foreground size-4 shrink-0" />
            {o.outbound.stops === 0 ? 'Direct' : `${o.outbound.stops} stop`} · {o.originAirport} →{' '}
            {o.destinationAirport} · {formatDuration(o.outbound.durationMinutes)}
        </span>
    );
}
