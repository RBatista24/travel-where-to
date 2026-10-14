import type { Clock } from '@travel-where-to/shared';
import { addDays, daysBetween, fromMajor, systemClock } from '@travel-where-to/shared';
import type { FlightDiscoveryRequest, FlightLeg, FlightOffer, FlightProvider, IndicativeFlightResult } from '@travel-where-to/domain';
import { countTravellers, PromiseCache, ProviderError, providerFetchJson, providerStatusError, TIME_OF_DAY_HOURS, type FetchLike, type FlightPreferences, type TimeOfDay } from '@travel-where-to/domain';
import { parseTickets, TpGroupedResponseSchema, TpListResponseSchema, type TpTicket } from './travelpayoutsPayload';

export interface TravelpayoutsOptions {
  readonly token: string;
  /** Affiliate marker added to Aviasales links (optional). */
  readonly marker?: string;
  /** Price cache market, e.g. "pt". */
  readonly market?: string;
  readonly baseUrl?: string;
  readonly linkBaseUrl?: string;
  readonly fetch?: FetchLike;
  readonly clock?: Clock;
  readonly cacheTtlMinutes?: number;
  readonly timeoutMs?: number;
  /** How far (days and nights) to look for a cached trip when the exact one isn't cached. */
  readonly flexDays?: number;
  /** Last resort for quiet routes / far-ahead dates: departure within this many days (default 14), labelled. */
  readonly wideFlexDays?: number;
  /** Infant fare as a fraction of an adult fare (assumption: cache has adult fares only). */
  readonly infantFareFactor?: number;
}

const PROVIDER = 'travelpayouts';

/**
 * Flights from the Travelpayouts (Aviasales) Data API.
 *
 * - The data is a CACHE of recent searches, per adult, so every price is INDICATIVE —
 *   including the ones returned by `searchLive`. The deep link opens Aviasales with the
 *   whole party, where the real bookable total is shown.
 * - One `grouped_prices` call returns the cheapest round trip for every departure date of
 *   a month with an exact trip length, so flexible windows cost one call per route-month.
 * - Party total = adult fare × (adults + children) + infants × infantFareFactor. The basis
 *   is written on the cost line so the user sees it is derived.
 */
export class TravelpayoutsFlightProvider implements FlightProvider {
  readonly name = PROVIDER;
  private readonly clock: Clock;
  private readonly monthCache: PromiseCache<TpTicket[]>;
  private readonly datesCache: PromiseCache<TpTicket[]>;

  constructor(private readonly options: TravelpayoutsOptions) {
    if (!options.token) throw new Error('TRAVELPAYOUTS_TOKEN is required for the Travelpayouts flight provider');
    this.clock = options.clock ?? systemClock;
    const ttl = (options.cacheTtlMinutes ?? 60) * 60_000;
    this.monthCache = new PromiseCache(ttl, () => this.clock.now().getTime());
    this.datesCache = new PromiseCache(ttl, () => this.clock.now().getTime());
  }

  async searchIndicative(req: FlightDiscoveryRequest): Promise<IndicativeFlightResult[]> {
    const out: IndicativeFlightResult[] = [];
    const errors: unknown[] = [];
    await Promise.all(
      this.pairs(req).map(async ([from, to]) => {
        try {
          const m = await this.bestMatch(from, to, req);
          if (!m) return;
          out.push({
            originAirport: m.ticket.origin_airport ?? from,
            destinationAirport: m.ticket.destination_airport ?? to,
            outboundDate: req.outboundDate,
            returnDate: req.returnDate,
            direct: (m.ticket.transfers ?? 0) === 0 && (m.ticket.return_transfers ?? 0) === 0,
            price: {
              amount: this.partyTotal(m.ticket.price, req),
              confidence: 'INDICATIVE',
              attribution: { provider: PROVIDER, providerOfferId: this.offerId(m.ticket, from, to), retrievedAt: this.clock.now(), deepLink: this.deepLink(m.exact ? m.ticket : undefined, req, from, to) },
            },
          });
        } catch (e) {
          errors.push(e);
        }
      }),
    );
    // Only fail the call when every route failed; otherwise partial data is real data.
    if (out.length === 0 && errors.length > 0) throw errors[0];
    return out;
  }

