import type { Clock } from '@travel-where-to/shared';
import { fromMajor, haversineKm, systemClock } from '@travel-where-to/shared';
import type {
    Airport,
    FlightDiscoveryRequest,
    FlightOffer,
    FlightProvider,
    IndicativeFlightResult,
} from '@travel-where-to/domain';
import { countTravellers } from '@travel-where-to/domain';

export interface EstimatedFlightFallbackOptions {
    /** Every airport we may need distances for (departure + destination airports). */
    readonly airports: readonly Airport[];
    readonly clock?: Clock;
    /** Round-trip economy fare per seat ≈ base + perKm × great-circle km (EUR). */
    readonly baseFare?: number;
    readonly perKm?: number;
}

export const ESTIMATE_PROVIDER = 'our-estimate';

/**
 * Wraps a cache-based flight provider. When it has NO price at all for a request (quiet route,
 * dates far ahead), returns our own distance-based estimate instead of dropping the place:
 * confidence ESTIMATED, the basis written on the cost line, no flight times, and a Google Flights
 * link to check. Errors are never hidden - only an empty answer triggers the estimate.
 * The live check (SerpApi) re-prices the top results, replacing estimates with real prices.
 */
export class EstimatedFlightFallback implements FlightProvider {
    readonly name: string;
    private readonly airports: ReadonlyMap<string, Airport>;
    private readonly clock: Clock;

    constructor(
        private readonly inner: FlightProvider,
        private readonly options: EstimatedFlightFallbackOptions,
    ) {
        this.name = inner.name;
        this.airports = new Map(options.airports.map((a) => [a.iata, a]));
        this.clock = options.clock ?? systemClock;
    }

    async searchIndicative(req: FlightDiscoveryRequest): Promise<IndicativeFlightResult[]> {
        const real = await this.inner.searchIndicative(req);
        if (real.length > 0) return real;
        return this.estimates(req).map((e) => ({
            originAirport: e.originAirport,
            destinationAirport: e.destinationAirport,
            outboundDate: req.outboundDate,
            returnDate: req.returnDate,
            direct: e.outbound.stops === 0,
            price: e.price,
        }));
    }

    async searchLive(req: FlightDiscoveryRequest): Promise<FlightOffer[]> {
        const real = await this.inner.searchLive(req);
        return real.length > 0 ? real : this.estimates(req);
    }

    /** Per-seat round-trip estimate for a distance. */
    farePerSeat(km: number): number {
        return (
            Math.round(((this.options.baseFare ?? 150) + (this.options.perKm ?? 0.075) * km) / 10) *
            10
        );
    }

    private estimates(req: FlightDiscoveryRequest): FlightOffer[] {
        const c = countTravellers(req.travellers);
        const seats = c.adults + c.children + c.infants * 0.1;
        const out: FlightOffer[] = [];
        for (const fromCode of req.originAirports) {
            for (const toCode of req.destinationAirports) {
                const from = this.airports.get(fromCode);
                const to = this.airports.get(toCode);
                if (!from || !to || fromCode === toCode) continue;
                const km = Math.round(haversineKm(from.coordinates, to.coordinates));
                const perSeat = this.farePerSeat(km);
                // Assumption: up to ~8,000 km there are non-stop flights from Portugal's main airports; beyond, one stop.
                const stops = km > 8000 ? 1 : 0;
                const minutes = Math.round((km / 800) * 60 + 40 + stops * 150);
                const leg = (a: string, b: string, date: string) => ({
                    from: a,
                    to: b,
                    departure: date,
                    arrival: '',
                    durationMinutes: minutes,
                    stops,
                    carrier: 'Airline not known yet',
                });
                const link = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${fromCode} to ${toCode} on ${req.outboundDate} through ${req.returnDate}`)}`;
                out.push({
                    originAirport: fromCode,
                    destinationAirport: toCode,
                    outbound: leg(fromCode, toCode, req.outboundDate),
                    price: {
                        amount: fromMajor(Math.round(perSeat * seats), req.currency),
                        confidence: 'ESTIMATED',
                        attribution: {
                            provider: ESTIMATE_PROVIDER,
                            providerOfferId: `est-${fromCode}${toCode}-${req.outboundDate}-${req.returnDate}`,
                            retrievedAt: this.clock.now(),
                            deepLink: link,
                        },
                    },
                    priceBasis: `Our estimate: no recent prices for ${fromCode}–${toCode} around these dates. About ${perSeat} ${req.currency} per seat for ${km.toLocaleString('en-IE')} km × ${c.adults + c.children} seat${c.adults + c.children === 1 ? '' : 's'}${c.infants ? ` + ${c.infants} baby at ~10%` : ''}. Check the real price.`,
                });
            }
        }
        return out;
    }
}
