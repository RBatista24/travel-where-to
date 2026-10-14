import type { Clock, FailureInjector } from '@travel-where-to/shared';
import {
    between,
    daysBetween,
    haversineKm,
    monthOf,
    seededRng,
    SEASON_FACTOR,
    sleep,
    systemClock,
} from '@travel-where-to/shared';
import type {
    AccommodationOffer,
    AccommodationProvider,
    AccommodationSearchRequest,
} from '@travel-where-to/domain';
import { countTravellers, ProviderError } from '@travel-where-to/domain';
import { mapAccommodationResponse, type RawProperty } from './mockAccommodationPayload';

export interface MockAccommodationProviderOptions {
    readonly clock?: Clock;
    readonly failures?: FailureInjector;
    readonly latencyMs?: number;
    readonly priceTtlMinutes?: number;
}

const NAME_A = [
    'Hotel',
    'Casa',
    'Residence',
    'Suites',
    'Villa',
    'Apartamentos',
    'Boutique Hotel',
    'Resort',
];
const NAME_B = [
    'Sol',
    'Mar',
    'Jardim',
    'Centro',
    'Oliva',
    'Azul',
    'Plaza',
    'Luna',
    'Brisa',
    'Palmera',
    'Horizonte',
    'Aurora',
];

type Rng = ReturnType<typeof seededRng>;

interface StayShape {
    readonly nights: number;
    readonly guests: number;
    readonly occupancy: number;
    readonly season: number;
}

/** Draws in a fixed order: the mock output is seeded, so changing the order changes the data. */
function poolFacility(r: Rng): string {
    if (r() < 0.35) return 'heated_pool';
    return r() < 0.5 ? 'indoor_pool' : 'outdoor_pool';
}

function facilitiesFor(
    r: Rng,
    isHotel: boolean,
    hasBeach: boolean,
): { facilities: string[]; pool: boolean } {
    const facilities: string[] = [];
    const pool = r() < (hasBeach ? 0.6 : 0.4);
    if (pool) facilities.push(poolFacility(r));
    if (isHotel && r() < 0.6) facilities.push('breakfast');
    if (r() < 0.45) facilities.push('family_rooms');
    if (r() < 0.5) facilities.push('parking');
    return { facilities, pool };
}

function ratingFor(r: Rng): number | null {
    if (r() < 0.05) return null;
    return Math.round(between(r, 6.4, 9.6) * 10) / 10;
}

function beachMetresFor(req: AccommodationSearchRequest, lat: number, lon: number, r: Rng) {
    if (!req.beach) return null;
    return Math.round(haversineKm({ lat, lon }, req.beach) * 1000 * between(r, 0.5, 1)) + 40;
}

function basePerNight(isHotel: boolean, stars: number | null, rating: number | null, r: Rng) {
    if (!isHotel) return between(r, 55, 125);
    return 40 + (stars ?? 3) * 24 + ((rating ?? 7) - 7) * 12;
}

function nightlyRate(args: {
    readonly id: string;
    readonly checkIn: string;
    readonly base: number;
    readonly stay: StayShape;
    readonly breakfastIncluded: boolean;
    readonly pool: boolean;
}): number {
    const priceRng = seededRng(`rate:${args.id}:${args.checkIn}`);
    return (
        args.base *
        args.stay.season *
        args.stay.occupancy *
        between(priceRng, 0.88, 1.15) *
        (args.breakfastIncluded ? 1.12 : 1) *
        (args.pool ? 1.08 : 1)
    );
}

function nameFor(r: Rng): string {
    return `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`;
}

function reviewCountFor(r: Rng, rating: number | null): number {
    if (rating === null) return 0;
    return Math.floor(between(r, 40, 2400));
}

function roomNameFor(guests: number, isHotel: boolean): string {
    if (guests > 2) return 'Family room';
    return isHotel ? 'Double room' : 'One-bedroom apartment';
}

