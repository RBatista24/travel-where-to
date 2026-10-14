import type { Clock, FailureInjector } from '@travel-where-to/shared';
import {
    addDays,
    daysBetween,
    monthOf,
    seededRng,
    systemClock,
    toLocalDate,
} from '@travel-where-to/shared';
import type {
    ClimateMetadata,
    WeatherProvider,
    WeatherRequest,
    WeatherResult,
} from '@travel-where-to/domain';
import { ProviderError } from '@travel-where-to/domain';

export interface MockWeatherProviderOptions {
    /** Climate reference per location id (from the destination catalogue). */
    readonly climateFor: (locationId: string) => ClimateMetadata | undefined;
    readonly clock?: Clock;
    readonly failures?: FailureInjector;
    /** Trips starting within this many days get a (simulated) FORECAST; later trips get CLIMATE_AVERAGE. */
    readonly forecastHorizonDays?: number;
}

export class MockWeatherProvider implements WeatherProvider {
    readonly name = 'mock-weather';
    private readonly clock: Clock;

    constructor(private readonly options: MockWeatherProviderOptions) {
        this.clock = options.clock ?? systemClock;
    }

    async getForecast(request: WeatherRequest): Promise<WeatherResult> {
        const failure = this.options.failures?.('getForecast', request.locationId);
        if (failure) throw new ProviderError(this.name, failure, `Simulated ${failure}`);
        const climate = this.options.climateFor(request.locationId);
        if (!climate)
            throw new ProviderError(
                this.name,
                'UNAVAILABLE',
                `No weather data for ${request.locationId}`,
            );

        const days = Math.max(1, daysBetween(request.startDate, request.endDate));
        let high = 0;
        let low = 0;
        let rain = 0;
        for (let i = 0; i < days; i++) {
            const m = monthOf(addDays(request.startDate, i)) - 1;
            high += climate.avgHighC[m] ?? 0;
            low += climate.avgLowC[m] ?? 0;
            rain += (climate.rainyDays[m] ?? 0) / 30;
        }
        const now = this.clock.now();
        const leadDays = daysBetween(toLocalDate(now), request.startDate);
        const isForecast = leadDays <= (this.options.forecastHorizonDays ?? 10);
        // Simulated forecast deviation from the climate average.
        const noise = isForecast
            ? (seededRng(`wx:${request.locationId}:${request.startDate}`)() - 0.5) * 4
            : 0;
        return {
            avgHighC: Math.round((high / days + noise) * 10) / 10,
            avgLowC: Math.round((low / days + noise) * 10) / 10,
            rainyDaysExpected: Math.round(rain * 10) / 10,
            confidence: isForecast ? 'FORECAST' : 'CLIMATE_AVERAGE',
            attribution: { provider: this.name, retrievedAt: now },
        };
    }
}
