import type { Clock, FailureInjector, Rng } from '@travel-where-to/shared';
import {
    between,
    dayOfWeek,
    haversineKm,
    monthOf,
    seededRng,
    SEASON_FACTOR,
    sleep,
    systemClock,
} from '@travel-where-to/shared';
import type {
    Airport,
    FlightDiscoveryRequest,
    FlightOffer,
    FlightProvider,
    IndicativeFlightResult,
} from '@travel-where-to/domain';
import {
    countTravellers,
    ProviderError,
    TIME_OF_DAY_HOURS,
    type TimeOfDay,
} from '@travel-where-to/domain';
import { mapIndicativeQuotes, mapLiveQuotes, type RawQuote } from './mockFlightPayload';

export interface MockFlightProviderOptions {
    /** All airports the mock knows about (to compute distances). */
    readonly airports: readonly Airport[];
    readonly clock?: Clock;
    readonly failures?: FailureInjector;
    readonly latencyMs?: number;
    /** How long a live price is considered valid. */
    readonly priceTtlMinutes?: number;
}

/** Mock route network: probability that a departure airport serves a given destination, and of it being direct. */
const ROUTE_COVERAGE: Record<string, { served: number; direct: number }> = {
    LIS: { served: 1, direct: 0.85 },
    OPO: { served: 0.8, direct: 0.6 },
    FAO: { served: 0.6, direct: 0.45 },
};
const MIN_ROUTE_KM = 250;
const CARRIERS = ['MockAir', 'Sample Jet', 'Demo Airways'];

/**
 * Deterministic fake flight provider. Same request → same prices.
 * Prices are clearly fictional and the deep links point to a reserved .invalid domain.
 */
export class MockFlightProvider implements FlightProvider {
    readonly name = 'mock-flights';
    private readonly airports: ReadonlyMap<string, Airport>;
    private readonly clock: Clock;

    constructor(private readonly options: MockFlightProviderOptions) {
        this.airports = new Map(options.airports.map((a) => [a.iata, a]));
        this.clock = options.clock ?? systemClock;
    }

    async searchIndicative(request: FlightDiscoveryRequest): Promise<IndicativeFlightResult[]> {
        await this.simulate('searchIndicative', request);
        const raw = { status: 'OK', quotes: this.generate(request, 'indicative') };
        return mapIndicativeQuotes(raw, {
            provider: this.name,
            retrievedAt: this.clock.now(),
            expectedCurrency: request.currency,
        }).items;
    }

    async searchLive(request: FlightDiscoveryRequest): Promise<FlightOffer[]> {
        await this.simulate('searchLive', request);
        const raw = { status: 'OK', quotes: this.generate(request, 'live') };
        return mapLiveQuotes(raw, {
            provider: this.name,
            retrievedAt: this.clock.now(),
            ttlMinutes: this.options.priceTtlMinutes ?? 30,
            expectedCurrency: request.currency,
        }).items;
    }

    private async simulate(operation: string, request: FlightDiscoveryRequest): Promise<void> {
        if (this.options.latencyMs) await sleep(this.options.latencyMs);
        const failure = this.options.failures?.(operation, request.destinationAirports.join(','));
        if (failure)
            throw new ProviderError(this.name, failure, `Simulated ${failure} for ${operation}`);
    }

    private generate(req: FlightDiscoveryRequest, phase: 'indicative' | 'live'): RawQuote[] {
        const counts = countTravellers(req.travellers);
        const seatFactor = counts.adults + counts.children * 0.75 + counts.infants * 0.1;
        const quotes: RawQuote[] = [];
        for (const fromCode of req.originAirports) {
            for (const toCode of req.destinationAirports) {
                const pair = this.routeFor(req, fromCode, toCode);
                if (pair) quotes.push(quoteFor(req, phase, seatFactor, pair));
            }
        }
        return quotes;
    }

