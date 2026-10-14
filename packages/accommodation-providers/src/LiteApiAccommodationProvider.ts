import { z } from 'zod';
import type { Clock } from '@travel-where-to/shared';
import { fromMajor, haversineKm, systemClock } from '@travel-where-to/shared';
import type {
    AccommodationOffer,
    AccommodationProvider,
    AccommodationSearchRequest,
} from '@travel-where-to/domain';
import { countTravellers, ProviderError } from '@travel-where-to/domain';
import {
    PromiseCache,
    providerFetchJson,
    providerStatusError,
    type FetchLike,
} from '@travel-where-to/provider-http';

const PROVIDER = 'liteapi';

const MoneySchema = z.object({ amount: z.number(), currency: z.string().length(3) });
const RateSchema = z.object({
    rateId: z.string().optional(),
    name: z.string().optional(),
    maxOccupancy: z.number().optional(),
    boardType: z.string().optional(),
    boardName: z.string().optional(),
    retailRate: z
        .object({ total: z.array(MoneySchema).optional() })
        .passthrough()
        .optional(),
    cancellationPolicies: z
        .object({ refundableTag: z.string().optional() })
        .passthrough()
        .optional(),
});
const RoomTypeSchema = z.object({
    offerId: z.string().optional(),
    rates: z.array(RateSchema).optional(),
    offerRetailRate: MoneySchema.optional(),
});
const HotelRatesSchema = z.object({ hotelId: z.string(), roomTypes: z.array(z.unknown()) });
const HotelDataSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    rating: z.number().min(0).max(10).nullable().optional(),
    reviewCount: z.number().int().nullable().optional(),
    stars: z.number().min(0).max(5).nullable().optional(),
    starRating: z.number().min(0).max(5).nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    address: z.string().nullable().optional(),
    main_photo: z.string().nullable().optional(),
});
const ResponseSchema = z.object({
    data: z.array(z.unknown()).nullable().optional(),
    hotels: z.array(z.unknown()).nullable().optional(),
    error: z.unknown().optional(),
});

export interface LiteApiOptions {
    readonly apiKey: string;
    readonly baseUrl?: string;
    /** Guest nationality sent to LiteAPI (affects rates). */
    readonly guestNationality?: string;
    /** Search radius around the city centre, metres. */
    readonly radiusM?: number;
    readonly limit?: number;
    readonly fetch?: FetchLike;
    readonly clock?: Clock;
    readonly timeoutMs?: number;
    readonly priceTtlMinutes?: number;
}

/**
 * Hotel rates from LiteAPI (Nuitée): `POST /v3.0/hotels/rates` around the destination's
 * centre, with the real occupancy (children ages), cheapest rate per hotel, hotel data
 * included. Prices are live → VERIFIED with an expiry.
 * Known gaps, never filled in: facilities (pools) are not in the rates response; there
 * is no public booking page (the UI offers a search link elsewhere); every property is
 * treated as a hotel.
 */
export class LiteApiAccommodationProvider implements AccommodationProvider {
    readonly name = PROVIDER;
    private readonly clock: Clock;
    private readonly cache: PromiseCache<AccommodationOffer[]>;

    constructor(private readonly options: LiteApiOptions) {
        if (!options.apiKey)
            throw new Error('LITEAPI_KEY is required for the LiteAPI accommodation provider');
        this.clock = options.clock ?? systemClock;
        this.cache = new PromiseCache(10 * 60_000, () => this.clock.now().getTime());
    }

    search(req: AccommodationSearchRequest): Promise<AccommodationOffer[]> {
        if (!req.types.includes('HOTEL')) return Promise.resolve([]);
        const c = countTravellers(req.travellers);
        const key = `${req.locationId}:${req.checkIn}:${req.checkOut}:${c.adults}:${[...c.childAges, ...c.infantAges].join(',')}:${req.currency}:${req.wantedPropertyNames?.length ?? 0}`;
        return this.cache.get(key, () => this.fetchRates(req));
    }

