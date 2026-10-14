import type {
    AccommodationFacility,
    DestinationAttribute,
    PriceConfidence,
    RequirementPriority,
} from './types';

export const ATTRIBUTE_LABEL: Record<DestinationAttribute, string> = {
    beach: 'Beach',
    city: 'City',
    nature: 'Nature',
    family: 'Family-friendly',
    romantic: 'Romantic',
    culture: 'Culture',
    gastronomy: 'Food & restaurants',
    snow: 'Snow',
    themePark: 'Theme parks',
    tropical: 'Tropical',
    nightlife: 'Nightlife',
};

export const FACILITY_LABEL: Record<AccommodationFacility, string> = {
    pool: 'Swimming pool',
    heatedPool: 'Heated pool',
    breakfast: 'Breakfast',
    familyRooms: 'Family rooms',
    parking: 'Parking',
};

export const PRIORITY_LABEL: Record<RequirementPriority, string> = {
    MUST_HAVE: 'Must have',
    IMPORTANT: 'Important',
    PREFERRED: 'Nice to have',
    AVOID: 'Avoid',
};

export const PRIORITY_HINT: Record<RequirementPriority, string> = {
    MUST_HAVE: 'Places without it are left out',
    IMPORTANT: 'Weighs heavily in the score',
    PREFERRED: 'Helps the score a little',
    AVOID: 'Lowers the score where present',
};

export type InfoKind = PriceConfidence | 'AI';

export const INFO_KIND: Record<InfoKind, { label: string; explanation: string }> = {
    VERIFIED: {
        label: 'Verified',
        explanation:
            'Price checked with the provider moments ago. It can still change before you book.',
    },
    INDICATIVE: {
        label: 'Indicative',
        explanation: 'A provider estimate that may not be bookable at this price.',
    },
    ESTIMATED: {
        label: 'Our estimate',
        explanation: 'Calculated by us, for example fuel, parking or food. Not a quote.',
    },
    AI: {
        label: 'AI interpretation',
        explanation:
            'What we understood from your words. Check it and edit anything that is wrong.',
    },
};

/** Human names for data providers. */
export const PROVIDER_LABEL: Record<string, string> = {
    travelpayouts: 'Aviasales (via Travelpayouts)',
    openrouteservice: 'openrouteservice',
    'open-meteo': 'Open-Meteo',
    liteapi: 'LiteAPI',
    'serpapi-google-flights': 'Google Flights (via SerpApi)',
    'serpapi-google-hotels': 'Google Hotels (via SerpApi)',
    'mock-flights': 'mock flights',
    'mock-accommodation': 'mock stays',
    'mock-routing': 'mock routes',
    'mock-weather': 'mock weather',
};

export const providerLabel = (name: string): string => PROVIDER_LABEL[name] ?? name;

/** Where users book an offer from a given provider. */
export const BOOKING_SITE: Record<string, string> = {
    travelpayouts: 'Aviasales',
    'serpapi-google-flights': 'Google Flights',
    'serpapi-google-hotels': 'the hotel site',
};