/** The i-th property for a request, or undefined when it is not offered for these dates and types. */
function propertyAt(
    req: AccommodationSearchRequest,
    i: number,
    stay: StayShape,
): RawProperty | undefined {
    const id = `${req.locationId}-p${i}`;
    const r = seededRng(`prop:${id}`);
    const isHotel = r() < 0.7;
    if (!req.types.includes(isHotel ? 'HOTEL' : 'APARTMENT')) return undefined;
    // Availability depends on dates.
    const avail = seededRng(`avail:${id}:${req.checkIn}:${req.checkOut}:${stay.guests}`);
    if (avail() < 0.12) return undefined;

    const stars = isHotel ? 2 + Math.floor(r() * 4) : null;
    const rating = ratingFor(r);
    const centreM = Math.round(80 + r() ** 1.8 * 6000);
    const angle = r() * Math.PI * 2;
    const lat = req.centre.lat + (Math.cos(angle) * centreM) / 111_000;
    const lon =
        req.centre.lon +
        (Math.sin(angle) * centreM) / (111_000 * Math.cos((req.centre.lat * Math.PI) / 180));
    const beachM = beachMetresFor(req, lat, lon, r);
    const { facilities, pool } = facilitiesFor(r, isHotel, Boolean(req.beach));
    const breakfastIncluded = facilities.includes('breakfast') && r() < 0.5;
    const perNight = nightlyRate({
        id,
        checkIn: req.checkIn,
        base: basePerNight(isHotel, stars, rating, r),
        stay,
        breakfastIncluded,
        pool,
    });

    return {
        hotel_id: id,
        name: nameFor(r),
        accommodation_type: isHotel ? 'hotel' : 'apartment',
        class: stars,
        review_score: rating,
        review_count: reviewCountFor(r, rating),
        facilities,
        latitude: lat,
        longitude: lon,
        distance_to_centre_m: centreM,
        distance_to_beach_m: beachM,
        room_name: roomNameFor(stay.guests, isHotel),
        meal_plan: breakfastIncluded ? 'breakfast_included' : 'room_only',
        total_price_cents: Math.round(perNight * stay.nights) * 100,
        currency: req.currency,
        url: `https://mock-stays.invalid/property/${id}?checkin=${req.checkIn}&checkout=${req.checkOut}`,
    };
}

/** Deterministic fake accommodation provider. Properties are stable per location; prices vary by date and party. */
export class MockAccommodationProvider implements AccommodationProvider {
    readonly name = 'mock-accommodation';
    private readonly clock: Clock;

    constructor(private readonly options: MockAccommodationProviderOptions = {}) {
        this.clock = options.clock ?? systemClock;
    }

    async search(request: AccommodationSearchRequest): Promise<AccommodationOffer[]> {
        if (this.options.latencyMs) await sleep(this.options.latencyMs);
        const failure = this.options.failures?.('search', request.locationId);
        if (failure) throw new ProviderError(this.name, failure, `Simulated ${failure}`);
        const raw = { result: this.generate(request) };
        return mapAccommodationResponse(raw, {
            provider: this.name,
            retrievedAt: this.clock.now(),
            ttlMinutes: this.options.priceTtlMinutes ?? 60,
            expectedCurrency: request.currency,
        }).items;
    }

    private generate(req: AccommodationSearchRequest): RawProperty[] {
        const nights = daysBetween(req.checkIn, req.checkOut);
        const counts = countTravellers(req.travellers);
        const guests = counts.adults + counts.children;
        // Older children count as an extra guest more than young ones.
        const occupancy =
            1 +
            Math.max(0, guests - 2) * 0.22 +
            counts.childAges.filter((a) => a >= 12).length * 0.05;
        const season = SEASON_FACTOR[monthOf(req.checkIn) - 1] ?? 1;
        const stay: StayShape = { nights, guests, occupancy, season };
        const locRng = seededRng(`props:${req.locationId}`);
        const count = 8 + Math.floor(locRng() * 5);
        const out: RawProperty[] = [];
        for (let i = 0; i < count; i++) {
            const property = propertyAt(req, i, stay);
            if (property) out.push(property);
        }
        return out;
    }
}
