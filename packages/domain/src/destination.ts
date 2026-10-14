import type { Coordinates, Money } from '@travel-where-to/shared';

export const DESTINATION_CATEGORIES = [
    'beach',
    'city',
    'nature',
    'family',
    'romantic',
    'culture',
    'gastronomy',
    'snow',
    'themePark',
    'tropical',
] as const;
export type DestinationCategory = (typeof DESTINATION_CATEGORIES)[number];

/** Attributes scored 0–100 in the curated catalogue. `nightlife` exists so users can AVOID it. */
export const DESTINATION_ATTRIBUTES = [...DESTINATION_CATEGORIES, 'nightlife'] as const;
export type DestinationAttribute = (typeof DESTINATION_ATTRIBUTES)[number];

export interface Airport {
    readonly iata: string;
    readonly name: string;
    readonly countryCode: string;
    readonly coordinates: Coordinates;
}

export interface ClimateMetadata {
    /** 12 entries, January first. Long-term averages. */
    readonly avgHighC: readonly number[];
    readonly avgLowC: readonly number[];
    readonly rainyDays: readonly number[];
    readonly seaTempC?: readonly number[];
}

/** Published ticket prices for a theme park (dynamic pricing → a range per ticket length). */
export interface ParkTicketPricing {
    readonly officialUrl: string;
    readonly currency: string;
    /** Adult ticket price range (min, max) for the whole ticket, by number of days. */
    readonly adultRangeByDays: Readonly<Record<number, readonly [number, number]>>;
    /** What each ticket length includes, e.g. "1 park" / "2 parks". */
    readonly accessByDays: Readonly<Record<number, string>>;
    /** Children below this age go free. */
    readonly freeUnderAge: number;
    /** Children up to this age have a child ticket (priced like adults here: no published child prices). */
    readonly childMaxAge: number;
    readonly source: string;
    readonly checkedOn: string;
}

export interface OfficialParkHotel {
    readonly name: string;
    /** Lower-case fragments that identify the hotel in provider names. */
    readonly match: readonly string[];
    readonly atParkEntrance?: boolean;
}

/** A theme-park destination: its official on-site hotels and ticket prices. */
export interface ThemePark {
    readonly name: string;
    readonly officialHotels: readonly OfficialParkHotel[];
    readonly tickets: ParkTicketPricing;
}

/** Where in the world, for the "Surprise me" region filter. Canaries, Madeira and Azores count as Europe. */
export const REGIONS = [
    'EUROPE',
    'AFRICA',
    'AMERICAS',
    'MIDDLE_EAST',
    'ASIA_PACIFIC',
    'INDIAN_OCEAN',
] as const;
export type Region = (typeof REGIONS)[number];

export interface Destination {
    readonly id: string;
    readonly name: string;
    readonly country: string;
    readonly countryCode: string;
    readonly region: Region;
    readonly coordinates: Coordinates;
    /** Reference points used for "within X m of centre/beach". */
    readonly cityCentre: Coordinates;
    readonly beach?: Coordinates;
    readonly airports: readonly Airport[];
    /** False for islands / destinations unreachable by car from the origin market. */
    readonly reachableByCar: boolean;
    readonly scores: Readonly<Record<DestinationAttribute, number>>;
    readonly climate: ClimateMetadata;
    /** Cost-of-living reference used for ESTIMATED food costs. */
    readonly dailyFoodCostPerAdult: Money;
    /** Present for theme-park destinations (e.g. Disneyland Paris). */
    readonly park?: ThemePark;
}

/** Normalises a hotel name for matching: lower case, no accents, no apostrophes. */
export function normaliseName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’'`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** The official park hotel a provider's property name refers to, if any. */
export function officialParkHotel(
    park: ThemePark,
    propertyName: string,
): OfficialParkHotel | undefined {
    const n = normaliseName(propertyName);
    return park.officialHotels.find((h) => h.match.some((m) => n.includes(normaliseName(m))));
}

/** A destination attribute counts as "present" at or above this score. */
export const ATTRIBUTE_PRESENT_THRESHOLD = 60;