    private async fetchRates(req: AccommodationSearchRequest): Promise<AccommodationOffer[]> {
        const c = countTravellers(req.travellers);
        const body = {
            checkin: req.checkIn,
            checkout: req.checkOut,
            currency: req.currency,
            guestNationality: this.options.guestNationality ?? 'PT',
            // One room for the whole party; real ages for children and babies.
            occupancies: [{ adults: c.adults, children: [...c.childAges, ...c.infantAges] }],
            latitude: req.centre.lat,
            longitude: req.centre.lon,
            radius: this.options.radiusM ?? 6000,
            // Looking for specific hotels (e.g. Disney Hotels): take the whole area, the engine filters by name.
            limit: req.wantedPropertyNames?.length ? 200 : (this.options.limit ?? 40),
            maxRatesPerHotel: 1,
            includeHotelData: true,
            timeout: 8,
        };
        const { status, body: res } = await providerFetchJson(
            `${this.options.baseUrl ?? 'https://api.liteapi.travel/v3.0'}/hotels/rates`,
            {
                method: 'POST',
                headers: {
                    'X-API-Key': this.options.apiKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
            },
            {
                provider: PROVIDER,
                timeoutMs: this.options.timeoutMs ?? 20_000,
                ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
            },
        );
        if (status !== 200) throw providerStatusError(PROVIDER, status, JSON.stringify(res ?? ''));
        const parsed = ResponseSchema.safeParse(res);
        if (!parsed.success)
            throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);

        const hotelInfo = new Map<string, z.infer<typeof HotelDataSchema>>();
        for (const h of parsed.data.hotels ?? []) {
            const p = HotelDataSchema.safeParse(h);
            if (p.success) hotelInfo.set(p.data.id, p.data);
        }
        const now = this.clock.now();
        const expiresAt = new Date(now.getTime() + (this.options.priceTtlMinutes ?? 30) * 60_000);
        const offers: AccommodationOffer[] = [];
        for (const raw of parsed.data.data ?? []) {
            const h = HotelRatesSchema.safeParse(raw);
            if (!h.success) continue;
            const info = hotelInfo.get(h.data.hotelId);
            if (!info) continue; // no name/location → can't show it honestly
            // Cheapest bookable room for the party.
            let best:
                | {
                      amount: number;
                      currency: string;
                      rate: z.infer<typeof RateSchema> | undefined;
                      offerId: string;
                  }
                | undefined;
            for (const rt of h.data.roomTypes) {
                const r = RoomTypeSchema.safeParse(rt);
                if (!r.success) continue;
                const rate = r.data.rates?.[0];
                const total = r.data.offerRetailRate ?? rate?.retailRate?.total?.[0];
                if (!total || total.amount <= 0 || total.currency !== req.currency) continue;
                if (!best || total.amount < best.amount)
                    best = {
                        amount: total.amount,
                        currency: total.currency,
                        rate,
                        offerId: r.data.offerId ?? h.data.hotelId,
                    };
            }
            if (!best) continue;
            const lat = info.latitude ?? undefined;
            const lon = info.longitude ?? undefined;
            const coords = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
            const board = (best.rate?.boardType ?? '').toUpperCase();
            const breakfast =
                ['BB', 'BI', 'HB', 'FB', 'AI'].includes(board) ||
                /breakfast/i.test(best.rate?.boardName ?? '');
            const stars = info.stars ?? info.starRating ?? undefined;
            offers.push({
                propertyId: `liteapi:${h.data.hotelId}`,
                name: info.name,
                type: 'HOTEL',
                ...(stars ? { stars: Math.round(stars) } : {}),
                ...(info.rating ? { rating: Math.round(info.rating * 10) / 10 } : {}),
                ...(info.reviewCount ? { reviewCount: info.reviewCount } : {}),
                facilities: breakfast ? ['breakfast'] : [],
                coordinates: coords ?? req.centre,
                // Straight-line distances from the provider's coordinates.
                ...(coords
                    ? { distanceToCentreM: Math.round(haversineKm(coords, req.centre) * 1000) }
                    : {}),
                ...(coords && req.beach
                    ? { distanceToBeachM: Math.round(haversineKm(coords, req.beach) * 1000) }
                    : {}),
                roomDescription:
                    [best.rate?.name, best.rate?.boardName].filter(Boolean).join(' · ') || 'Room',
                breakfastIncluded: breakfast,
                price: {
                    amount: fromMajor(best.amount, best.currency),
                    confidence: 'VERIFIED',
                    attribution: {
                        provider: PROVIDER,
                        providerOfferId: best.offerId,
                        retrievedAt: now,
                        expiresAt,
                    },
                },
            });
        }
        return offers;
    }
}