  async searchLive(req: FlightDiscoveryRequest): Promise<FlightOffer[]> {
    const offers: FlightOffer[] = [];
    const errors: unknown[] = [];
    await Promise.all(
      this.pairs(req).map(async ([from, to]) => {
        try {
          // Only query exact dates for routes the month data already priced (saves quota).
          const m = await this.bestMatch(from, to, req);
          if (!m) return;
          let tickets: TpTicket[] = [];
          if (m.exact) {
            tickets = await this.exactDates(from, to, req.outboundDate, req.returnDate, req.currency, !!req.preferences?.directOnly).catch(() => [] as TpTicket[]);
            tickets = tickets.filter((t) => t.departure_at.slice(0, 10) === req.outboundDate && t.return_at?.slice(0, 10) === req.returnDate);
            // Flights at the asked times first; one off-time flight is kept so the engine can say why it was left out.
            const fits = tickets.filter((t) => matchesTimes(t, req.preferences));
            const off = tickets.filter((t) => !matchesTimes(t, req.preferences));
            tickets = fits.length > 0 ? fits : off.slice(0, 1);
          }
          if (tickets.length === 0) tickets = [m.ticket];
          for (const t of tickets.slice(0, 3)) {
            const offer = this.toOffer(t, from, to, req, m.exact ? undefined : m.note);
            if (offer) offers.push(offer);
          }
        } catch (e) {
          errors.push(e);
        }
      }),
    );
    if (offers.length === 0 && errors.length > 0) throw errors[0];
    return offers;
  }

  // ---------- matching cached prices to the requested trip ----------

  /**
   * The cache rarely holds the exact trip, so look in widening circles and say what was used:
   * 1. same dates, same length  2. departure ±N days, same length
   * 3. same departure, length ±N nights  4. departure ±N days, length ±N nights
   * 5. (far-ahead or quiet routes) departure ±W days, length ±N nights, also in the neighbouring month.
   * Steps 2–5 are labelled on the price; the live check re-prices the top results.
   */
  private async bestMatch(from: string, to: string, req: FlightDiscoveryRequest): Promise<{ ticket: TpTicket; exact: boolean; note: string } | null> {
    const nights = daysBetween(req.outboundDate, req.returnDate);
    const flex = this.options.flexDays ?? 3;
    const wide = this.options.wideFlexDays ?? 14;
    const month = req.outboundDate.slice(0, 7);
    const direct = !!req.preferences?.directOnly;
    const exactLen = await this.month(from, to, month, nights, req.currency, direct);
    const same = exactLen.find((t) => t.departure_at.slice(0, 10) === req.outboundDate);
    if (same) return { ticket: same, exact: true, note: '' };
    const scored = (list: TpTicket[], maxDays: number) =>
      list
        .map((t) => {
          const dep = t.departure_at.slice(0, 10);
          const len = t.return_at ? daysBetween(dep, t.return_at.slice(0, 10)) : -99;
          return { t, dd: Math.abs(daysBetween(req.outboundDate, dep)), dn: Math.abs(len - nights), len, dep };
        })
        .filter((x) => x.dd <= maxDays && x.dn <= flex && x.len > 0)
        .sort((a, b) => a.dd + a.dn - (b.dd + b.dn) || a.t.price - b.t.price);
    const anyLen = () => this.month(from, to, month, null, req.currency, direct);
    let near = scored(exactLen, flex)[0] ?? scored(await anyLen(), flex)[0];
    if (!near && wide > flex) {
      // Neighbouring month when the ±W window crosses into it.
      const other = [addDays(req.outboundDate, -wide), addDays(req.outboundDate, wide)].map((d) => d.slice(0, 7)).find((m) => m !== month);
      const extra = other ? await this.month(from, to, other, null, req.currency, direct).catch(() => [] as TpTicket[]) : [];
      near = scored([...(await anyLen()), ...extra], wide)[0];
    }
    if (!near) return null;
    return { ticket: near.t, exact: false, note: `cached price for a ${near.len}-night trip leaving ${near.dep}` };
  }

  // ---------- API calls ----------

  /**
   * Cheapest cached round trips leaving in a month (exact length, or any length when `nights` is null).
   * The API treats a request without `return_at` as ONE-WAY, so round trips are asked for explicitly:
   * returning the same month and the following month (two calls, merged, cheapest per date pair).
   */
  private month(from: string, to: string, month: string, nights: number | null, currency: string, direct = false): Promise<TpTicket[]> {
    return this.monthCache.get(`${from}-${to}-${month}-${nights ?? 'any'}-${currency}-${direct ? 'direct' : 'all'}`, async () => {
      const base: Record<string, string> = {
        origin: from,
        destination: to,
        departure_at: month,
        group_by: 'departure_at',
        currency: currency.toLowerCase(),
        ...(nights !== null ? { min_trip_duration: String(nights), max_trip_duration: String(nights) } : {}),
        ...(direct ? { direct: 'true' } : {}),
      };
      const fetchFor = async (market: string | undefined) => {
        const lists = await Promise.all([month, nextMonth(month)].map((ret) => this.grouped({ ...base, return_at: ret }, market)));
        const best = new Map<string, TpTicket>();
        for (const t of lists.flat()) {
          if (!t.return_at) continue;
          const key = `${t.departure_at.slice(0, 10)}>${t.return_at.slice(0, 10)}`;
          const cur = best.get(key);
          if (!cur || t.price < cur.price) best.set(key, t);
        }
        return [...best.values()];
      };
      let tickets = await fetchFor(this.options.market);
      // The configured market's cache can be empty; other markets' searches still carry real prices.
      if (tickets.length === 0 && this.options.market) tickets = await fetchFor(undefined);
      return tickets.filter((t) => nights === null || daysBetween(t.departure_at.slice(0, 10), t.return_at!.slice(0, 10)) === nights);
    });
  }

