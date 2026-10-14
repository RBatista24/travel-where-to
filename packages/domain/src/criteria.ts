import type { Coordinates, LocalDate, Money } from '@travel-where-to/shared';
import { daysBetween, enumeratePatternStays, isValidLocalDate } from '@travel-where-to/shared';
import type { Traveller } from './travellers';
import { validateTravellers } from './travellers';
import type { Requirement } from './requirements';
import type { Region } from './destination';

export interface Origin {
  readonly label: string;
  readonly coordinates: Coordinates;
  readonly countryCode: string;
}

/** 0 = Sunday … 6 = Saturday (same as `dayOfWeek`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Flexible windows only: travel on given days of the week, e.g. Thursday → Sunday.
 * Each stay leaves on a `departOn` day and comes back on the next `returnOn` day (1–7 nights),
 * so the number of nights follows from the pattern.
 */
export interface WeekdayPattern {
  readonly departOn: readonly Weekday[];
  readonly returnOn: readonly Weekday[];
}

export type DateSelection =
  | { readonly kind: 'EXACT'; readonly checkIn: LocalDate; readonly checkOut: LocalDate }
  | {
      readonly kind: 'FLEXIBLE';
      readonly windowStart: LocalDate;
      readonly windowEnd: LocalDate;
      /** Exact trip length. With `weekdays` it is ignored for choosing dates (the pattern decides). */
      readonly nights: number;
      readonly weekdays?: WeekdayPattern;
    };

export const TransportMode = { FLIGHT: 'FLIGHT', CAR: 'CAR' } as const;
export type TransportMode = (typeof TransportMode)[keyof typeof TransportMode];

export type FuelType = 'PETROL' | 'DIESEL' | 'LPG' | 'ELECTRIC';

export interface Vehicle {
  readonly fuelType: FuelType;
  /** Litres (or kWh for ELECTRIC) per 100 km. */
  readonly consumptionPer100Km: number;
  /** Price per litre (or kWh). */
  readonly fuelPrice: Money;
}

export interface DrivingConstraints {
  /** Hard limit: car options above this are excluded. */
  readonly maxHours?: number;
  /** Soft preference: car options above this score lower. */
  readonly preferredMaxHours?: number;
}

/**
 * Departure time of day, local time at the departure airport:
 * night 00:00–04:59, morning 05:00–11:59, afternoon 12:00–17:59, evening 18:00–23:59.
 */
export const TimeOfDay = { NIGHT: 'NIGHT', MORNING: 'MORNING', AFTERNOON: 'AFTERNOON', EVENING: 'EVENING' } as const;
export type TimeOfDay = (typeof TimeOfDay)[keyof typeof TimeOfDay];
/** [first hour, last hour] inclusive. */
export const TIME_OF_DAY_HOURS: Record<TimeOfDay, readonly [number, number]> = {
  NIGHT: [0, 4],
  MORNING: [5, 11],
  AFTERNOON: [12, 17],
  EVENING: [18, 23],
};

/** Hard flight filters. Empty time lists mean "any time". */
export interface FlightPreferences {
  readonly directOnly?: boolean;
  readonly outboundTimes?: readonly TimeOfDay[];
  readonly returnTimes?: readonly TimeOfDay[];
}

export function timeOfDayOf(hour: number): TimeOfDay {
  const hit = (Object.keys(TIME_OF_DAY_HOURS) as TimeOfDay[]).find((k) => hour >= TIME_OF_DAY_HOURS[k][0] && hour <= TIME_OF_DAY_HOURS[k][1]);
  return hit ?? 'NIGHT';
}

export function hasFlightPreferences(p: FlightPreferences | undefined): p is FlightPreferences {
  return !!p && (p.directOnly === true || (p.outboundTimes?.length ?? 0) > 0 || (p.returnTimes?.length ?? 0) > 0);
}

export interface TransportCriteria {
  readonly modes: readonly TransportMode[];
  readonly flights?: FlightPreferences;
  readonly driving?: DrivingConstraints;
  readonly vehicle?: Vehicle;
  /** Restrict departure airports (IATA). Defaults to all relevant airports in the origin country. */
  readonly departureAirports?: readonly string[];
}

export const AccommodationType = { HOTEL: 'HOTEL', APARTMENT: 'APARTMENT' } as const;
export type AccommodationType = (typeof AccommodationType)[keyof typeof AccommodationType];

/** Structured accommodation filters. These are hard filters. Facility wishes go in `requirements`. */
export interface AccommodationCriteria {
  readonly types: readonly AccommodationType[];
  readonly minStars?: number;
  /** 0–10 scale. */
  readonly minRating?: number;
  readonly maxDistanceToCentreM?: number;
  readonly maxDistanceToBeachM?: number;
  /** Theme-park destinations: only the park's official hotels (e.g. Disney Hotels). Ignored elsewhere. */
  readonly parkHotelsOnly?: boolean;
}

