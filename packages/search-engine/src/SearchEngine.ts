import type { Clock, StayDates } from '@travel-where-to/shared';
import {
    addMoney,
    daysBetween,
    eur,
    formatMoney,
    mapLimit,
    sumMoney,
    systemClock,
    TimeoutError,
    toLocalDate,
    withTimeout,
} from '@travel-where-to/shared';
import type {
    AccommodationOffer,
    AccommodationProvider,
    Airport,
    BudgetPicks,
    CostItem,
    Destination,
    ExcludedDestination,
    FlightOffer,
    IndicativeFlightResult,
    FlightProvider,
    LiveFlightProvider,
    MatchReason,
    ProviderIssue,
    RouteResult,
    RoutingProvider,
    SearchCriteria,
    SearchResult,
    TransportOption,
    TripAlternative,
    TripRecommendation,
    Vehicle,
    WeatherProvider,
    WeatherResult,
} from '@travel-where-to/domain';
import {
    hasFlightPreferences,
    isExpired,
    officialParkHotel,
    ProviderError,
    validateCriteria,
} from '@travel-where-to/domain';
import {
    airportAccessCosts,
    buildCostBreakdown,
    carTripCosts,
    DEFAULT_VEHICLE,
    estimateFoodCost,
    estimateParkTickets,
    evaluateBudget,
    flightCostItem,
} from '@travel-where-to/pricing';
import {
    accommodationFailures,
    comfortScore,
    compareRanked,
    computeMatchScore,
    drivingFailures,
    flightPreferenceCheck,
    type FlightPreferenceCheck,
} from '@travel-where-to/ranking';
import {
    buildStayOptions,
    generateCandidates,
    type DestinationRepository,
} from '@travel-where-to/destination-engine';
import { DEFAULT_CONFIG, type SearchEngineConfig } from './config';
import {
    noopLogger,
    SequentialSearchIdGenerator,
    type ProviderCallLogger,
    type SearchIdGenerator,
} from './observability';
import { buildRelaxations } from './relaxation';

export interface SearchEngineDeps {
    readonly destinations: DestinationRepository;
    readonly flights: FlightProvider;
    readonly accommodation: AccommodationProvider;
    readonly routing: RoutingProvider;
    readonly weather: WeatherProvider;
    /** Optional live flight prices, used only to verify the top results (spec §28 live phase). */
    readonly flightVerifier?: LiveFlightProvider;
    /** Departure airports for the origin market (Portugal in V1). */
    readonly departureAirports: readonly Airport[];
    readonly clock?: Clock;
    readonly logger?: ProviderCallLogger;
    readonly ids?: SearchIdGenerator;
    readonly config?: Partial<SearchEngineConfig>;
}

export class SearchValidationError extends Error {
    constructor(readonly errors: readonly string[]) {
        super(`Invalid search criteria: ${errors.join(' ')}`);
        this.name = 'SearchValidationError';
    }
}

interface AirportAccess {
    readonly airport: Airport;
    readonly route: RouteResult;
}

interface Evaluated {
    readonly destination: Destination;
    readonly stay: StayDates;
    readonly transport: TransportOption;
    readonly accommodation: AccommodationOffer;
    readonly weather: WeatherResult | null;
    readonly costs: TripRecommendation['costs'];
    readonly score: TripRecommendation['score'];
    readonly reasons: TripRecommendation['reasons'];
    readonly id: string;
    /** Estimated items outside transport and stay (food, park tickets). */
    readonly extras: readonly CostItem[];
}

/** A way of getting to the destination for one stay, with the items that make up its cost. */
interface TransportChoice {
    readonly transport: TransportOption;
    readonly items: CostItem[];
    readonly reasons?: MatchReason[];
}

/** What happened to one destination's stays, counted so an exclusion can say why. */
interface DestinationTally {
    parkHotelsFiltered: boolean;
    readonly flightMisses: Set<string>;
    flightsSeen: number;
    staysSeen: number;
    staysEligible: number;
    cheapestOverBudget: number;
}

/** Everything one destination's evaluation shares. */
interface DestinationContext {
    readonly destination: Destination;
    readonly criteria: SearchCriteria;
    readonly access: readonly AirportAccess[];
    readonly vehicle: Vehicle;
    readonly prefs: SearchCriteria['transport']['flights'];
    readonly currency: SearchCriteria['budget']['currency'];
    readonly carRoute: RouteResult | undefined;
    readonly flightsPossible: boolean;
    readonly parkOnly: boolean;
    readonly run: SearchRun;
    readonly tally: DestinationTally;
}

/** Per-search mutable context: issues and provider call bookkeeping. */
class SearchRun {
    readonly issues: ProviderIssue[] = [];
    readonly excluded: ExcludedDestination[] = [];
    readonly notices = new Set<string>();
    expiredOffersDropped = 0;

    constructor(
        readonly searchId: string,
        readonly now: Date,
        private readonly logger: ProviderCallLogger,
        private readonly timeoutMs: number,
    ) {}

    /** Calls a provider; failures become issues instead of crashing the search. */
    async call<T>(
        provider: string,
        operation: string,
        destinationId: string | undefined,
        fn: () => Promise<T>,
    ): Promise<T | undefined> {
        const started = performance.now();
        try {
            const result = await withTimeout(fn(), this.timeoutMs);
            this.logger.log({
                searchId: this.searchId,
                provider,
                operation,
                ...(destinationId ? { destinationId } : {}),
                durationMs: Math.round(performance.now() - started),
                status: 'OK',
                ...(Array.isArray(result) ? { resultCount: result.length } : {}),
                cacheHit: false,
            });
            return result;
        } catch (err) {
            const kind = errorKind(err);
            const message = err instanceof Error ? err.message : String(err);
            this.issues.push({
                provider,
                operation,
                kind,
                message,
                ...(destinationId ? { destinationId } : {}),
            });
            this.logger.log({
                searchId: this.searchId,
                provider,
                operation,
                ...(destinationId ? { destinationId } : {}),
                durationMs: Math.round(performance.now() - started),
                status: 'ERROR',
                errorKind: kind,
                error: message,
                cacheHit: false,
            });
            return undefined;
        }
    }
}

