import type { Coordinates, LocalDate, Money } from '@travel-where-to/shared';
import type { Traveller } from './travellers';
import type { AccommodationType, FlightPreferences } from './criteria';
import type { AccommodationFacility } from './requirements';
import type { ProviderAttribution, ProviderPrice } from './pricing';

// ---------- Flights ----------

export interface FlightDiscoveryRequest {
    readonly originAirports: readonly string[];
    readonly destinationAirports: readonly string[];
    readonly outboundDate: LocalDate;
    readonly returnDate: LocalDate;
    readonly travellers: readonly Traveller[];
    readonly currency: string;
    /** Hard filters providers should apply when they can (direct only, departure times). The engine re-checks. */
    readonly preferences?: FlightPreferences;
}

export interface IndicativeFlightResult {
    readonly originAirport: string;
    readonly destinationAirport: string;
    readonly outboundDate: LocalDate;
    readonly returnDate: LocalDate;
    readonly direct: boolean;
    /** Total for all travellers, round trip. */
    readonly price: ProviderPrice;
}

export type FlightSearchRequest = FlightDiscoveryRequest;

export interface FlightLeg {
    readonly from: string;
    readonly to: string;
    readonly departure: string; // ISO local date-time at origin, "YYYY-MM-DDTHH:mm"
    /** Local arrival time; empty when the provider doesn't give it reliably. */
    readonly arrival: string;
    readonly durationMinutes: number;
    readonly stops: number;
    readonly carrier: string;
}

export interface FlightOffer {
    readonly originAirport: string;
    readonly destinationAirport: string;
    readonly outbound: FlightLeg;
    /** Absent when the provider priced the round trip without detailing the return flight. */
    readonly inbound?: FlightLeg;
    /** Total for all travellers, round trip. */
    readonly price: ProviderPrice;
    readonly cabinBaggageIncluded?: boolean;
    /** How the total was derived when the provider prices per passenger, e.g. "€89 per adult (cached) × 3 seats". */
    readonly priceBasis?: string;
    /**
     * Preferences the provider applied in its own search, for details the offer can't show
     * (e.g. Google Flights filtered the return time but the return flight isn't detailed).
     */
    readonly filteredBy?: {
        readonly directOnly?: boolean;
        readonly outboundTimes?: boolean;
        readonly returnTimes?: boolean;
    };
}

// ---------- Accommodation ----------

export interface AccommodationSearchRequest {
    readonly locationId: string;
    /** Human place name for providers that search by text, e.g. "Málaga, Spain". */
    readonly locationName?: string;
    readonly countryCode?: string;
    /**
     * Set when only specific properties are wanted (e.g. a theme park's official hotels):
     * providers should widen their result list or search by these names. The engine still filters.
     */
    readonly wantedPropertyNames?: readonly string[];
    readonly centre: Coordinates;
    readonly beach?: Coordinates;
    readonly checkIn: LocalDate;
    readonly checkOut: LocalDate;
    /** Real ages are passed through to providers. */
    readonly travellers: readonly Traveller[];
    readonly types: readonly AccommodationType[];
    readonly currency: string;
}

export interface AccommodationOffer {
    readonly propertyId: string;
    readonly name: string;
    readonly type: AccommodationType;
    readonly stars?: number;
    /** 0–10 guest rating. */
    readonly rating?: number;
    readonly reviewCount?: number;
    readonly facilities: readonly AccommodationFacility[];
    readonly coordinates: Coordinates;
    readonly distanceToCentreM?: number;
    readonly distanceToBeachM?: number;
    readonly roomDescription: string;
    /** Total for the whole stay and party. */
    readonly price: ProviderPrice;
    readonly breakfastIncluded: boolean;
}

// ---------- Routing ----------

export interface RouteRequest {
    readonly from: Coordinates;
    readonly to: Coordinates;
}

export interface RouteResult {
    readonly distanceKm: number;
    readonly durationMinutes: number;
    /** One-way toll estimate when the provider knows it. */
    readonly tolls?: Money;
    readonly provider: string;
}

// ---------- Weather ----------

export interface WeatherRequest {
    readonly locationId: string;
    readonly coordinates: Coordinates;
    readonly startDate: LocalDate;
    readonly endDate: LocalDate;
}

/** FORECAST when the trip is within the forecast horizon, CLIMATE_AVERAGE otherwise. */
export type WeatherConfidence = 'FORECAST' | 'CLIMATE_AVERAGE';

export interface WeatherResult {
    readonly avgHighC: number;
    readonly avgLowC: number;
    readonly rainyDaysExpected: number;
    readonly seaTempC?: number;
    readonly confidence: WeatherConfidence;
    readonly attribution: Pick<ProviderAttribution, 'provider' | 'retrievedAt'>;
}
