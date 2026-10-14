import { z } from 'zod';
import { fromMajor, money, multiplyMoney, type Money } from '@travel-where-to/shared';
import type { RouteRequest, RouteResult, RoutingProvider } from '@travel-where-to/domain';
import { PromiseCache, ProviderError, providerFetchJson, providerStatusError, type FetchLike } from '@travel-where-to/domain';

const PROVIDER = 'openrouteservice';

const OrsResponseSchema = z.object({
  routes: z
    .array(
      z.object({
        summary: z.object({ distance: z.number().nonnegative().optional(), duration: z.number().nonnegative().optional() }),
        extras: z
          .object({
            tollways: z.object({ summary: z.array(z.object({ value: z.number(), distance: z.number().nonnegative() })) }).optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

const OrsErrorSchema = z.object({ error: z.union([z.string(), z.object({ code: z.number().optional(), message: z.string().optional() })]) });

export interface OpenRouteServiceOptions {
  readonly apiKey: string;
  /** Average toll price per km on tolled roads (estimate). Default €0.09/km. */
  readonly tollPerKm?: Money;
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly cacheTtlHours?: number;
}

/**
 * Driving routes from openrouteservice (driving-car). Distance and duration are provider
 * facts; tolls are estimated from the length of tolled road ORS reports × a per-km rate.
 * Routes are cached (roads rarely change) to respect the free quota.
 */
export class OpenRouteServiceRoutingProvider implements RoutingProvider {
  readonly name = PROVIDER;
  private readonly cache: PromiseCache<RouteResult>;

  constructor(private readonly options: OpenRouteServiceOptions) {
    if (!options.apiKey) throw new Error('ORS_API_KEY is required for the openrouteservice routing provider');
    this.cache = new PromiseCache((options.cacheTtlHours ?? 24 * 7) * 3_600_000);
  }

  calculateRoute(request: RouteRequest): Promise<RouteResult> {
    const r = (n: number) => n.toFixed(4);
    const key = `${r(request.from.lat)},${r(request.from.lon)}>${r(request.to.lat)},${r(request.to.lon)}`;
    return this.cache.get(key, () => this.fetchRoute(request));
  }

  private async fetchRoute(request: RouteRequest): Promise<RouteResult> {
    const url = `${this.options.baseUrl ?? 'https://api.openrouteservice.org'}/v2/directions/driving-car/json`;
    const { status, body } = await providerFetchJson(
      url,
      {
        method: 'POST',
        headers: { Authorization: this.options.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          // ORS uses [lon, lat].
          coordinates: [
            [request.from.lon, request.from.lat],
            [request.to.lon, request.to.lat],
          ],
          // Snap each point to the nearest road however far (airports, beaches, old-town centres).
          radiuses: [-1, -1],
          extra_info: ['tollways'],
          instructions: false,
          geometry: false,
        }),
      },
      { provider: PROVIDER, timeoutMs: this.options.timeoutMs ?? 10_000, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) },
    );
    if (status !== 200) {
      const err = OrsErrorSchema.safeParse(body);
      const message = err.success ? (typeof err.data.error === 'string' ? err.data.error : (err.data.error.message ?? '')) : JSON.stringify(body ?? '');
      // 404 "could not find routable point" / no route: there is no road route.
      if (status === 404) throw new ProviderError(PROVIDER, 'UNAVAILABLE', `No driving route: ${message}`);
      throw providerStatusError(PROVIDER, status, message);
    }
    const parsed = OrsResponseSchema.safeParse(body);
    if (!parsed.success) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);
    const route = parsed.data.routes[0]!;
    if (route.summary.distance === undefined || route.summary.duration === undefined) {
      throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', 'Route without distance or duration');
    }
    const tolledMetres = (route.extras?.tollways?.summary ?? []).filter((s) => s.value >= 1).reduce((a, s) => a + s.distance, 0);
    const rate = this.options.tollPerKm ?? fromMajor(0.09, 'EUR');
    return {
      distanceKm: Math.round(route.summary.distance / 100) / 10,
      durationMinutes: Math.round(route.summary.duration / 60),
      tolls: tolledMetres > 0 ? multiplyMoney(rate, tolledMetres / 1000) : money(0, rate.currency),
      provider: PROVIDER,
    };
  }
}