function errorKind(err: unknown): ProviderIssue['kind'] {
    if (err instanceof ProviderError) return err.kind;
    if (err instanceof TimeoutError) return 'TIMEOUT';
    return 'UNKNOWN';
}

/** Stays to try live when indicative pricing failed everywhere: a few spread across the window. */
function spreadStays(stays: readonly StayDates[], n: number): readonly StayDates[] {
    if (stays.length <= n) return stays;
    return Array.from(
        { length: n },
        (_, i) => stays[Math.round((i * (stays.length - 1)) / Math.max(1, n - 1))]!,
    );
}

/**
 * Discovery pipeline (spec §27):
 * criteria → hard filters → candidates → transport → accommodation → costs → ranking → top results.
 * Every price shown comes from a provider or is an explicit estimate.
 */
export class SearchEngine {
    private readonly config: SearchEngineConfig;
    private readonly clock: Clock;
    private readonly logger: ProviderCallLogger;
    private readonly ids: SearchIdGenerator;

    constructor(private readonly deps: SearchEngineDeps) {
        this.config = { ...DEFAULT_CONFIG, ...deps.config };
        this.clock = deps.clock ?? systemClock;
        this.logger = deps.logger ?? noopLogger;
        this.ids = deps.ids ?? new SequentialSearchIdGenerator();
    }

    async search(criteria: SearchCriteria): Promise<SearchResult> {
        const result = await this.execute(criteria);
        if (result.recommendations.length >= this.config.relaxWhenFewerThan) return result;
        const relaxations = await buildRelaxations(criteria, async (c) => {
            try {
                return (await this.execute(c, result.searchId)).totalViable;
            } catch (e) {
                if (e instanceof SearchValidationError) return 0;
                throw e;
            }
        });
        return { ...result, relaxations };
    }

    private async execute(
        criteria: SearchCriteria,
        parentSearchId?: string,
    ): Promise<SearchResult> {
        const now = this.clock.now();
        const errors = validateCriteria(criteria, toLocalDate(now));
        if (errors.length > 0) throw new SearchValidationError(errors);

        const searchId = parentSearchId ? `${parentSearchId}/relax` : this.ids.next(now);
        const run = new SearchRun(searchId, now, this.logger, this.config.providerTimeoutMs);
        const vehicle = criteria.transport.vehicle ?? DEFAULT_VEHICLE;
        if (!criteria.transport.vehicle) {
            run.notices.add(
                `Fuel estimates use a typical diesel car (${DEFAULT_VEHICLE.consumptionPer100Km} L/100 km at ${formatMoney(DEFAULT_VEHICLE.fuelPrice)}/L). Set your vehicle for better estimates.`,
            );
        }

        const all = await this.deps.destinations.list();
        const { candidates, excluded } = generateCandidates(criteria, all);
        run.excluded.push(...excluded);
        const stays = buildStayOptions(criteria.dates, this.config.maxStayOptions);

        const wantsFlights = criteria.transport.modes.includes('FLIGHT');
        const wantsCar = criteria.transport.modes.includes('CAR');
        const access = wantsFlights ? await this.airportAccess(criteria, run) : [];

        const perDestination = await mapLimit(candidates, this.config.concurrency, (d) =>
            this.evaluateDestination(
                d,
                criteria,
                stays,
                access,
                vehicle,
                wantsFlights,
                wantsCar,
                run,
            ),
        );

        const ranked = rankDestinations(perDestination, all, run, this.config.maxAlternatives);
        // Relaxation re-runs only count options; they never spend live-price calls.
        if (!parentSearchId) await this.verifyFlights(ranked, criteria, vehicle, run);
        const best = ranked.map((r) => r.rec).sort(compareRanked);
        // Live-checked trips replace their indicative versions in the budget views too.
        const verified = new Map(ranked.map((r) => [r.top.id, r.top]));
        const picks = parentSearchId
            ? undefined
            : budgetPicks(
                  perDestination.map((list) => list.map((e) => verified.get(e.id) ?? e)),
                  criteria,
                  this.config.picksPerList,
                  this.config.fullBudgetFloor,
              );

        this.addResultNotices(run, best);

        return {
            searchId,
            createdAt: now,
            criteria,
            recommendations: best.slice(0, this.config.maxResults),
            totalViable: best.length,
            excluded: run.excluded,
            issues: run.issues,
            notices: [...run.notices],
            relaxations: [],
            sources: sourcesOf(this.deps),
            ...(picks ? { picks } : {}),
        };
    }

    private addResultNotices(run: SearchRun, best: readonly TripRecommendation[]): void {
        const estimated = best
            .slice(0, this.config.maxResults)
            .filter(
                (r) =>
                    r.transport.mode === 'FLIGHT' &&
                    r.transport.offer.price.confidence === 'ESTIMATED',
            ).length;
        if (estimated > 0)
            run.notices.add(
                `${estimated} result${estimated === 1 ? ' has' : 's have'} no recent flight prices, so the flight cost is our estimate (marked "Our estimate"). Check the real price before booking.`,
            );
        if (run.expiredOffersDropped > 0)
            run.notices.add(
                `${run.expiredOffersDropped} expired provider price(s) were discarded.`,
            );
        for (const n of summariseIssues(run.issues)) run.notices.add(n);
    }

