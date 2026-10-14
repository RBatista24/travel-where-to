import { z } from 'zod';
import type { Clock } from '@travel-where-to/shared';
import { fromMajor, systemClock } from '@travel-where-to/shared';
import type {
    FlightDiscoveryRequest,
    FlightLeg,
    FlightOffer,
    LiveFlightProvider,
} from '@travel-where-to/domain';
import {
    countTravellers,
    ProviderError,
    TIME_OF_DAY_HOURS,
    type TimeOfDay,
} from '@travel-where-to/domain';
import {
    PromiseCache,
    providerFetchJson,
    providerStatusError,
    type FetchLike,
} from '@travel-where-to/provider-http';

const PROVIDER = 'serpapi-google-flights';

const AirportSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    time: z.string().optional(),
});
const SegmentSchema = z.object({
    departure_airport: AirportSchema,
    arrival_airport: AirportSchema,
    duration: z.number().optional(),
    airline: z.string().optional(),
    flight_number: z.string().optional(),
});
const ItinerarySchema = z.object({
    flights: z.array(SegmentSchema).min(1),
    total_duration: z.number().positive().optional(),
    price: z.number().positive(),
    type: z.string().optional(),
    departure_token: z.string().optional(),
    booking_token: z.string().optional(),
});
type Itinerary = z.infer<typeof ItinerarySchema>;
const ResponseSchema = z.object({
    search_metadata: z
        .object({ status: z.string().optional(), google_flights_url: z.string().optional() })
        .passthrough()
        .optional(),
    best_flights: z.array(z.unknown()).optional(),
    other_flights: z.array(z.unknown()).optional(),
    error: z.string().optional(),
});

export interface SerpApiFlightsOptions {
    readonly apiKey: string;
    /** Country for Google results, e.g. "pt". */
    readonly gl?: string;
    readonly hl?: string;
    /**
     * Google Flights shows the total for all passengers; set true if your first live check
     * shows SerpApi returning per-person prices (see `pnpm check:serpapi`).
     */
    readonly pricePerPerson?: boolean;
    readonly baseUrl?: string;
    readonly fetch?: FetchLike;
    readonly clock?: Clock;
    readonly timeoutMs?: number;
    readonly cacheTtlMinutes?: number;
}

/**
 * Live flight prices from Google Flights through SerpApi. One call per route and dates,
 * used only to verify the best results (the free plan has 250 searches per month).
 * Returns the round-trip price with the outbound itinerary; the return flight's details
 * need a second call, so `inbound` is left out rather than guessed.
 */
export class SerpApiGoogleFlightsProvider implements LiveFlightProvider {
    readonly name = PROVIDER;
    private readonly clock: Clock;
    private readonly cache: PromiseCache<FlightOffer[]>;

    constructor(private readonly options: SerpApiFlightsOptions) {
        if (!options.apiKey) throw new Error('SERPAPI_KEY is required for SerpApi');
        this.clock = options.clock ?? systemClock;
        this.cache = new PromiseCache((options.cacheTtlMinutes ?? 30) * 60_000, () =>
            this.clock.now().getTime(),
        );
    }

    async searchLive(req: FlightDiscoveryRequest): Promise<FlightOffer[]> {
        const out: FlightOffer[] = [];
        const errors: unknown[] = [];
        for (const from of req.originAirports) {
            for (const to of req.destinationAirports) {
                if (from === to) continue;
                try {
                    out.push(...(await this.route(from, to, req)));
                } catch (e) {
                    errors.push(e);
                }
            }
        }
        if (out.length === 0 && errors.length > 0) throw errors[0];
        return out.sort((a, b) => a.price.amount.amountMinor - b.price.amount.amountMinor);
    }

    /** Google Flights counts children 2–11; 12+ fly as adults. Babies under 2 travel on a lap. */
    static passengers(req: FlightDiscoveryRequest) {
        const c = countTravellers(req.travellers);
        const teens = c.childAges.filter((a) => a >= 12).length;
        return {
            adults: c.adults + teens,
            children: c.children - teens,
            infantsOnLap: c.infants,
            total: c.adults + c.children + c.infants,
        };
    }

    /**
     * Google Flights takes one hour range per leg. Contiguous windows (e.g. morning + afternoon)
     * map exactly; others use the span between them and the engine re-checks what it can see.
     */
    static timeRange(
        times: readonly TimeOfDay[] | undefined,
    ): { param: string; exact: boolean } | undefined {
        if (!times || times.length === 0 || times.length === 4) return undefined;
        const ranges = times.map((t) => TIME_OF_DAY_HOURS[t]).sort((a, b) => a[0] - b[0]);
        const first = ranges[0]![0];
        const last = ranges[ranges.length - 1]![1];
        const covered = ranges.reduce((n, [a, b]) => n + (b - a + 1), 0);
        return { param: `${first},${last}`, exact: covered === last - first + 1 };
    }

