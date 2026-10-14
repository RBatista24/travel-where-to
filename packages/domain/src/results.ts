import type { LocalDate, Money } from '@travel-where-to/shared';
import type { Airport, Destination } from './destination';
import type { AccommodationOffer, FlightOffer, RouteResult, WeatherResult } from './offers';
import type { CostBreakdown } from './pricing';
import type { SearchCriteria } from './criteria';

export type TransportOption =
  | {
      readonly mode: 'FLIGHT';
      readonly offer: FlightOffer;
      readonly departureAirport: Airport;
      /** Origin → departure airport drive. */
      readonly airportAccess: RouteResult;
      /** One-way door-to-door estimate including access drive and airport overhead. */
      readonly doorToDoorMinutes: number;
    }
  | {
      readonly mode: 'CAR';
      readonly route: RouteResult;
      readonly doorToDoorMinutes: number;
    };

export interface ScoreBreakdown {
  readonly total: number;
  readonly budget: number;
  readonly preferences: number;
  readonly transport: number;
  readonly accommodation: number;
  readonly location: number;
  readonly weather: number;
  /** Everything except price, 0–100: how good the trip is regardless of cost. Used for "best use of your budget". */
  readonly withoutPrice?: number;
}

export type ReasonTone = 'POSITIVE' | 'NEUTRAL' | 'WARNING';

/** Deterministic, data-backed explanation lines. An LLM may rephrase these, never invent them. */
export interface MatchReason {
  readonly tone: ReasonTone;
  readonly code: string;
  readonly message: string;
}

export interface TripRecommendation {
  readonly id: string;
  readonly destination: Pick<Destination, 'id' | 'name' | 'country' | 'countryCode' | 'scores'>;
  readonly checkIn: LocalDate;
  readonly checkOut: LocalDate;
  readonly nights: number;
  readonly transport: TransportOption;
  readonly accommodation: AccommodationOffer;
  readonly weather: WeatherResult | null;
  readonly costs: CostBreakdown;
  readonly score: ScoreBreakdown;
  readonly reasons: readonly MatchReason[];
  /** Other viable options for the same destination (other transport mode / dates), best first. */
  readonly alternatives: readonly TripAlternative[];
}

export interface TripAlternative {
  readonly checkIn: LocalDate;
  readonly checkOut: LocalDate;
  readonly mode: TransportOption['mode'];
  readonly tripTotal: Money;
  readonly doorToDoorMinutes: number;
  readonly score: number;
}

export interface ProviderIssue {
  readonly provider: string;
  readonly operation: string;
  readonly kind: string;
  readonly message: string;
  readonly destinationId?: string;
}

export interface ExcludedDestination {
  readonly destinationId: string;
  readonly name?: string;
  readonly reason: string;
}

export interface RelaxationSuggestion {
  readonly code: string;
  readonly description: string;
  readonly resultCount: number;
  readonly criteria: SearchCriteria;
}

/** Which provider supplied each kind of data in this search, so the UI can say so. */
export interface DataSource {
  readonly provider: string;
  /** True for fictional mock data. */
  readonly mock: boolean;
}

export interface DataSources {
  readonly flights: DataSource;
  readonly accommodation: DataSource;
  readonly routing: DataSource;
  readonly weather: DataSource;
  /** Live price check of the top flight results, when configured. */
  readonly flightCheck?: DataSource;
}

export interface SearchResult {
  readonly searchId: string;
  readonly createdAt: Date;
  readonly criteria: SearchCriteria;
  readonly recommendations: readonly TripRecommendation[];
  readonly totalViable: number;
  readonly excluded: readonly ExcludedDestination[];
  readonly issues: readonly ProviderIssue[];
  /** Human-readable summary of partial failures, e.g. "Flight pricing was unavailable for 3 destinations." */
  readonly notices: readonly string[];
  readonly relaxations: readonly RelaxationSuggestion[];
  readonly sources: DataSources;
  /**
   * Budget views, one trip per destination, best first (each list up to 5):
   * the cheapest trips, and the best trips that stay within the budget (price aside).
   * A destination's trip here can differ from its best-match trip (e.g. a nicer hotel).
   */
  readonly picks?: BudgetPicks;
}

export interface BudgetPicks {
  readonly cheapest: readonly TripRecommendation[];
  readonly fullBudget: readonly TripRecommendation[];
}