    private async airportAccess(
        criteria: SearchCriteria,
        run: SearchRun,
    ): Promise<AirportAccess[]> {
        const allowed = criteria.transport.departureAirports;
        const airports = this.deps.departureAirports.filter(
            (a) => !allowed || allowed.includes(a.iata),
        );
        const routes = await Promise.all(
            airports.map((airport) =>
                run.call(
                    this.deps.routing.name,
                    'calculateRoute:airportAccess',
                    `airport:${airport.iata}`,
                    () =>
                        this.deps.routing.calculateRoute({
                            from: criteria.origin.coordinates,
                            to: airport.coordinates,
                        }),
                ),
            ),
        );
        const out: AirportAccess[] = [];
        airports.forEach((airport, i) => {
            const route = routes[i];
            if (route) out.push({ airport, route });
        });
        return out;
    }

    private async evaluateDestination(
        destination: Destination,
        criteria: SearchCriteria,
        allStays: readonly StayDates[],
        access: readonly AirportAccess[],
        vehicle: Vehicle,
        wantsFlights: boolean,
        wantsCar: boolean,
        run: SearchRun,
    ): Promise<Evaluated[]> {
        const prefs = hasFlightPreferences(criteria.transport.flights)
            ? criteria.transport.flights
            : undefined;
        const flightsPossible =
            wantsFlights && access.length > 0 && destination.airports.length > 0;
        const carRoute = await this.carRouteFor(
            destination,
            criteria,
            flightsPossible,
            wantsCar,
            run,
        );
        if (!carRoute && !flightsPossible) return [];

        const shortlist = await this.shortlistStays(
            destination,
            criteria,
            allStays,
            access,
            vehicle,
            prefs,
            carRoute,
            flightsPossible,
            run,
        );
        if (shortlist.excluded) {
            run.excluded.push({ destinationId: destination.id, reason: shortlist.excluded });
            return [];
        }

        const ctx: DestinationContext = {
            destination,
            criteria,
            access,
            vehicle,
            prefs,
            currency: criteria.budget.currency,
            carRoute,
            flightsPossible,
            parkOnly:
                criteria.accommodation.parkHotelsOnly === true && destination.park !== undefined,
            run,
            tally: {
                parkHotelsFiltered: false,
                flightMisses: new Set<string>(),
                flightsSeen: 0,
                staysSeen: 0,
                staysEligible: 0,
                cheapestOverBudget: Number.POSITIVE_INFINITY,
            },
        };
        const results: Evaluated[] = [];
        await Promise.all(shortlist.stays.map((stay) => this.evaluateStay(stay, ctx, results)));
        if (results.length === 0 && !run.excluded.some((e) => e.destinationId === destination.id)) {
            run.excluded.push({ destinationId: destination.id, reason: exclusionReason(ctx) });
        }
        return results;
    }

    /** The car route to a destination, if it is reachable and within the driving limit. */
    private async carRouteFor(
        destination: Destination,
        criteria: SearchCriteria,
        flightsPossible: boolean,
        wantsCar: boolean,
        run: SearchRun,
    ): Promise<RouteResult | undefined> {
        if (!wantsCar || !destination.reachableByCar) return undefined;
        const route = await run.call(
            this.deps.routing.name,
            'calculateRoute:destination',
            destination.id,
            () =>
                this.deps.routing.calculateRoute({
                    from: criteria.origin.coordinates,
                    to: destination.cityCentre,
                }),
        );
        if (!route) return undefined;
        const failures = drivingFailures(route.durationMinutes, criteria.transport.driving);
        if (failures.length === 0) return route;
        if (!flightsPossible) {
            run.excluded.push({ destinationId: destination.id, reason: failures.join('; ') });
        }
        return undefined;
    }

    /**
     * Indicative phase: the stays to evaluate live. Returns a reason instead when the
     * destination is excluded on prices alone.
     */
    private async shortlistStays(
        destination: Destination,
        criteria: SearchCriteria,
        allStays: readonly StayDates[],
        access: readonly AirportAccess[],
        vehicle: Vehicle,
        prefs: SearchCriteria['transport']['flights'],
        carRoute: RouteResult | undefined,
        flightsPossible: boolean,
        run: SearchRun,
    ): Promise<{ stays: readonly StayDates[]; excluded?: string }> {
        if (!flightsPossible) return { stays: allStays };
        const currency = criteria.budget.currency;
        const indicative = await Promise.all(
            allStays.map((stay) =>
                run.call(this.deps.flights.name, 'searchIndicative', destination.id, () =>
                    this.deps.flights.searchIndicative({
                        originAirports: access.map((a) => a.airport.iata),
                        destinationAirports: destination.airports.map((a) => a.iata),
                        outboundDate: stay.checkIn,
                        returnDate: stay.checkOut,
                        travellers: criteria.travellers,
                        currency,
                        ...(prefs ? { preferences: prefs } : {}),
                    }),
                ),
            ),
        );
        if (!indicative.some((r) => r !== undefined)) {
            // Indicative pricing failed everywhere: try a few spread-out dates live instead of all of them,
            // so one provider outage doesn't turn into hundreds of calls (and rate limits) downstream.
            // A car trip keeps every date.
            return {
                stays: carRoute
                    ? allStays
                    : spreadStays(allStays, Math.max(1, this.config.liveStaysPerDestination)),
            };
        }
        const priced = this.pricedStays(allStays, indicative, access, vehicle, prefs, currency);
        const cheapest = priced[0]?.cheapest ?? Number.POSITIVE_INFINITY;
        const ceiling = criteria.budget.amountMinor * (1 + this.config.budgetTolerance);
        if (!carRoute && cheapest === Number.POSITIVE_INFINITY) {
            return { stays: allStays, excluded: noFlightPricesReason(indicative, prefs) };
        }
        if (!carRoute && cheapest > ceiling) {
            return {
                stays: allStays,
                excluded: 'Flights alone exceed your budget (indicative prices)',
            };
        }
        const shortlisted = priced
            .filter((p) => p.cheapest !== Number.POSITIVE_INFINITY)
            .slice(0, this.config.liveStaysPerDestination);
        // Car trips are evaluated on the same shortlisted dates (plus all dates if no flight dates survived).
        return { stays: shortlisted.length > 0 ? shortlisted.map((p) => p.stay) : allStays };
    }

