import type { FailureInjector } from '@travel-where-to/shared';
import { eur, haversineKm, multiplyMoney } from '@travel-where-to/shared';
import type { RouteRequest, RouteResult, RoutingProvider } from '@travel-where-to/domain';
import { ProviderError } from '@travel-where-to/domain';

export interface MockRoutingProviderOptions {
    readonly failures?: FailureInjector;
    /** Road distance ≈ straight line × factor. */
    readonly roadFactor?: number;
    readonly averageSpeedKmh?: number;
    readonly tollPerKm?: number;
}

/** Approximates routes from straight-line distance. Values are estimates, never presented as facts. */
export class MockRoutingProvider implements RoutingProvider {
    readonly name = 'mock-routing';

    constructor(private readonly options: MockRoutingProviderOptions = {}) {}

    async calculateRoute(request: RouteRequest): Promise<RouteResult> {
        const key = `${request.from.lat},${request.from.lon}->${request.to.lat},${request.to.lon}`;
        const failure = this.options.failures?.('calculateRoute', key);
        if (failure) throw new ProviderError(this.name, failure, `Simulated ${failure}`);
        const distanceKm = Math.round(
            haversineKm(request.from, request.to) * (this.options.roadFactor ?? 1.28),
        );
        const speed = this.options.averageSpeedKmh ?? 85;
        const durationMinutes = Math.round((distanceKm / speed) * 60 + 10);
        // Short urban hops are assumed toll-free.
        const tolls =
            distanceKm > 30
                ? multiplyMoney(eur(this.options.tollPerKm ?? 0.045), distanceKm)
                : eur(0);
        return { distanceKm, durationMinutes, tolls, provider: this.name };
    }
}