/** Entrance tickets for theme-park destinations. Included by default. */
export interface ParkTicketCriteria {
  readonly include?: boolean;
  /** Days in the park. Default: number of nights, at most the longest ticket sold. */
  readonly days?: number;
}

export interface WeatherCriteria {
  /** Average daily high the user wants at minimum. Soft: affects ranking only. */
  readonly minAvgHighC?: number;
  readonly preferWarm?: boolean;
}

export type DestinationSelection =
  /** `regions`: only places in these parts of the world (absent/empty = anywhere). */
  | { readonly kind: 'DISCOVER'; readonly regions?: readonly Region[] }
  | { readonly kind: 'KNOWN'; readonly destinationIds: readonly string[] };

export interface SearchCriteria {
  readonly origin: Origin;
  readonly dates: DateSelection;
  readonly travellers: readonly Traveller[];
  /** Global trip budget: transport + accommodation + known extras. Food is excluded in V1. */
  readonly budget: Money;
  readonly transport: TransportCriteria;
  readonly destination: DestinationSelection;
  readonly requirements: readonly Requirement[];
  readonly accommodation: AccommodationCriteria;
  readonly weather?: WeatherCriteria;
  readonly parkTickets?: ParkTicketCriteria;
}

export function nightsOf(dates: DateSelection): number {
  return dates.kind === 'EXACT' ? daysBetween(dates.checkIn, dates.checkOut) : dates.nights;
}

export function validateCriteria(criteria: SearchCriteria, today: LocalDate): string[] {
  const errors: string[] = [...validateTravellers(criteria.travellers)];
  const d = criteria.dates;
  if (d.kind === 'EXACT') {
    if (!isValidLocalDate(d.checkIn) || !isValidLocalDate(d.checkOut)) errors.push('Invalid dates.');
    else {
      if (daysBetween(d.checkIn, d.checkOut) < 1) errors.push('Check-out must be after check-in.');
      if (daysBetween(today, d.checkIn) < 0) errors.push('Check-in cannot be in the past.');
    }
  } else {
    if (!isValidLocalDate(d.windowStart) || !isValidLocalDate(d.windowEnd)) errors.push('Invalid date window.');
    else {
      if (d.weekdays) {
        const ok = (xs: readonly number[]) => xs.length > 0 && xs.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);
        if (!ok(d.weekdays.departOn) || !ok(d.weekdays.returnOn)) errors.push('Pick at least one departure day and one return day.');
        else if (daysBetween(d.windowStart, d.windowEnd) >= 0 && enumeratePatternStays(d.windowStart, d.windowEnd, d.weekdays.departOn, d.weekdays.returnOn).length === 0)
          errors.push('No trips with those days of the week fit inside the date window.');
      } else if (!Number.isInteger(d.nights) || d.nights < 1) errors.push('Nights must be a whole number ≥ 1.');
      else if (daysBetween(d.windowStart, d.windowEnd) < d.nights)
        errors.push('The date window is shorter than the number of nights.');
      if (daysBetween(today, d.windowStart) < 0) errors.push('The date window cannot start in the past.');
    }
  }
  if (criteria.budget.amountMinor <= 0) errors.push('Budget must be greater than zero.');
  if (criteria.transport.modes.length === 0) errors.push('Select at least one transport mode.');
  const drv = criteria.transport.driving;
  if (drv?.maxHours !== undefined && drv.maxHours <= 0) errors.push('Maximum driving hours must be positive.');
  if (criteria.transport.vehicle) {
    const v = criteria.transport.vehicle;
    if (v.consumptionPer100Km <= 0) errors.push('Vehicle consumption must be positive.');
    if (v.fuelPrice.currency !== criteria.budget.currency) errors.push('Fuel price and budget must use the same currency.');
  }
  const fp = criteria.transport.flights;
  const validTimes = (xs: readonly string[] | undefined) => (xs ?? []).every((x) => x in TIME_OF_DAY_HOURS);
  if (fp && (!validTimes(fp.outboundTimes) || !validTimes(fp.returnTimes))) errors.push('Unknown flight time of day.');
  const pd = criteria.parkTickets?.days;
  if (pd !== undefined && (!Number.isInteger(pd) || pd < 1 || pd > 7)) errors.push('Park days must be between 1 and 7.');
  if (criteria.accommodation.types.length === 0) errors.push('Select at least one accommodation type.');
  if (criteria.destination.kind === 'KNOWN' && criteria.destination.destinationIds.length === 0)
    errors.push('Select at least one destination.');
  return errors;
}