    /** Each stay with its cheapest indicative cost (flight plus airport access), cheapest first. */
    private pricedStays(
        allStays: readonly StayDates[],
        indicative: readonly (readonly IndicativeFlightResult[] | undefined)[],
        access: readonly AirportAccess[],
        vehicle: Vehicle,
        prefs: SearchCriteria['transport']['flights'],
        currency: SearchCriteria['budget']['currency'],
    ): { stay: StayDates; cheapest: number }[] {
        return allStays
            .map((stay, i) => {
                const nights = daysBetween(stay.checkIn, stay.checkOut);
                const results = (indicative[i] ?? []).filter((r) => !prefs?.directOnly || r.direct);
                const costs = results.map((r) => {
                    const acc = access.find((a) => a.airport.iata === r.originAirport);
                    const accessCost = acc
                        ? sumMoney(
                              airportAccessCosts(this.accessInput(acc, vehicle, nights)).map(
                                  (c) => c.amount,
                              ),
                              currency,
                          )
                        : eur(0);
                    return addMoney(r.price.amount, accessCost).amountMinor;
                });
                return {
                    stay,
                    cheapest: costs.length ? Math.min(...costs) : Number.POSITIVE_INFINITY,
                };
            })
            .sort(
                (a, b) => a.cheapest - b.cheapest || a.stay.checkIn.localeCompare(b.stay.checkIn),
            );
    }

    /** Scores every eligible (transport × accommodation) combination for one stay into `results`. */
    private async evaluateStay(
        stay: StayDates,
        ctx: DestinationContext,
        results: Evaluated[],
    ): Promise<void> {
        const { destination, criteria, run, tally } = ctx;
        const nights = daysBetween(stay.checkIn, stay.checkOut);
        const tickets = this.ticketsFor(ctx, nights);
        const [offers, flightOffers, weather] = await this.fetchStayInputs(stay, ctx);
        if (!offers) return;
        tally.staysSeen += offers.length;

        const eligible = this.eligibleOffers(offers, ctx);
        if (eligible.length === 0) return;
        tally.staysEligible += eligible.length;

        const options = this.transportChoices(ctx, nights, flightOffers);
        const food = estimateFoodCost(
            destination.dailyFoodCostPerAdult,
            criteria.travellers,
            nights,
        );
        const extras = tickets ? [tickets.item, food] : [food];
        for (const option of options) {
            for (const stayOffer of eligible) {
                const e = this.scoreTrip(
                    run.searchId,
                    criteria,
                    destination,
                    stay,
                    option,
                    stayOffer,
                    weather ?? null,
                    extras,
                    nights,
                    option.reasons ?? [],
                    (total) => {
                        tally.cheapestOverBudget = Math.min(tally.cheapestOverBudget, total);
                    },
                );
                if (e) results.push(e);
            }
        }
    }

    private ticketsFor(ctx: DestinationContext, nights: number) {
        const { destination, criteria, currency } = ctx;
        if (!destination.park || criteria.parkTickets?.include === false) return null;
        return estimateParkTickets(
            destination.park,
            criteria.travellers,
            criteria.parkTickets?.days ?? nights,
            currency,
        );
    }

    /** Accommodation, live flights and forecast for one stay, fetched together. */
    private fetchStayInputs(stay: StayDates, ctx: DestinationContext) {
        const { destination, criteria, access, currency, flightsPossible, parkOnly, prefs, run } =
            ctx;
        return Promise.all([
            run.call(this.deps.accommodation.name, 'search', destination.id, () =>
                this.deps.accommodation.search({
                    locationId: destination.id,
                    locationName: `${destination.name.replace(/ \(.*\)$/, '')}, ${destination.country}`,
                    countryCode: destination.countryCode,
                    ...(parkOnly && destination.park
                        ? {
                              wantedPropertyNames: destination.park.officialHotels.map(
                                  (h) => h.name,
                              ),
                          }
                        : {}),
                    centre: destination.cityCentre,
                    ...(destination.beach ? { beach: destination.beach } : {}),
                    checkIn: stay.checkIn,
                    checkOut: stay.checkOut,
                    travellers: criteria.travellers,
                    types: criteria.accommodation.types,
                    currency,
                }),
            ),
            flightsPossible
                ? run.call(this.deps.flights.name, 'searchLive', destination.id, () =>
                      this.deps.flights.searchLive({
                          originAirports: access.map((a) => a.airport.iata),
                          destinationAirports: destination.airports.map((a) => a.iata),
                          outboundDate: stay.checkIn,
                          returnDate: stay.checkOut,
                          travellers: criteria.travellers,
                          currency,
                          ...(prefs ? { preferences: prefs } : {}),
                      }),
                  )
                : Promise.resolve(undefined),
            run.call(this.deps.weather.name, 'getForecast', destination.id, () =>
                this.deps.weather.getForecast({
                    locationId: destination.id,
                    coordinates: destination.coordinates,
                    startDate: stay.checkIn,
                    endDate: stay.checkOut,
                }),
            ),
        ]);
    }

