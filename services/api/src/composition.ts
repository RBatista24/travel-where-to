import type { Clock } from '@travel-where-to/shared';
import { fromMajor, systemClock } from '@travel-where-to/shared';
import type {
    AccommodationProvider,
    FlightProvider,
    LiveFlightProvider,
    RoutingProvider,
    WeatherProvider,
} from '@travel-where-to/domain';
import {
    DESTINATION_CATALOGUE,
    InMemoryDestinationRepository,
    PORTUGAL_DEPARTURE_AIRPORTS,
} from '@travel-where-to/destination-engine';
import {
    EstimatedFlightFallback,
    MockFlightProvider,
    SerpApiGoogleFlightsProvider,
    TravelpayoutsFlightProvider,
} from '@travel-where-to/flight-providers';
import {
    LiteApiAccommodationProvider,
    MockAccommodationProvider,
    SerpApiGoogleHotelsProvider,
} from '@travel-where-to/accommodation-providers';
import {
    MockRoutingProvider,
    OpenRouteServiceRoutingProvider,
} from '@travel-where-to/routing-providers';
import { MockWeatherProvider, OpenMeteoWeatherProvider } from '@travel-where-to/weather-providers';
import {
    SearchEngine,
    type ProviderCallLogger,
    type SearchEngineConfig,
} from '@travel-where-to/search-engine';

export interface CompositionOptions {
    readonly clock?: Clock;
    readonly logger?: ProviderCallLogger;
    readonly config?: Partial<SearchEngineConfig>;
}

export interface Providers {
    readonly flights: FlightProvider;
    readonly accommodation: AccommodationProvider;
    readonly routing: RoutingProvider;
    readonly weather: WeatherProvider;
    readonly flightVerifier?: LiveFlightProvider;
}

type Env = Record<string, string | undefined>;

const ALL_AIRPORTS = [
    ...PORTUGAL_DEPARTURE_AIRPORTS,
    ...DESTINATION_CATALOGUE.flatMap((d) => d.airports),
];
const climate = new Map(DESTINATION_CATALOGUE.map((d) => [d.id, d.climate]));

export function mockProviders(clock: Clock): Providers {
    return {
        flights: new MockFlightProvider({ airports: ALL_AIRPORTS, clock }),
        accommodation: new MockAccommodationProvider({ clock }),
        routing: new MockRoutingProvider(),
        weather: new MockWeatherProvider({ climateFor: (id) => climate.get(id), clock }),
    };
}

/** Accepts the documented name and common aliases (e.g. SERPAPI_API_KEY). */
const ALIASES: Record<string, string[]> = {
    SERPAPI_KEY: ['SERPAPI_KEY', 'SERPAPI_API_KEY'],
    LITEAPI_KEY: ['LITEAPI_KEY', 'LITEAPI_API_KEY', 'LITE_API_KEY'],
    ORS_API_KEY: ['ORS_API_KEY', 'OPENROUTESERVICE_API_KEY'],
    TRAVELPAYOUTS_TOKEN: ['TRAVELPAYOUTS_TOKEN', 'TRAVELPAYOUTS_API_TOKEN'],
};

function value(env: Env, key: string): string | undefined {
    for (const k of ALIASES[key] ?? [key]) {
        const v = env[k]?.trim();
        if (v) return v;
    }
    return undefined;
}

function required(env: Env, key: string, forWhat: string): string {
    const v = value(env, key);
    if (!v)
        throw new Error(
            `${key} is not set but ${forWhat} is selected. Add it to services/api/.env (see .env.example).`,
        );
    return checkedKey(key, v);
}

/** Keys travel in HTTP headers/URLs: catch placeholders like "…" or "<key>" before the provider does. */
export function checkedKey(name: string, v: string): string {
    if (!/^[\x21-\x7e]+$/.test(v) || v.length < 8 || /^<.*>$/.test(v)) {
        throw new Error(
            `${name} looks like a placeholder (${v.length} character${v.length === 1 ? '' : 's'}${/[^\x21-\x7e]/.test(v) ? ', contains non-ASCII characters' : ''}). Paste the real key into .env.`,
        );
    }
    return v;
}

function pickChoice(env: Env, key: string): string {
    return (env[key] ?? 'mock').trim().toLowerCase();
}

function serpGlOf(env: Env): string {
    return env.SERPAPI_GL?.trim() || 'pt';
}

/** Explicit ACCOMMODATION_PROVIDER, else LiteAPI when its key is set, else mock. */
function accommodationChoice(env: Env): string {
    if (env.ACCOMMODATION_PROVIDER?.trim()) return pickChoice(env, 'ACCOMMODATION_PROVIDER');
    if (value(env, 'LITEAPI_KEY')) return 'liteapi';
    return 'mock';
}

/** Explicit FLIGHT_VERIFIER, else SerpApi when its key is set, else none. */
function verifierChoice(env: Env): string {
    if (env.FLIGHT_VERIFIER?.trim()) return env.FLIGHT_VERIFIER.trim().toLowerCase();
    if (value(env, 'SERPAPI_KEY')) return 'serpapi';
    return 'none';
}

function flightsFromEnv(env: Env, clock: Clock, mock: FlightProvider): FlightProvider {
    switch (pickChoice(env, 'FLIGHT_PROVIDER')) {
        case 'mock':
            return mock;
        case 'travelpayouts': {
            const tp = new TravelpayoutsFlightProvider({
                token: required(env, 'TRAVELPAYOUTS_TOKEN', 'FLIGHT_PROVIDER=travelpayouts'),
                market: env.TRAVELPAYOUTS_MARKET?.trim() || 'pt',
                clock,
                ...(env.TRAVELPAYOUTS_MARKER?.trim()
                    ? { marker: env.TRAVELPAYOUTS_MARKER.trim() }
                    : {}),
            });
            // The cache only has recently searched trips; without a price we estimate (labelled) instead of dropping the place.
            return (env.FLIGHT_ESTIMATE_FALLBACK ?? 'true').trim().toLowerCase() === 'false'
                ? tp
                : new EstimatedFlightFallback(tp, { airports: ALL_AIRPORTS, clock });
        }
        default:
            throw new Error(`Unknown FLIGHT_PROVIDER: ${env.FLIGHT_PROVIDER}`);
    }
}

