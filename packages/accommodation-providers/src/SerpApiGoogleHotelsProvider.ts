import { z } from 'zod';
import type { Clock } from '@travel-where-to/shared';
import { fromMajor, haversineKm, systemClock } from '@travel-where-to/shared';
import type { AccommodationFacility, AccommodationOffer, AccommodationProvider, AccommodationSearchRequest } from '@travel-where-to/domain';
import { countTravellers, PromiseCache, ProviderError, providerFetchJson, providerStatusError, type FetchLike } from '@travel-where-to/domain';

const PROVIDER = 'serpapi-google-hotels';

const PropertySchema = z.object({
  type: z.string().optional(),
  name: z.string().min(1),
  link: z.string().url().optional(),
  property_token: z.string().optional(),
  gps_coordinates: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  total_rate: z.object({ extracted_lowest: z.number().positive().optional() }).passthrough().optional(),
  rate_per_night: z.object({ extracted_lowest: z.number().positive().optional() }).passthrough().optional(),
  extracted_hotel_class: z.number().min(1).max(5).optional(),
  overall_rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().optional(),
  amenities: z.array(z.string()).optional(),
});
const ResponseSchema = z.object({
  search_metadata: z.object({ google_hotels_url: z.string().optional() }).passthrough().optional(),
  properties: z.array(z.unknown()).optional(),
  error: z.string().optional(),
});

export interface SerpApiHotelsOptions {
  readonly apiKey: string;
  readonly gl?: string;
  readonly hl?: string;
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly clock?: Clock;
  readonly timeoutMs?: number;
}

/** Google Hotels amenity text → our facilities. Only clear matches; heated pools are rarely listed. */
export function mapAmenities(amenities: readonly string[]): AccommodationFacility[] {
  const out = new Set<AccommodationFacility>();
  for (const a of amenities.map((x) => x.toLowerCase())) {
    if (/heated (swimming )?pool/.test(a)) out.add('heatedPool');
    else if (/\bpool\b/.test(a) && !/pool table/.test(a)) out.add('pool');
    if (/breakfast/.test(a)) out.add('breakfast');
    if (/parking/.test(a)) out.add('parking');
    if (/kid|family|child-friendly/.test(a)) out.add('familyRooms');
  }
  return [...out];
}

/**
 * Hotels from Google Hotels through SerpApi: real current prices from many sites.
 * One call per destination and dates — expensive on the free plan (250 searches/month),
 * so prefer LiteAPI as the main stays provider and keep this for small searches.
 * Google ratings are 1–5; they are doubled to fit our 0–10 scale.
 */
export class SerpApiGoogleHotelsProvider implements AccommodationProvider {
  readonly name = PROVIDER;
  private readonly clock: Clock;
  private readonly cache: PromiseCache<AccommodationOffer[]>;

  constructor(private readonly options: SerpApiHotelsOptions) {
    if (!options.apiKey) throw new Error('SERPAPI_KEY is required for SerpApi');
    this.clock = options.clock ?? systemClock;
    this.cache = new PromiseCache(30 * 60_000, () => this.clock.now().getTime());
  }

  search(req: AccommodationSearchRequest): Promise<AccommodationOffer[]> {
    const c = countTravellers(req.travellers);
    const rentals = !req.types.includes('HOTEL');
    const key = `${req.locationId}:${req.checkIn}:${req.checkOut}:${c.adults}:${c.childAges.join(',')}:${rentals}:${req.currency}:${req.wantedPropertyNames?.length ?? 0}`;
    return this.cache.get(key, async () => {
      const qs = new URLSearchParams({
        engine: 'google_hotels',
        // For specific properties (a park's official hotels), search the hotels at that place.
        q: req.wantedPropertyNames?.length ? `hotels at ${req.locationName ?? req.locationId}` : (req.locationName ?? req.locationId),
        check_in_date: req.checkIn,
        check_out_date: req.checkOut,
        adults: String(c.adults),
        currency: req.currency,
        gl: this.options.gl ?? 'pt',
        hl: this.options.hl ?? 'en',
        api_key: this.options.apiKey,
        ...(c.children + c.infants > 0 ? { children: String(c.children + c.infants), children_ages: [...c.childAges, ...c.infantAges.map((a) => Math.max(1, a))].join(',') } : {}),
        ...(rentals ? { vacation_rentals: 'true' } : {}),
      });
      const { status, body } = await providerFetchJson(`${this.options.baseUrl ?? 'https://serpapi.com'}/search.json?${qs.toString()}`, {}, {
        provider: PROVIDER,
        timeoutMs: this.options.timeoutMs ?? 30_000,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      });
      const parsed = ResponseSchema.safeParse(body);
      if (status !== 200) throw providerStatusError(PROVIDER, status, parsed.success ? (parsed.data.error ?? '') : '');
      if (!parsed.success) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);
      if (parsed.data.error) {
        if (/hasn't returned any results|no results/i.test(parsed.data.error)) return [];
        throw new ProviderError(PROVIDER, /run out of searches|limit/i.test(parsed.data.error) ? 'RATE_LIMITED' : 'UNAVAILABLE', parsed.data.error);
      }
      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + 60 * 60_000);
      const offers: AccommodationOffer[] = [];
      for (const raw of parsed.data.properties ?? []) {
        const p = PropertySchema.safeParse(raw);
        if (!p.success) continue;
        const total = p.data.total_rate?.extracted_lowest;
        if (!total) continue; // no price for these dates → not an offer
        const coords = p.data.gps_coordinates ? { lat: p.data.gps_coordinates.latitude, lon: p.data.gps_coordinates.longitude } : undefined;
        const facilities = mapAmenities(p.data.amenities ?? []);
        offers.push({
          propertyId: `google:${p.data.property_token ?? p.data.name}`,
          name: p.data.name,
          type: p.data.type === 'vacation rental' || rentals ? 'APARTMENT' : 'HOTEL',
          ...(p.data.extracted_hotel_class ? { stars: p.data.extracted_hotel_class } : {}),
          ...(p.data.overall_rating ? { rating: Math.round(p.data.overall_rating * 20) / 10 } : {}),
          ...(p.data.reviews ? { reviewCount: p.data.reviews } : {}),
          facilities,
          coordinates: coords ?? req.centre,
          ...(coords ? { distanceToCentreM: Math.round(haversineKm(coords, req.centre) * 1000) } : {}),
          ...(coords && req.beach ? { distanceToBeachM: Math.round(haversineKm(coords, req.beach) * 1000) } : {}),
          roomDescription: 'Cheapest available option on Google Hotels',
          breakfastIncluded: false,
          price: {
            amount: fromMajor(total, req.currency),
            confidence: 'VERIFIED',
            attribution: {
              provider: PROVIDER,
              providerOfferId: p.data.property_token ?? p.data.name,
              retrievedAt: now,
              expiresAt,
              ...(p.data.link ? { deepLink: p.data.link } : parsed.data.search_metadata?.google_hotels_url ? { deepLink: parsed.data.search_metadata.google_hotels_url } : {}),
            },
          },
        });
      }
      return offers;
    });
  }
}