    /** Offers that are current, in the search currency, meet the requirements and (if asked) are official park hotels. */
    private eligibleOffers(
        offers: readonly AccommodationOffer[],
        ctx: DestinationContext,
    ): AccommodationOffer[] {
        const { destination, criteria, run, tally, parkOnly, currency } = ctx;
        return offers.filter((o) => {
            if (isExpired(o.price.attribution, run.now) || o.price.amount.currency !== currency) {
                run.expiredOffersDropped += isExpired(o.price.attribution, run.now) ? 1 : 0;
                return false;
            }
            if (accommodationFailures(o, criteria.accommodation, criteria.requirements).length > 0)
                return false;
            // Theme parks: only the park's official hotels when asked.
            if (parkOnly && destination.park && !officialParkHotel(destination.park, o.name)) {
                tally.parkHotelsFiltered = true;
                return false;
            }
            return true;
        });
    }

    /** The ways to travel for one stay: the car route and each flight that fits the preferences. */
    private transportChoices(
        ctx: DestinationContext,
        nights: number,
        flightOffers: readonly FlightOffer[] | undefined,
    ): TransportChoice[] {
        const options: TransportChoice[] = [];
        if (ctx.carRoute) {
            options.push({
                transport: {
                    mode: 'CAR',
                    route: ctx.carRoute,
                    doorToDoorMinutes: ctx.carRoute.durationMinutes,
                },
                items: carTripCosts(ctx.carRoute, ctx.vehicle),
            });
        }
        for (const offer of flightOffers ?? []) {
            const choice = this.flightChoice(offer, ctx, nights);
            if (choice) options.push(choice);
        }
        return options;
    }

    /** One live flight as a transport choice, or undefined when it cannot be used. */
    private flightChoice(
        offer: FlightOffer,
        ctx: DestinationContext,
        nights: number,
    ): TransportChoice | undefined {
        const { run, tally, access, vehicle, currency, prefs } = ctx;
        if (isExpired(offer.price.attribution, run.now)) {
            run.expiredOffersDropped++;
            return undefined;
        }
        if (offer.price.amount.currency !== currency) return undefined;
        const acc = access.find((a) => a.airport.iata === offer.originAirport);
        if (!acc) return undefined;
        tally.flightsSeen++;
        const check = flightPreferenceCheck(offer, prefs);
        if (check.failures.length > 0) {
            check.failures.forEach((f) => tally.flightMisses.add(f));
            return undefined;
        }
        return {
            reasons: [
                ...(offer.price.confidence === 'ESTIMATED'
                    ? [
                          {
                              tone: 'WARNING' as const,
                              code: 'FLIGHT_ESTIMATED',
                              message:
                                  'No recent flight prices for this route: the flight cost is our estimate',
                          },
                      ]
                    : []),
                ...unconfirmedReasons(check),
            ],
            transport: {
                mode: 'FLIGHT',
                offer,
                departureAirport: acc.airport,
                airportAccess: acc.route,
                doorToDoorMinutes: this.flightDoorToDoor(acc.route, offer),
            },
            items: [
                flightCostItem(offer),
                ...airportAccessCosts(this.accessInput(acc, vehicle, nights)),
            ],
        };
    }

    /** Door-to-door minutes for a flight: drive to the airport, airport time, flight, transfer. */
    private flightDoorToDoor(route: RouteResult, offer: FlightOffer): number {
        return (
            route.durationMinutes +
            this.config.airportOverheadMinutes +
            offer.outbound.durationMinutes +
            this.config.arrivalTransferMinutes
        );
    }

    /** Costs + Match Score for one (transport option × stay). Null when beyond the budget tolerance. */
    private scoreTrip(
        searchId: string,
        criteria: SearchCriteria,
        destination: Destination,
        stay: StayDates,
        option: { transport: TransportOption; items: CostItem[] },
        stayOffer: AccommodationOffer,
        weather: WeatherResult | null,
        extras: readonly CostItem[],
        nights: number,
        extraReasons: TripRecommendation['reasons'] = [],
        onOverBudget?: (tripTotalMinor: number) => void,
    ): Evaluated | null {
        const items: CostItem[] = [
            ...option.items,
            {
                kind: 'ACCOMMODATION',
                label: `${stayOffer.name} · ${nights} night${nights === 1 ? '' : 's'}`,
                amount: stayOffer.price.amount,
                confidence: stayOffer.price.confidence,
                attribution: stayOffer.price.attribution,
                countsTowardsBudget: true,
            },
            ...extras,
        ];
        const costs = buildCostBreakdown(items, criteria.budget);
        if (
            !evaluateBudget(costs.tripTotal, criteria.budget, this.config.budgetTolerance)
                .withinTolerance
        ) {
            onOverBudget?.(costs.tripTotal.amountMinor);
            return null;
        }
        const { score, reasons } = computeMatchScore(
            {
                criteria,
                destination,
                transport: option.transport,
                accommodation: stayOffer,
                weather,
                costs,
                budgetTolerance: this.config.budgetTolerance,
            },
            this.config.weights,
        );
        return {
            id: `${searchId}:${destination.id}:${stay.checkIn}:${option.transport.mode}:${option.transport.mode === 'FLIGHT' ? option.transport.offer.originAirport : 'car'}:${stayOffer.propertyId}`,
            destination,
            stay,
            transport: option.transport,
            accommodation: stayOffer,
            weather,
            costs,
            score,
            reasons: [...extraReasons, ...parkReasons(destination, stayOffer, extras), ...reasons],
            extras,
        };
    }