  private async grouped(params: Record<string, string>, market: string | undefined): Promise<TpTicket[]> {
    const body = await this.get('/aviasales/v3/grouped_prices', params, market);
    const parsed = TpGroupedResponseSchema.safeParse(body);
    if (!parsed.success) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);
    if (!parsed.data.success) throw new ProviderError(PROVIDER, 'UNAVAILABLE', parsed.data.error ?? 'success=false');
    this.assertCurrency(parsed.data.currency, params.currency ?? '');
    return parseTickets(Object.values(parsed.data.data)).tickets;
  }

  private exactDates(from: string, to: string, outbound: string, ret: string, currency: string, direct = false): Promise<TpTicket[]> {
    return this.datesCache.get(`${from}-${to}-${outbound}-${ret}-${currency}-${direct ? 'direct' : 'all'}`, async () => {
      const body = await this.get(
        '/aviasales/v3/prices_for_dates',
        {
          origin: from,
          destination: to,
          departure_at: outbound,
          return_at: ret,
          one_way: 'false',
          sorting: 'price',
          unique: 'false',
          limit: '30',
          currency: currency.toLowerCase(),
          ...(direct ? { direct: 'true' } : {}),
        },
        this.options.market,
      );
      const parsed = TpListResponseSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', parsed.error.message);
      if (!parsed.data.success) throw new ProviderError(PROVIDER, 'UNAVAILABLE', parsed.data.error ?? 'success=false');
      this.assertCurrency(parsed.data.currency, currency);
      return parseTickets(parsed.data.data).tickets.sort((a, b) => a.price - b.price);
    });
  }

  private async get(path: string, params: Record<string, string>, market: string | undefined): Promise<unknown> {
    const qs = new URLSearchParams({ ...params, ...(market ? { market } : {}) });
    const url = `${this.options.baseUrl ?? 'https://api.travelpayouts.com'}${path}?${qs.toString()}`;
    const { status, body } = await providerFetchJson(
      url,
      { headers: { 'X-Access-Token': this.options.token, 'Accept-Encoding': 'gzip, deflate' } },
      { provider: PROVIDER, timeoutMs: this.options.timeoutMs ?? 10_000, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) },
    );
    if (status !== 200) throw providerStatusError(PROVIDER, status, JSON.stringify(body ?? ''));
    return body;
  }

  // ---------- mapping ----------

  private pairs(req: FlightDiscoveryRequest): [string, string][] {
    const pairs: [string, string][] = [];
    for (const from of req.originAirports) for (const to of req.destinationAirports) if (from !== to) pairs.push([from, to]);
    return pairs;
  }

  private assertCurrency(got: string | undefined, expected: string): void {
    if (got && got.toUpperCase() !== expected.toUpperCase()) {
      throw new ProviderError(PROVIDER, 'INVALID_RESPONSE', `Expected ${expected}, got ${got}`);
    }
  }

  private seats(req: FlightDiscoveryRequest) {
    const c = countTravellers(req.travellers);
    return { ...c, factor: c.adults + c.children + c.infants * (this.options.infantFareFactor ?? 0.1) };
  }

  private partyTotal(perAdult: number, req: FlightDiscoveryRequest) {
    return fromMajor(Math.round(perAdult * this.seats(req).factor * 100) / 100, req.currency);
  }

  private basis(perAdult: number, req: FlightDiscoveryRequest, note?: string): string {
    const s = this.seats(req);
    const parts = [`${s.adults + s.children} seat${s.adults + s.children === 1 ? '' : 's'}`];
    if (s.infants) parts.push(`${s.infants} baby at ~${Math.round((this.options.infantFareFactor ?? 0.1) * 100)}%`);
    const source = note ? `${note} (no cached price for your exact dates)` : "Aviasales' recent-search cache";
    return `${perAdult} ${req.currency} per adult, ${source} × ${parts.join(' + ')}; children priced as adults. Exact total on Aviasales.`;
  }

  private offerId(t: TpTicket, from: string, to: string): string {
    return `${t.origin_airport ?? from}${t.destination_airport ?? to}-${t.departure_at.slice(0, 10)}-${t.return_at?.slice(0, 10) ?? ''}-${t.airline ?? ''}${t.flight_number ?? ''}`;
  }

  /** Aviasales link for the requested dates and the real party: /search/LIS1411AGP1811 + adults children infants. */
  deepLink(t: TpTicket | undefined, req: FlightDiscoveryRequest, from?: string, to?: string): string {
    const s = this.seats(req);
    const block = `${Math.min(s.adults, 9)}${s.children}${s.infants}`.replace(/0+$/, '') || '1';
    const base = this.options.linkBaseUrl ?? 'https://www.aviasales.com';
    let path = t?.link;
    const m = path ? /^(\/search\/[A-Z]{3}\d{4}[A-Z]{3}(?:\d{4})?)(?:[wcf]?\d{1,3})(\?.*)?$/.exec(path) : null;
    if (m) path = `${m[1]}${block}${m[2] ?? ''}`;
    if (!path) {
      const ddmm = (d: string) => `${d.slice(8, 10)}${d.slice(5, 7)}`;
      const o = t?.origin_airport ?? from ?? req.originAirports[0];
      const d = t?.destination_airport ?? to ?? req.destinationAirports[0];
      path = `/search/${o}${ddmm(req.outboundDate)}${d}${ddmm(req.returnDate)}${block}`;
    }
    const url = new URL(path, base);
    if (this.options.marker) url.searchParams.set('marker', this.options.marker);
    return url.toString();
  }

  private toOffer(t: TpTicket, from: string, to: string, req: FlightDiscoveryRequest, proxyNote?: string): FlightOffer | null {
    if (!t.return_at) return null;
    // Durations are required to rank travel time; half of the total is accepted as a fallback, nothing else is guessed.
    const outMinutes = t.duration_to ?? (t.duration ? Math.round(t.duration / 2) : undefined);
    const backMinutes = t.duration_back ?? (t.duration ? Math.round(t.duration / 2) : undefined);
    if (!outMinutes || !backMinutes) return null;
    const o = t.origin_airport ?? from;
    const d = t.destination_airport ?? to;
    const carrier = t.airline ?? 'Unknown airline';
    const leg = (fromCode: string, toCode: string, departure: string, minutes: number, stops: number | undefined): FlightLeg => ({
      from: fromCode,
      to: toCode,
      // Local time at the departure airport; arrival is not given reliably across time zones.
      departure: departure.slice(0, 16),
      arrival: '',
      durationMinutes: minutes,
      stops: stops ?? 0,
      carrier,
    });
    // A price borrowed from nearby dates says nothing about your flight times: show the date only.
    const outbound = proxyNote ? { ...leg(o, d, req.outboundDate, outMinutes, t.transfers) } : leg(o, d, t.departure_at, outMinutes, t.transfers);
    return {
      originAirport: o,
      destinationAirport: d,
      outbound,
      ...(proxyNote ? {} : { inbound: leg(d, o, t.return_at, backMinutes, t.return_transfers) }),
      price: {
        amount: this.partyTotal(t.price, req),
        confidence: 'INDICATIVE',
        attribution: { provider: PROVIDER, providerOfferId: this.offerId(t, from, to), retrievedAt: this.clock.now(), deepLink: this.deepLink(proxyNote ? undefined : t, req, from, to) },
      },
      priceBasis: this.basis(t.price, req, proxyNote),
      // Asked the cache for non-stop trips only (covers the return leg even when it isn't detailed).
      ...(req.preferences?.directOnly ? { filteredBy: { directOnly: true } } : {}),
    };
  }
}

/** Local departure hour in Aviasales timestamps ("2026-11-14T06:35:00+00:00"). */
function hourOf(ts: string | undefined): number | undefined {
  const m = ts ? /T(\d{2}):/.exec(ts) : null;
  return m ? Number(m[1]) : undefined;
}

function inWindows(hour: number | undefined, times: readonly TimeOfDay[] | undefined): boolean {
  if (!times || times.length === 0 || hour === undefined) return true;
  return times.some((t) => hour >= TIME_OF_DAY_HOURS[t][0] && hour <= TIME_OF_DAY_HOURS[t][1]);
}

function matchesTimes(t: TpTicket, prefs: FlightPreferences | undefined): boolean {
  return inWindows(hourOf(t.departure_at), prefs?.outboundTimes) && inWindows(hourOf(t.return_at), prefs?.returnTimes);
}

/** "2027-05" → "2027-06"; "2027-12" → "2028-01". */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
