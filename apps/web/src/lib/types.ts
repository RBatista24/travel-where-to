import type * as Domain from '@travel-where-to/domain';
import type { InterpretedIntent as DomainInterpretedIntent } from '@travel-where-to/llm';
import type { Money } from '@travel-where-to/shared';

/**
 * The web app reuses the domain types as the API contract. Over HTTP, Date values
 * arrive as ISO strings, which `Jsonify` expresses.
 */
export type Jsonify<T> = T extends Date
    ? string
    : T extends readonly (infer U)[]
      ? readonly Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;

export type { Money };
export type PriceConfidence = Domain.PriceConfidence;
export type Requirement = Domain.Requirement;
export type RequirementPriority = Domain.RequirementPriority;
export type DestinationAttribute = Domain.DestinationAttribute;
export type AccommodationFacility = Domain.AccommodationFacility;
export type TransportMode = Domain.TransportMode;
export type AccommodationType = Domain.AccommodationType;
export type Weekday = Domain.Weekday;
export type Region = Domain.Region;

export type SearchCriteria = Jsonify<Domain.SearchCriteria>;
export type SearchResult = Jsonify<Domain.SearchResult>;
export type TripRecommendation = Jsonify<Domain.TripRecommendation>;
export type TripAlternative = Jsonify<Domain.TripAlternative>;
export type TransportOption = Jsonify<Domain.TransportOption>;
export type CostItem = Jsonify<Domain.CostItem>;
export type CostBreakdown = Jsonify<Domain.CostBreakdown>;
export type ProviderAttribution = Jsonify<Domain.ProviderAttribution>;
export type MatchReason = Domain.MatchReason;
export type ScoreBreakdown = Domain.ScoreBreakdown;
export type RelaxationSuggestion = Jsonify<Domain.RelaxationSuggestion>;
export type InterpretedIntent = Jsonify<DomainInterpretedIntent>;
export type TravelIntent = InterpretedIntent['intent'];

export interface MoneyInput {
    readonly amount: number;
    readonly currency: string;
}

/** Body of POST /api/searches (money in major units). Mirrors services/api/src/schema.ts. */
export interface SearchRequest {
    readonly origin: SearchCriteria['origin'];
    readonly dates: SearchCriteria['dates'];
    readonly travellers: SearchCriteria['travellers'];
    readonly budget: MoneyInput;
    readonly transport: {
        readonly modes: readonly TransportMode[];
        readonly driving?: { readonly maxHours?: number; readonly preferredMaxHours?: number };
        readonly vehicle?: {
            readonly fuelType: 'PETROL' | 'DIESEL' | 'LPG' | 'ELECTRIC';
            readonly consumptionPer100Km: number;
            readonly fuelPrice: MoneyInput;
        };
        readonly flights?: SearchCriteria['transport']['flights'];
    };
    readonly destination: SearchCriteria['destination'];
    readonly requirements: readonly Requirement[];
    readonly accommodation: SearchCriteria['accommodation'];
    readonly weather?: SearchCriteria['weather'];
    readonly parkTickets?: SearchCriteria['parkTickets'];
}

export interface DestinationSummary {
    readonly id: string;
    readonly name: string;
    readonly country: string;
    readonly region: Region;
    readonly categories: readonly string[];
    readonly park?: {
        readonly name: string;
        readonly officialHotels: readonly string[];
        readonly maxTicketDays: number;
    };
}

/** POST /api/interpret: the validated intent plus destination names resolved to catalogue ids. */
export type InterpretResponse = InterpretedIntent & {
    readonly destinations: readonly { readonly id: string; readonly name: string }[];
};

export interface RecentSearch {
    readonly searchId: string;
    readonly createdAt: string;
    readonly criteria: SearchCriteria;
    readonly results: number;
    readonly top: readonly {
        readonly name: string;
        readonly score: number;
        readonly tripTotal: Money;
    }[];
}