function routingFromEnv(env: Env, mock: RoutingProvider): RoutingProvider {
    switch (pickChoice(env, 'ROUTING_PROVIDER')) {
        case 'mock':
            return mock;
        case 'openrouteservice':
            return new OpenRouteServiceRoutingProvider({
                apiKey: required(env, 'ORS_API_KEY', 'ROUTING_PROVIDER=openrouteservice'),
                ...(env.TOLL_RATE_EUR_PER_KM
                    ? { tollPerKm: fromMajor(Number(env.TOLL_RATE_EUR_PER_KM), 'EUR') }
                    : {}),
            });
        default:
            throw new Error(`Unknown ROUTING_PROVIDER: ${env.ROUTING_PROVIDER}`);
    }
}

function weatherFromEnv(env: Env, clock: Clock, mock: WeatherProvider): WeatherProvider {
    switch (pickChoice(env, 'WEATHER_PROVIDER')) {
        case 'mock':
            return mock;
        case 'open-meteo':
            return new OpenMeteoWeatherProvider({
                clock,
                ...(env.OPEN_METEO_API_KEY?.trim()
                    ? { apiKey: env.OPEN_METEO_API_KEY.trim() }
                    : {}),
            });
        default:
            throw new Error(`Unknown WEATHER_PROVIDER: ${env.WEATHER_PROVIDER}`);
    }
}

function accommodationFromEnv(
    env: Env,
    clock: Clock,
    mock: AccommodationProvider,
): AccommodationProvider {
    switch (accommodationChoice(env)) {
        case 'mock':
            return mock;
        case 'liteapi':
            return new LiteApiAccommodationProvider({
                apiKey: required(env, 'LITEAPI_KEY', 'ACCOMMODATION_PROVIDER=liteapi'),
                clock,
            });
        case 'serpapi':
            return new SerpApiGoogleHotelsProvider({
                apiKey: required(env, 'SERPAPI_KEY', 'ACCOMMODATION_PROVIDER=serpapi'),
                gl: serpGlOf(env),
                clock,
            });
        default:
            throw new Error(`Unknown ACCOMMODATION_PROVIDER: ${env.ACCOMMODATION_PROVIDER}`);
    }
}

function flightVerifierFromEnv(env: Env, clock: Clock): LiveFlightProvider | undefined {
    switch (verifierChoice(env)) {
        case 'none':
        case '':
            return undefined;
        case 'serpapi':
            return new SerpApiGoogleFlightsProvider({
                apiKey: required(env, 'SERPAPI_KEY', 'FLIGHT_VERIFIER=serpapi'),
                gl: serpGlOf(env),
                pricePerPerson: env.SERPAPI_PRICE_PER_PERSON?.trim().toLowerCase() === 'true',
                clock,
            });
        default:
            throw new Error(`Unknown FLIGHT_VERIFIER: ${env.FLIGHT_VERIFIER}`);
    }
}

/**
 * Picks each provider from environment variables. Anything not configured stays a mock,
 * and every search result says which sources were real (`sources`).
 *
 *   FLIGHT_PROVIDER=mock|travelpayouts   TRAVELPAYOUTS_TOKEN, TRAVELPAYOUTS_MARKER, TRAVELPAYOUTS_MARKET
 *   ROUTING_PROVIDER=mock|openrouteservice  ORS_API_KEY, TOLL_RATE_EUR_PER_KM
 *   WEATHER_PROVIDER=mock|open-meteo     OPEN_METEO_API_KEY (commercial plans only)
 *   ACCOMMODATION_PROVIDER=mock|liteapi|serpapi  LITEAPI_KEY / SERPAPI_KEY
 *   FLIGHT_VERIFIER=none|serpapi        SERPAPI_KEY, SERPAPI_GL, SERPAPI_PRICE_PER_PERSON (live check of the top results)
 */
export function providersFromEnv(env: Env, clock: Clock = systemClock): Providers {
    const mocks = mockProviders(clock);
    const flights = flightsFromEnv(env, clock, mocks.flights);
    const routing = routingFromEnv(env, mocks.routing);
    const weather = weatherFromEnv(env, clock, mocks.weather);
    const accommodation = accommodationFromEnv(env, clock, mocks.accommodation);
    const flightVerifier = flightVerifierFromEnv(env, clock);
    return {
        flights,
        accommodation,
        routing,
        weather,
        ...(flightVerifier ? { flightVerifier } : {}),
    };
}

export function createSearchEngine(
    providers: Providers,
    options: CompositionOptions = {},
): SearchEngine {
    const clock = options.clock ?? systemClock;
    return new SearchEngine({
        destinations: new InMemoryDestinationRepository(DESTINATION_CATALOGUE),
        ...providers,
        departureAirports: PORTUGAL_DEPARTURE_AIRPORTS,
        clock,
        ...(options.logger ? { logger: options.logger } : {}),
        ...(options.config ? { config: options.config } : {}),
    });
}

/** All mocks: tests and the demo. */
export function createMockSearchEngine(options: CompositionOptions = {}): SearchEngine {
    return createSearchEngine(mockProviders(options.clock ?? systemClock), options);
}
