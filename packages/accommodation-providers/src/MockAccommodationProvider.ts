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
        const occupancyFactor =
            1 +
            Math.max(0, guests - 2) * 0.22 +
            counts.childAges.filter((a) => a >= 12).length * 0.05;
        const season = SEASON_FACTOR[monthOf(req.checkIn) - 1] ?? 1;
        const locRng = seededRng(`props:${req.locationId}`);
        const count = 8 + Math.floor(locRng() * 5);
        const out: RawProperty[] = [];
        for (let i = 0; i < count; i++) {
            const id = `${req.locationId}-p${i}`;
            const r = seededRng(`prop:${id}`);
            const isHotel = r() < 0.7;
            const type = isHotel ? 'hotel' : 'apartment';
            if (!req.types.includes(isHotel ? 'HOTEL' : 'APARTMENT')) continue;
            // Availability depends on dates.
            const avail = seededRng(`avail:${id}:${req.checkIn}:${req.checkOut}:${guests}`);
            if (avail() < 0.12) continue;
            const stars = isHotel ? 2 + Math.floor(r() * 4) : null;
            const rating = r() < 0.05 ? null : Math.round(between(r, 6.4, 9.6) * 10) / 10;
            const centreM = Math.round(80 + r() ** 1.8 * 6000);
            const angle = r() * Math.PI * 2;
            const lat = req.centre.lat + (Math.cos(angle) * centreM) / 111_000;
            const lon =
                req.centre.lon +
                (Math.sin(angle) * centreM) /
                    (111_000 * Math.cos((req.centre.lat * Math.PI) / 180));
            const beachM = req.beach
                ? Math.round(haversineKm({ lat, lon }, req.beach) * 1000 * between(r, 0.5, 1)) + 40
                : null;
            const facilities: string[] = [];
            const pool = r() < (req.beach ? 0.6 : 0.4);
            if (pool)
                facilities.push(
                    r() < 0.35 ? 'heated_pool' : r() < 0.5 ? 'indoor_pool' : 'outdoor_pool',
                );
            if (isHotel && r() < 0.6) facilities.push('breakfast');
            if (r() < 0.45) facilities.push('family_rooms');
            if (r() < 0.5) facilities.push('parking');
            const breakfastIncluded = facilities.includes('breakfast') && r() < 0.5;
            const basePerNight = isHotel
                ? 40 + (stars ?? 3) * 24 + ((rating ?? 7) - 7) * 12
                : between(r, 55, 125);
            const priceRng = seededRng(`rate:${id}:${req.checkIn}`);
            const perNight =
                basePerNight *
                season *
                occupancyFactor *
                between(priceRng, 0.88, 1.15) *
                (breakfastIncluded ? 1.12 : 1) *
                (pool ? 1.08 : 1);
            out.push({
                hotel_id: id,
                name: `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`,
                accommodation_type: type,
                class: stars,
                review_score: rating,
                review_count: rating === null ? 0 : Math.floor(between(r, 40, 2400)),
                facilities,
                latitude: lat,
                longitude: lon,
                distance_to_centre_m: centreM,
                distance_to_beach_m: beachM,
                room_name:
                    guests > 2 ? 'Family room' : isHotel ? 'Double room' : 'One-bedroom apartment',
                meal_plan: breakfastIncluded ? 'breakfast_included' : 'room_only',
                total_price_cents: Math.round(perNight * nights) * 100,
                currency: req.currency,
                url: `https://mock-stays.invalid/property/${id}?checkin=${req.checkIn}&checkout=${req.checkOut}`,
            });
        }
        return out;
    }
}