    private route(from: string, to: string, req: FlightDiscoveryRequest): Promise<FlightOffer[]> {
        const pax = SerpApiGoogleFlightsProvider.passengers(req);
        const prefs = req.preferences;
        const outTimes = SerpApiGoogleFlightsProvider.timeRange(prefs?.outboundTimes);
        const backTimes = SerpApiGoogleFlightsProvider.timeRange(prefs?.returnTimes);
        const key = `${from}-${to}-${req.outboundDate}-${req.returnDate}-${pax.adults}-${pax.children}-${pax.infantsOnLap}-${req.currency}-${prefs?.directOnly ? 'd' : ''}-${outTimes?.param ?? ''}-${backTimes?.param ?? ''}`;
        return this.cache.get(key, async () => {
            const qs = new URLSearchParams({
                engine: 'google_flights',
                departure_id: from,
                arrival_id: to,
                outbound_date: req.outboundDate,
                return_date: req.returnDate,
                type: '1',
                adults: String(pax.adults),
                currency: req.currency,
                gl: this.options.gl ?? 'pt',
                hl: this.options.hl ?? 'en',
                api_key: this.options.apiKey,
                ...(pax.children ? { children: String(pax.children) } : {}),
                ...(pax.infantsOnLap ? { infants_on_lap: String(pax.infantsOnLap) } : {}),
                // stops=1 → non-stop only; *_times = "first hour,last hour" of departure.
                ...(prefs?.directOnly ? { stops: '1' } : {}),
                ...(outTimes ? { outbound_times: outTimes.param } : {}),
                ...(backTimes ? { return_times: backTimes.param } : {}),
            });
            const filteredBy = {
                ...(prefs?.directOnly ? { directOnly: true } : {}),
                ...(outTimes?.exact ? { outboundTimes: true } : {}),
                ...(backTimes?.exact ? { returnTimes: true } : {}),
            };
            const { status, body } = await providerFetchJson(
                `${this.options.baseUrl ?? 'https://serpapi.com'}/search.json?${qs.toString()}`,
                {},
                {
                    provider: PROVIDER,
                    timeoutMs: this.options.timeoutMs ?? 30_000,
                    ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
                },
            );
            const parsed = ResponseSchema.safeParse(body);
            if (status !== 200)
                throw providerStatusError(
                    PROVIDER,
                    status,
                    parsed.success ? (parsed.data.error ?? '') : '',
                );
            if (!parsed.success)
                throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);
            if (parsed.data.error) {
                // "Google Flights hasn't returned any results" is an answer, not a failure.
                if (/hasn't returned any results|no results/i.test(parsed.data.error)) return [];
                throw new ProviderError(
                    PROVIDER,
                    /run out of searches|limit/i.test(parsed.data.error)
                        ? 'RATE_LIMITED'
                        : 'UNAVAILABLE',
                    parsed.data.error,
                );
            }
            const searchUrl = parsed.data.search_metadata?.google_flights_url;
            const items = [
                ...(parsed.data.best_flights ?? []),
                ...(parsed.data.other_flights ?? []),
            ];
            const offers: FlightOffer[] = [];
            items.forEach((raw, i) => {
                const it = ItinerarySchema.safeParse(raw);
                if (!it.success) return;
                const offer = this.toOffer(it.data, i, from, to, req, pax.total, searchUrl);
                if (offer)
                    offers.push(Object.keys(filteredBy).length ? { ...offer, filteredBy } : offer);
            });
            return offers.slice(0, 5);
        });
    }

    private toOffer(
        it: Itinerary,
        index: number,
        from: string,
        to: string,
        req: FlightDiscoveryRequest,
        travellers: number,
        searchUrl?: string,
    ): FlightOffer | null {
        const first = it.flights[0]!;
        const last = it.flights[it.flights.length - 1]!;
        const departure = first.departure_airport.time;
        if (!departure || departure.slice(0, 10) !== req.outboundDate) return null;
        const minutes = it.total_duration ?? it.flights.reduce((a, s) => a + (s.duration ?? 0), 0);
        if (!minutes) return null;
        const outbound: FlightLeg = {
            from: first.departure_airport.id ?? from,
            to: last.arrival_airport.id ?? to,
            departure: departure.replace(' ', 'T').slice(0, 16),
            arrival: last.arrival_airport.time
                ? last.arrival_airport.time.replace(' ', 'T').slice(0, 16)
                : '',
            durationMinutes: minutes,
            stops: it.flights.length - 1,
            carrier:
                [...new Set(it.flights.map((s) => s.airline).filter(Boolean))].join(' + ') ||
                'Unknown airline',
        };
        const total = this.options.pricePerPerson ? it.price * travellers : it.price;
        return {
            originAirport: outbound.from,
            destinationAirport: outbound.to,
            outbound,
            price: {
                amount: fromMajor(total, req.currency),
                confidence: 'VERIFIED',
                attribution: {
                    provider: PROVIDER,
                    providerOfferId: `${from}${to}-${req.outboundDate}-${req.returnDate}-${index}-${first.flight_number ?? ''}`,
                    retrievedAt: this.clock.now(),
                    expiresAt: new Date(this.clock.now().getTime() + 60 * 60_000),
                    ...(searchUrl ? { deepLink: searchUrl } : {}),
                },
            },
            priceBasis: `Round trip for ${travellers} traveller${travellers === 1 ? '' : 's'} on Google Flights${this.options.pricePerPerson ? ' (per-person price × travellers)' : ''}.`,
        };
    }
}