    /**
     * Live check of the best results' flight prices (only when a verifier is configured).
     * A verified price replaces the indicative one and the trip is re-scored; if the live
     * search finds nothing, the trip keeps its indicative price with a warning.
     */
    private async verifyFlights(
        best: readonly { rec: TripRecommendation; top: Evaluated }[],
        criteria: SearchCriteria,
        vehicle: Vehicle,
        run: SearchRun,
    ): Promise<void> {
        const verifier = this.deps.flightVerifier;
        if (!verifier) return;
        const prefs = hasFlightPreferences(criteria.transport.flights)
            ? criteria.transport.flights
            : undefined;
        const targets = best
            .slice(0, this.config.verifyTop)
            .filter(
                (b) =>
                    b.top.transport.mode === 'FLIGHT' &&
                    b.top.transport.offer.price.confidence !== 'VERIFIED',
            );
        const unconfirmedFlags = await Promise.all(
            targets.map((b) => this.verifyTarget(b, criteria, vehicle, run, verifier, prefs)),
        );
        const unconfirmed = unconfirmedFlags.filter(Boolean).length;
        if (targets.length > 0) {
            const unconfirmedNote = unconfirmed ? `; ${unconfirmed} couldn't be confirmed` : '';
            run.notices.add(
                `Flight prices of the top ${targets.length} result${targets.length === 1 ? ' were' : 's were'} checked live${unconfirmedNote}. Others are from recent searches.`,
            );
        }
    }

    /** Checks one result's flight live. Returns true when the price could not be confirmed. */
    private async verifyTarget(
        b: { rec: TripRecommendation; top: Evaluated },
        criteria: SearchCriteria,
        vehicle: Vehicle,
        run: SearchRun,
        verifier: LiveFlightProvider,
        prefs: SearchCriteria['transport']['flights'],
    ): Promise<boolean> {
        const t = b.top.transport;
        if (t.mode !== 'FLIGHT') return false;
        const offers = await run.call(verifier.name, 'verifyFlight', b.top.destination.id, () =>
            verifier.searchLive({
                originAirports: [t.offer.originAirport],
                destinationAirports: [t.offer.destinationAirport],
                outboundDate: b.top.stay.checkIn,
                returnDate: b.top.stay.checkOut,
                travellers: criteria.travellers,
                currency: criteria.budget.currency,
                ...(prefs ? { preferences: prefs } : {}),
            }),
        );
        const live = offers
            ?.filter(
                (o) =>
                    !isExpired(o.price.attribution, run.now) &&
                    o.price.amount.currency === criteria.budget.currency,
            )
            .find((o) => flightPreferenceCheck(o, prefs).failures.length === 0);
        if (!live) {
            b.rec = {
                ...b.rec,
                reasons: [
                    {
                        tone: 'WARNING',
                        code: 'FLIGHT_UNVERIFIED',
                        message:
                            "Couldn't confirm this flight price live; it's from recent searches",
                    },
                    ...b.rec.reasons,
                ],
            };
            return true;
        }
        this.applyLiveFlight(
            b,
            live,
            flightPreferenceCheck(live, prefs),
            criteria,
            vehicle,
            run,
            verifier.name,
        );
        return false;
    }

    /** Re-scores a trip with its live flight price, or flags it when the price breaks the budget. */
    private applyLiveFlight(
        b: { rec: TripRecommendation; top: Evaluated },
        live: FlightOffer,
        liveCheck: FlightPreferenceCheck,
        criteria: SearchCriteria,
        vehicle: Vehicle,
        run: SearchRun,
        verifierName: string,
    ): void {
        const t = b.top.transport;
        const nights = daysBetween(b.top.stay.checkIn, b.top.stay.checkOut);
        const acc = { airport: t.departureAirport, route: t.airportAccess };
        const transport: TransportOption = {
            ...t,
            offer: live,
            doorToDoorMinutes: this.flightDoorToDoor(acc.route, live),
        };
        const rescored = this.scoreTrip(
            run.searchId,
            criteria,
            b.top.destination,
            b.top.stay,
            {
                transport,
                items: [
                    flightCostItem(live),
                    ...airportAccessCosts(this.accessInput(acc, vehicle, nights)),
                ],
            },
            b.top.accommodation,
            b.top.weather,
            b.top.extras,
            nights,
            [
                {
                    tone: 'POSITIVE',
                    code: 'FLIGHT_VERIFIED',
                    message: `Flight price checked live (${verifierName === 'serpapi-google-flights' ? 'Google Flights' : verifierName})`,
                },
                ...unconfirmedReasons(liveCheck),
            ],
        );
        if (!rescored) {
            b.rec = {
                ...b.rec,
                reasons: [
                    {
                        tone: 'WARNING',
                        code: 'FLIGHT_LIVE_OVER_BUDGET',
                        message: 'The live flight price takes this trip over your budget',
                    },
                    ...b.rec.reasons,
                ],
            };
            return;
        }
        b.top = rescored;
        b.rec = { ...toRecommendation(rescored), alternatives: b.rec.alternatives };
    }

    private accessInput(acc: AirportAccess, vehicle: Vehicle, nights: number) {
        return {
            airportName: acc.airport.name,
            route: acc.route,
            vehicle,
            parkingDays: nights + 1,
            ...(this.config.airportParkingPerDay
                ? { parkingPerDay: this.config.airportParkingPerDay }
                : {}),
        };
    }
}

const source = (provider: string) => ({ provider, mock: provider.startsWith('mock') });

function sourcesOf(deps: SearchEngineDeps) {
    return {
        flights: source(deps.flights.name),
        accommodation: source(deps.accommodation.name),
        routing: source(deps.routing.name),
        weather: source(deps.weather.name),
        ...(deps.flightVerifier ? { flightCheck: source(deps.flightVerifier.name) } : {}),
    };
}

