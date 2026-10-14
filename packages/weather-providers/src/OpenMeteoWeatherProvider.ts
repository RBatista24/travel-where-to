import { z } from 'zod';
import type { Clock } from '@travel-where-to/shared';
import { addDays, daysBetween, monthOf, systemClock, toLocalDate } from '@travel-where-to/shared';
import type { WeatherProvider, WeatherRequest, WeatherResult } from '@travel-where-to/domain';
import { PromiseCache, ProviderError, providerFetchJson, providerStatusError, type FetchLike } from '@travel-where-to/domain';

const PROVIDER = 'open-meteo';
const RAINY_DAY_MM = 1;

const DailySchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
  }),
});
type Daily = z.infer<typeof DailySchema>['daily'];

interface MonthNormal {
  high: number;
  low: number;
  rainyDays: number; // per month
  days: number;
}

export interface OpenMeteoOptions {
  readonly fetch?: FetchLike;
  readonly clock?: Clock;
  /** Trips that end within this many days use the forecast (Open-Meteo forecasts 16 days). */
  readonly forecastHorizonDays?: number;
  /** Full past years used for climate averages. */
  readonly climateYears?: number;
  readonly forecastUrl?: string;
  readonly archiveUrl?: string;
  /** Commercial plans use customer endpoints and an API key. */
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

/**
 * Weather from Open-Meteo (data CC BY 4.0 — attribution shown in the UI).
 * Near trips: daily forecast for the stay (confidence FORECAST).
 * Later trips: averages of the same calendar months over the last N full years from the
 * historical archive (confidence CLIMATE_AVERAGE), computed once per place and cached.
 * Free tier is for non-commercial use only.
 */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = PROVIDER;
  private readonly clock: Clock;
  private readonly normals = new PromiseCache<Map<number, MonthNormal>>(30 * 24 * 3_600_000);
  private readonly forecasts = new PromiseCache<Daily>(3 * 3_600_000);

  constructor(private readonly options: OpenMeteoOptions = {}) {
    this.clock = options.clock ?? systemClock;
  }

  async getForecast(req: WeatherRequest): Promise<WeatherResult> {
    const today = toLocalDate(this.clock.now());
    const nights = Math.max(1, daysBetween(req.startDate, req.endDate));
    const lastNight = addDays(req.startDate, nights - 1);
    const horizon = this.options.forecastHorizonDays ?? 15;
    if (daysBetween(today, req.startDate) >= 0 && daysBetween(today, lastNight) <= horizon) {
      return this.fromForecast(req, lastNight);
    }
    return this.fromClimate(req, nights);
  }

  private async fromForecast(req: WeatherRequest, lastNight: string): Promise<WeatherResult> {
    const key = `${req.coordinates.lat.toFixed(3)},${req.coordinates.lon.toFixed(3)}:${req.startDate}:${lastNight}`;
    const daily = await this.forecasts.get(key, () =>
      this.daily(this.options.forecastUrl ?? 'https://api.open-meteo.com/v1/forecast', req, req.startDate, lastNight),
    );
    const highs = daily.temperature_2m_max.filter((v): v is number => v !== null);
    const lows = daily.temperature_2m_min.filter((v): v is number => v !== null);
    if (highs.length === 0 || lows.length === 0) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', 'Forecast without temperatures');
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      avgHighC: round1(avg(highs)),
      avgLowC: round1(avg(lows)),
      rainyDaysExpected: daily.precipitation_sum.filter((p) => p !== null && p >= RAINY_DAY_MM).length,
      confidence: 'FORECAST',
      attribution: { provider: PROVIDER, retrievedAt: this.clock.now() },
    };
  }

  private async fromClimate(req: WeatherRequest, nights: number): Promise<WeatherResult> {
    const years = this.options.climateYears ?? 3;
    const thisYear = this.clock.now().getUTCFullYear();
    const key = `${req.coordinates.lat.toFixed(2)},${req.coordinates.lon.toFixed(2)}:${years}:${thisYear}`;
    const normals = await this.normals.get(key, async () =>
      monthlyNormals(
        await this.daily(this.options.archiveUrl ?? 'https://archive-api.open-meteo.com/v1/archive', req, `${thisYear - years}-01-01`, `${thisYear - 1}-12-31`),
      ),
    );
    let high = 0;
    let low = 0;
    let rain = 0;
    for (let i = 0; i < nights; i++) {
      const n = normals.get(monthOf(addDays(req.startDate, i)));
      if (!n) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', 'Missing climate data for month');
      high += n.high;
      low += n.low;
      rain += n.rainyDays / n.days;
    }
    return {
      avgHighC: round1(high / nights),
      avgLowC: round1(low / nights),
      rainyDaysExpected: round1(rain),
      confidence: 'CLIMATE_AVERAGE',
      attribution: { provider: PROVIDER, retrievedAt: this.clock.now() },
    };
  }

  private async daily(base: string, req: WeatherRequest, start: string, end: string): Promise<Daily> {
    const qs = new URLSearchParams({
      latitude: req.coordinates.lat.toFixed(4),
      longitude: req.coordinates.lon.toFixed(4),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
      timezone: 'auto',
      start_date: start,
      end_date: end,
      ...(this.options.apiKey ? { apikey: this.options.apiKey } : {}),
    });
    const { status, body } = await providerFetchJson(`${base}?${qs.toString()}`, {}, {
      provider: PROVIDER,
      timeoutMs: this.options.timeoutMs ?? 15_000,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
    if (status !== 200) {
      const reason = typeof body === 'object' && body && 'reason' in body ? String((body as { reason: unknown }).reason) : JSON.stringify(body ?? '');
      throw providerStatusError(PROVIDER, status, reason);
    }
    const parsed = DailySchema.safeParse(body);
    if (!parsed.success) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);
    const d = parsed.data.daily;
    if (d.temperature_2m_max.length !== d.time.length) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', 'Daily arrays of different lengths');
    return d;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Month (1–12) → average daily high/low and rainy days per month, over all years in the data. */
export function monthlyNormals(d: Daily): Map<number, MonthNormal> {
  const acc = new Map<number, { hi: number; lo: number; n: number; rainy: number; days: number; years: Set<string> }>();
  d.time.forEach((day, i) => {
    const m = Number(day.slice(5, 7));
    const a = acc.get(m) ?? { hi: 0, lo: 0, n: 0, rainy: 0, days: 0, years: new Set<string>() };
    const hi = d.temperature_2m_max[i];
    const lo = d.temperature_2m_min[i];
    const p = d.precipitation_sum[i];
    if (hi != null && lo != null) {
      a.hi += hi;
      a.lo += lo;
      a.n += 1;
    }
    if (p != null) {
      a.days += 1;
      if (p >= RAINY_DAY_MM) a.rainy += 1;
    }
    a.years.add(day.slice(0, 4));
    acc.set(m, a);
  });
  const out = new Map<number, MonthNormal>();
  for (const [m, a] of acc) {
    if (a.n === 0 || a.days === 0) continue;
    const daysPerMonth = a.days / a.years.size;
    out.set(m, { high: a.hi / a.n, low: a.lo / a.n, rainyDays: (a.rainy / a.days) * daysPerMonth, days: daysPerMonth });
  }
  return out;
}
