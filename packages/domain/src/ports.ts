import type {
    AccommodationOffer,
    AccommodationSearchRequest,
    FlightDiscoveryRequest,
    FlightOffer,
    FlightSearchRequest,
    IndicativeFlightResult,
    RouteRequest,
    RouteResult,
    WeatherRequest,
    WeatherResult,
} from './offers';

/**
 * Provider ports. Concrete adapters (mock, Skyscanner, Booking.com, …) live in
 * their own packages and must map provider-specific payloads to these models.
 */
export interface FlightProvider {
    readonly name: string;
    searchIndicative(request: FlightDiscoveryRequest): Promise<IndicativeFlightResult[]>;
    searchLive(request: FlightSearchRequest): Promise<FlightOffer[]>;
}

/**
 * Live, bookable flight prices used to verify a shortlist (costly per call, so the engine
 * calls it only for the top results).
 */
export type LiveFlightProvider = Pick<FlightProvider, 'name' | 'searchLive'>;

export interface AccommodationProvider {
    readonly name: string;
    search(request: AccommodationSearchRequest): Promise<AccommodationOffer[]>;
}

export interface RoutingProvider {
    readonly name: string;
    calculateRoute(request: RouteRequest): Promise<RouteResult>;
}

export interface WeatherProvider {
    readonly name: string;
    getForecast(request: WeatherRequest): Promise<WeatherResult>;
}

export type ProviderErrorKind =
    'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'AUTHENTICATION' | 'INVALID_RESPONSE' | 'UNKNOWN';

export class ProviderError extends Error {
    constructor(
        readonly provider: string,
        readonly kind: ProviderErrorKind,
        message: string,
    ) {
        super(`[${provider}] ${kind}: ${message}`);
        this.name = 'ProviderError';
    }
}