function toRecommendation(e: Evaluated): Omit<TripRecommendation, 'alternatives'> {
    const { id, name, country, countryCode, scores } = e.destination;
    return {
        id: e.id.split(':').slice(0, 2).join(':'),
        destination: { id, name, country, countryCode, scores },
        checkIn: e.stay.checkIn,
        checkOut: e.stay.checkOut,
        nights: daysBetween(e.stay.checkIn, e.stay.checkOut),
        transport: e.transport,
        accommodation: e.accommodation,
        weather: e.weather,
        costs: e.costs,
        score: e.score,
        reasons: e.reasons,
    };
}

/** Each destination's best trip (sorted per destination), ranked best first, with its alternatives. */
function rankDestinations(
    perDestination: Evaluated[][],
    all: readonly Destination[],
    run: SearchRun,
    maxAlternatives: number,
): { rec: TripRecommendation; top: Evaluated }[] {
    const names = new Map(all.map((d) => [d.id, d.name]));
    run.excluded.forEach((e, i) => {
        const name = names.get(e.destinationId);
        if (name && !e.name) run.excluded[i] = { ...e, name };
    });
    const ranked: { rec: TripRecommendation; top: Evaluated }[] = [];
    for (const evaluated of perDestination) {
        if (evaluated.length === 0) continue;
        evaluated.sort(compareRanked);
        const top = evaluated[0]!;
        ranked.push({
            top,
            rec: {
                ...toRecommendation(top),
                alternatives: alternativesFor(top, evaluated, maxAlternatives),
            },
        });
    }
    ranked.sort((a, b) => compareRanked(a.rec, b.rec));
    return ranked;
}

