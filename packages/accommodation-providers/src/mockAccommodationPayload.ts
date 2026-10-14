import { z } from 'zod';
import { money } from '@travel-where-to/shared';
import type { AccommodationOffer, ACCOMMODATION_FACILITIES } from '@travel-where-to/domain';
import { ProviderError } from '@travel-where-to/domain';

export const RawPropertySchema = z.object({
    hotel_id: z.string().min(1),
    name: z.string().min(1),
    accommodation_type: z.enum(['hotel', 'apartment']),
    class: z.number().int().min(1).max(5).nullable(),
    review_score: z.number().min(0).max(10).nullable(),
    review_count: z.number().int().min(0),
    facilities: z.array(z.string()),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    distance_to_centre_m: z.number().min(0).nullable(),
    distance_to_beach_m: z.number().min(0).nullable(),
    room_name: z.string(),
    meal_plan: z.enum(['room_only', 'breakfast_included']),
    total_price_cents: z.number().int().positive(),
    currency: z.string().length(3),
    url: z.string().url(),
});
export type RawProperty = z.infer<typeof RawPropertySchema>;

const RawResponseSchema = z.object({ result: z.array(z.unknown()) });

const FACILITY_MAP: Record<string, (typeof ACCOMMODATION_FACILITIES)[number]> = {
    outdoor_pool: 'pool',
    indoor_pool: 'pool',
    heated_pool: 'heatedPool',
    breakfast: 'breakfast',
    family_rooms: 'familyRooms',
    parking: 'parking',
};

export interface AccommodationMappingContext {
    readonly provider: string;
    readonly retrievedAt: Date;
    readonly ttlMinutes: number;
    readonly expectedCurrency: string;
}

export function mapAccommodationResponse(
    raw: unknown,
    ctx: AccommodationMappingContext,
): { items: AccommodationOffer[]; rejected: number } {
    const parsed = RawResponseSchema.safeParse(raw);
    if (!parsed.success)
        throw new ProviderError(ctx.provider, 'INVALID_RESPONSE', parsed.error.message);
    const items: AccommodationOffer[] = [];
    let rejected = 0;
    const expiresAt = new Date(ctx.retrievedAt.getTime() + ctx.ttlMinutes * 60_000);
    for (const r of parsed.data.result) {
        const p = RawPropertySchema.safeParse(r);
        if (!p.success || p.data.currency !== ctx.expectedCurrency) {
            rejected++;
            continue;
        }
        const d = p.data;
        const facilities = [
            ...new Set(d.facilities.map((f) => FACILITY_MAP[f]).filter((f) => f !== undefined)),
        ];
        items.push({
            propertyId: d.hotel_id,
            name: d.name,
            type: d.accommodation_type === 'hotel' ? 'HOTEL' : 'APARTMENT',
            ...(d.class !== null ? { stars: d.class } : {}),
            ...(d.review_score !== null ? { rating: d.review_score } : {}),
            reviewCount: d.review_count,
            facilities,
            coordinates: { lat: d.latitude, lon: d.longitude },
            ...(d.distance_to_centre_m !== null
                ? { distanceToCentreM: d.distance_to_centre_m }
                : {}),
            ...(d.distance_to_beach_m !== null ? { distanceToBeachM: d.distance_to_beach_m } : {}),
            roomDescription: d.room_name,
            breakfastIncluded: d.meal_plan === 'breakfast_included',
            price: {
                amount: money(d.total_price_cents, d.currency),
                confidence: 'VERIFIED',
                attribution: {
                    provider: ctx.provider,
                    providerOfferId: d.hotel_id,
                    retrievedAt: ctx.retrievedAt,
                    expiresAt,
                    deepLink: d.url,
                },
            },
        });
    }
    return { items, rejected };
}