    /** The route between two airports if the mock network serves it for these preferences. */
    private routeFor(
        req: FlightDiscoveryRequest,
        fromCode: string,
        toCode: string,
    ): RoutePair | undefined {
        const from = this.airports.get(fromCode);
        const to = this.airports.get(toCode);
        if (!from || !to || fromCode === toCode) return undefined;
        const km = haversineKm(from.coordinates, to.coordinates);
        if (km < MIN_ROUTE_KM) return undefined;
        const routeRng = seededRng(`route:${fromCode}-${toCode}`);
        const coverage = ROUTE_COVERAGE[fromCode] ?? { served: 0.5, direct: 0.3 };
        if (routeRng() > coverage.served) return undefined;
        const direct = routeRng() <= coverage.direct;
        // Like a real search with a "non-stop" filter: other routes aren't returned.
        if (req.preferences?.directOnly && !direct) return undefined;
        const dateRng: Rng = seededRng(
            `price:${fromCode}-${toCode}:${req.outboundDate}:${req.returnDate}`,
        );
        return { fromCode, toCode, km, direct, routeRng, dateRng };
    }
}

/** Route facts shared by the price, schedule and carrier draws. */
interface RoutePair {
    readonly fromCode: string;
    readonly toCode: string;
    readonly km: number;
    readonly direct: boolean;
    readonly routeRng: Rng;
    readonly dateRng: Rng;
}

function weekdayFactorFor(date: string): number {
    const weekday = dayOfWeek(date);
    if (weekday === 5 || weekday === 0) return 1.15;
    if (weekday === 2 || weekday === 3) return 0.92;
    return 1;
}

function totalPriceCents(
    req: FlightDiscoveryRequest,
    phase: 'indicative' | 'live',
    seatFactor: number,
    pair: RoutePair,
): number {
    const { fromCode, toCode, km, direct, dateRng } = pair;
    const season = SEASON_FACTOR[monthOf(req.outboundDate) - 1] ?? 1;
    let perSeat =
        (35 + 0.085 * km) *
        season *
        weekdayFactorFor(req.outboundDate) *
        between(dateRng, 0.8, 1.25) *
        (direct ? 1 : 0.88);
    if (phase === 'indicative') {
        perSeat *= between(seededRng(`ind:${fromCode}-${toCode}:${req.outboundDate}`), 0.9, 1.05);
    }
    return Math.round(perSeat * seatFactor) * 100;
}

function quoteFor(
    req: FlightDiscoveryRequest,
    phase: 'indicative' | 'live',
    seatFactor: number,
    pair: RoutePair,
): RawQuote {
    const { fromCode, toCode, km, direct, routeRng, dateRng } = pair;
    const totalCents = totalPriceCents(req, phase, seatFactor, pair);
    const stops = direct ? 0 : 1;
    const duration = Math.round(35 + km / 12 + stops * 120);
    // Time filters behave like a provider's: the schedule shown is one inside the asked windows.
    const outHour = pickHour(dateRng(), 6, 14, req.preferences?.outboundTimes);
    const inHour = pickHour(dateRng(), 8, 13, req.preferences?.returnTimes);
    const id = `${phase}-${fromCode}${toCode}-${req.outboundDate}-${req.returnDate}`;
    return {
        quoteId: id,
        from: fromCode,
        to: toCode,
        outboundDate: req.outboundDate,
        returnDate: req.returnDate,
        totalPriceCents: totalCents,
        currency: req.currency,
        direct,
        carrier: CARRIERS[Math.floor(routeRng() * CARRIERS.length)] ?? 'MockAir',
        outboundDeparture: `${req.outboundDate}T${String(outHour).padStart(2, '0')}:${dateRng() < 0.5 ? '05' : '40'}`,
        outboundDurationMin: duration,
        inboundDeparture: `${req.returnDate}T${String(inHour).padStart(2, '0')}:${dateRng() < 0.5 ? '15' : '50'}`,
        inboundDurationMin: duration,
        stops,
        cabinBag: dateRng() < 0.6,
        bookingUrl: `https://mock-flights.invalid/book/${id}`,
    };
}

/** Default: `base + floor(r × span)`. With time windows: an hour inside them, from the same random draw. */
function pickHour(
    r: number,
    base: number,
    span: number,
    times: readonly TimeOfDay[] | undefined,
): number {
    if (!times || times.length === 0) return base + Math.floor(r * span);
    const hours = times.flatMap((t) => {
        const [a, b] = TIME_OF_DAY_HOURS[t];
        return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    });
    return hours[Math.floor(r * hours.length)] ?? hours[0] ?? base;
}