/** Best option per (dates, transport mode) other than the chosen one. Enables car-vs-flight and date comparison. */
function alternativesFor(
    top: Evaluated,
    all: readonly Evaluated[],
    max: number,
): TripAlternative[] {
    const seen = new Set<string>([`${top.stay.checkIn}|${top.transport.mode}`]);
    const out: TripAlternative[] = [];
    for (const e of all) {
        const key = `${e.stay.checkIn}|${e.transport.mode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            checkIn: e.stay.checkIn,
            checkOut: e.stay.checkOut,
            mode: e.transport.mode,
            tripTotal: e.costs.tripTotal,
            doorToDoorMinutes: e.transport.doorToDoorMinutes,
            score: e.score.total,
        });
        if (out.length >= max) break;
    }
    return out;
}

/** The official park hotels, when asked for, and the park tickets (included or not) for one trip. */
function parkReasons(
    destination: Destination,
    stayOffer: AccommodationOffer,
    extras: readonly CostItem[],
): MatchReason[] {
    const out: MatchReason[] = [];
    if (!destination.park) return out;
    const official = officialParkHotel(destination.park, stayOffer.name);
    if (official) {
        out.push({
            tone: 'POSITIVE',
            code: 'PARK_HOTEL',
            message: `Official ${destination.park.name} hotel${official.atParkEntrance ? ', at the park entrance' : ''}`,
        });
    }
    const t = extras.find((i) => i.kind === 'PARK_TICKETS');
    out.push(
        t
            ? {
                  tone: 'POSITIVE',
                  code: 'PARK_TICKETS',
                  message: `${t.label} included (estimate)`,
              }
            : {
                  tone: 'WARNING',
                  code: 'PARK_TICKETS_EXCLUDED',
                  message: 'Park tickets not included',
              },
    );
    return out;
}

function noFlightPricesReason(
    indicative: readonly (readonly IndicativeFlightResult[] | undefined)[],
    prefs: SearchCriteria['transport']['flights'],
): string {
    const hadAny = indicative.some((r) => (r?.length ?? 0) > 0);
    return hadAny && prefs?.directOnly
        ? 'No direct flights found near your dates'
        : 'No recent flight prices found near your dates';
}

/** Says the real reason a destination produced no trips, in the order things are checked. */
function exclusionReason(ctx: DestinationContext): string {
    const { destination, carRoute, flightsPossible, tally, currency } = ctx;
    if (tally.parkHotelsFiltered && destination.park) {
        return `No official ${destination.park.name} hotel had rooms within your budget and requirements`;
    }
    if (!carRoute && flightsPossible && tally.flightsSeen === 0) {
        return 'No flights found for your dates';
    }
    if (
        !carRoute &&
        tally.flightMisses.size > 0 &&
        tally.cheapestOverBudget === Number.POSITIVE_INFINITY
    ) {
        return `No flights matching your flight preferences (${[...tally.flightMisses].join('; ').toLowerCase()})`;
    }
    if (tally.staysSeen === 0) return 'No places to stay found for your dates';
    if (tally.staysEligible === 0) return 'No stay matched your accommodation requirements';
    if (tally.cheapestOverBudget !== Number.POSITIVE_INFINITY) {
        const cheapest = Math.round(tally.cheapestOverBudget / 100) * 100;
        return `Over your budget: the cheapest trip here is about ${formatMoney({ amountMinor: cheapest, currency })}`;
    }
    return 'No trip within budget matched your requirements';
}

const OPERATION_LABEL: Record<string, string> = {
    searchIndicative: 'Indicative flight pricing',
    searchLive: 'Flight pricing',
    search: 'Accommodation availability',
    getForecast: 'Weather information',
    'calculateRoute:destination': 'Driving routes',
    'calculateRoute:airportAccess': 'Airport access routes',
    verifyFlight: 'Live flight price check',
};

function airportAccessNotice(codes: readonly string[]): string {
    const many = codes.length !== 1;
    return `Couldn't calculate the drive to ${codes.join(', ')} airport${many ? 's' : ''}, so flights from ${many ? 'them were' : 'it were'} left out.`;
}

function unavailableNotice(label: string, n: number): string {
    if (n > 0) return `${label} was unavailable for ${n} destination${n === 1 ? '' : 's'}.`;
    return `${label} was unavailable.`;
}

export function summariseIssues(issues: readonly ProviderIssue[]): string[] {
    const byOp = new Map<string, Set<string>>();
    for (const i of issues) {
        const set = byOp.get(i.operation) ?? new Set<string>();
        set.add(i.destinationId ?? '*');
        byOp.set(i.operation, set);
    }
    return [...byOp.entries()].map(([op, dests]) => {
        if (op === 'calculateRoute:airportAccess') {
            return airportAccessNotice([...dests].map((d) => d.replace('airport:', '')));
        }
        const label = OPERATION_LABEL[op] ?? op;
        return unavailableNotice(label, [...dests].filter((d) => d !== '*').length);
    });
}

/** Preferences the provider couldn't confirm become a warning on the trip (the trip itself stays). */
function unconfirmedReasons(check: FlightPreferenceCheck): MatchReason[] {
    if (check.unconfirmed.length === 0) return [];
    const list = check.unconfirmed.join(' and ');
    return [
        {
            tone: 'WARNING',
            code: 'FLIGHT_PREFS_UNCONFIRMED',
            message: `Not confirmed that the ${list}; check before booking`,
        },
    ];
}

const totalMinor = (e: Evaluated): number => e.costs.tripTotal.amountMinor;

/** How well a trip uses the budget: the quality score aside, with extra weight on a comfortable stay. */
function qualityOf(e: Evaluated): number {
    return Math.round(
        0.7 * (e.score.withoutPrice ?? e.score.total) + 0.3 * comfortScore(e.accommodation),
    );
}

function byQuality(a: Evaluated, b: Evaluated): number {
    return qualityOf(b) - qualityOf(a) || compareRanked(a, b) || totalMinor(b) - totalMinor(a);
}

/** The lowest-cost trip per destination, cheapest first. */
function cheapestPerDestination(perDestination: readonly (readonly Evaluated[])[]): Evaluated[] {
    const cheapest: Evaluated[] = [];
    for (const list of perDestination) {
        if (list.length === 0) continue;
        const c = [...list].sort((a, b) => totalMinor(a) - totalMinor(b) || compareRanked(a, b))[0];
        if (c) cheapest.push(c);
    }
    return cheapest.sort((a, b) => totalMinor(a) - totalMinor(b) || compareRanked(a, b));
}

/** The best trip in a destination that spends most of the budget, else the best one under it. */
function bestFullBudgetTrip(
    list: readonly Evaluated[],
    criteria: SearchCriteria,
    floor: number,
): Evaluated | undefined {
    const within = list.filter((e) => totalMinor(e) <= criteria.budget.amountMinor);
    const band = within.filter((e) => totalMinor(e) >= criteria.budget.amountMinor * floor);
    // Prefer trips that really use the budget (≥ floor); fall back to the best below it.
    return [...band].sort(byQuality)[0] ?? [...within].sort(byQuality)[0];
}

/** One trip per destination that makes the most of the budget, those spending most of it first. */
function fullBudgetPerDestination(
    perDestination: readonly (readonly Evaluated[])[],
    criteria: SearchCriteria,
    floor: number,
): Evaluated[] {
    const fullBudget: Evaluated[] = [];
    for (const list of perDestination) {
        if (list.length === 0) continue;
        const f = bestFullBudgetTrip(list, criteria, floor);
        if (f) fullBudget.push(f);
    }
    const inBand = (e: Evaluated) => (totalMinor(e) >= criteria.budget.amountMinor * floor ? 1 : 0);
    return fullBudget.sort(
        (a, b) => inBand(b) - inBand(a) || qualityOf(b) - qualityOf(a) || compareRanked(a, b),
    );
}

function tagged(e: Evaluated, kind: string, reason: MatchReason): TripRecommendation {
    const rec = toRecommendation(e);
    return {
        ...rec,
        id: `${rec.id}:${kind}`,
        reasons: [reason, ...rec.reasons],
        alternatives: [],
    };
}

/**
 * Budget views across destinations, one trip each:
 * - cheapest: the lowest trip total per destination, cheapest first;
 * - fullBudget: per destination, the best trip that spends most of the budget (between
 *   `fullBudgetFloor` and 100% of it) judged on everything except price plus the comfort
 *   of the stay (stars, rating); destinations with no trip in that band come last.
 */
function budgetPicks(
    perDestination: readonly (readonly Evaluated[])[],
    criteria: SearchCriteria,
    size: number,
    floor: number,
): BudgetPicks {
    if (size <= 0) return { cheapest: [], fullBudget: [] };
    const used = (e: Evaluated) => Math.round((totalMinor(e) / criteria.budget.amountMinor) * 100);
    return {
        cheapest: cheapestPerDestination(perDestination)
            .slice(0, size)
            .map((e) =>
                tagged(e, 'cheapest', {
                    tone: 'POSITIVE',
                    code: 'PICK_CHEAPEST',
                    message: `Cheapest trip we found here (${used(e)}% of your budget)`,
                }),
            ),
        fullBudget: fullBudgetPerDestination(perDestination, criteria, floor)
            .slice(0, size)
            .map((e) =>
                tagged(e, 'full-budget', {
                    tone: 'POSITIVE',
                    code: 'PICK_FULL_BUDGET',
                    message: `Makes the most of your budget: ${used(e)}% of it${staySuffix(e.accommodation.stars)}`,
                }),
            ),
    };
}

function staySuffix(stars: number | undefined): string {
    return stars ? ` for a ${stars}★ stay` : '';
}
