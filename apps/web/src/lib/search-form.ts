import type {
    AccommodationType,
    Requirement,
    RequirementPriority,
    SearchCriteria,
    SearchRequest,
    TransportMode,
    Region,
    TravelIntent,
    Weekday,
} from './types';
import {
    countPatternTrips,
    patternNights,
    presetFor,
    WEEKDAY_PRESETS,
    type TimeOfDay,
    type WeekdayPreset,
} from './trip-preferences';

/**
 * Editable state behind the search form. It converts to the API request and back from
 * stored criteria, so any past search (or a relaxation suggestion) can be reopened and
 * changed without starting from scratch.
 */

export interface OriginOption {
    readonly id: string;
    readonly label: string;
    readonly lat: number;
    readonly lon: number;
}

/** V1 origin market is Portugal. */
export const ORIGINS: readonly OriginOption[] = [
    { id: 'lisbon', label: 'Lisbon', lat: 38.7223, lon: -9.1393 },
    { id: 'porto', label: 'Porto', lat: 41.1579, lon: -8.6291 },
    { id: 'faro', label: 'Faro', lat: 37.0194, lon: -7.9304 },
    { id: 'coimbra', label: 'Coimbra', lat: 40.2033, lon: -8.4103 },
    { id: 'braga', label: 'Braga', lat: 41.5454, lon: -8.4265 },
    { id: 'aveiro', label: 'Aveiro', lat: 40.6405, lon: -8.6538 },
    { id: 'leiria', label: 'Leiria', lat: 39.7436, lon: -8.8071 },
    { id: 'setubal', label: 'Setúbal', lat: 38.5244, lon: -8.8882 },
    { id: 'quinta-do-anjo', label: 'Quinta do Anjo', lat: 38.566, lon: -8.94 },
    { id: 'evora', label: 'Évora', lat: 38.5714, lon: -7.9135 },
];

export type RequirementSource = 'USER' | 'AI_INTERPRETATION';
export type FormRequirement = Requirement & { readonly source: RequirementSource };

export interface SearchFormState {
    originId: string;
    dateMode: 'EXACT' | 'FLEXIBLE';
    checkIn: string;
    checkOut: string;
    windowStart: string;
    windowEnd: string;
    nights: number;
    /** Flexible windows: which days of the week to travel. */
    weekdayPreset: WeekdayPreset;
    departDay: number;
    returnDay: number;
    adults: number;
    childAges: number[];
    infantAges: number[];
    budget: number;
    modes: TransportMode[];
    /** Flights: hard filters. Empty time lists = any time. */
    directOnly: boolean;
    outboundTimes: TimeOfDay[];
    returnTimes: TimeOfDay[];
    maxDrivingHours: string;
    preferredDrivingHours: string;
    useVehicle: boolean;
    fuelType: 'PETROL' | 'DIESEL' | 'LPG' | 'ELECTRIC';
    consumption: string;
    fuelPrice: string;
    destinationMode: 'DISCOVER' | 'KNOWN';
    destinationIds: string[];
    /** "Surprise me": parts of the world to search; empty = anywhere. */
    regions: Region[];
    requirements: FormRequirement[];
    accommodationTypes: AccommodationType[];
    minStars: string;
    minRating: string;
    maxDistanceToCentreKm: string;
    maxDistanceToBeachM: string;
    minAvgHighC: string;
    preferWarm: boolean;
    /** Theme parks */
    parkHotelsOnly: boolean;
    includeParkTickets: boolean;
    /** '' = one day per night */
    parkDays: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function defaultForm(today: Date = new Date()): SearchFormState {
    const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const nextMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
    const checkIn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 14));
    const checkOut = new Date(checkIn.getTime() + 4 * 86_400_000);
    return {
        originId: 'lisbon',
        dateMode: 'FLEXIBLE',
        checkIn: iso(checkIn),
        checkOut: iso(checkOut),
        windowStart: iso(nextMonthStart),
        windowEnd: iso(nextMonthEnd),
        nights: 4,
        weekdayPreset: 'ANY',
        departDay: 4,
        returnDay: 0,
        adults: 2,
        childAges: [],
        infantAges: [],
        budget: 1000,
        modes: ['FLIGHT', 'CAR'],
        directOnly: false,
        outboundTimes: [],
        returnTimes: [],
        maxDrivingHours: '',
        preferredDrivingHours: '',
        useVehicle: false,
        fuelType: 'DIESEL',
        consumption: '6.5',
        fuelPrice: '1.65',
        destinationMode: 'DISCOVER',
        destinationIds: [],
        regions: [],
        requirements: [],
        accommodationTypes: ['HOTEL', 'APARTMENT'],
        minStars: '',
        minRating: '',
        maxDistanceToCentreKm: '',
        maxDistanceToBeachM: '',
        minAvgHighC: '',
        preferWarm: false,
        parkHotelsOnly: false,
        includeParkTickets: true,
        parkDays: '',
    };
}

const optNumber = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
};

export function nightsBetween(checkIn: string, checkOut: string): number {
    return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
}

/** The chosen days of the week (flexible windows), or null for any days. */
export function weekdaysOf(form: SearchFormState): { departOn: number; returnOn: number } | null {
    if (form.dateMode !== 'FLEXIBLE' || form.weekdayPreset === 'ANY') return null;
    const preset = WEEKDAY_PRESETS.find((p) => p.value === form.weekdayPreset);
    if (preset?.departOn !== undefined && preset.returnOn !== undefined)
        return { departOn: preset.departOn, returnOn: preset.returnOn };
    return { departOn: form.departDay, returnOn: form.returnDay };
}

export function originOf(form: SearchFormState): OriginOption {
    return ORIGINS.find((o) => o.id === form.originId) ?? (ORIGINS[0] as OriginOption);
}

export function toSearchRequest(form: SearchFormState): SearchRequest {
    const origin = originOf(form);
    const maxHours = optNumber(form.maxDrivingHours);
    const preferredMaxHours = optNumber(form.preferredDrivingHours);
    const consumption = optNumber(form.consumption);
    const fuelPrice = optNumber(form.fuelPrice);
    const minStars = optNumber(form.minStars);
    const minRating = optNumber(form.minRating);
    const centreKm = optNumber(form.maxDistanceToCentreKm);
    const beachM = optNumber(form.maxDistanceToBeachM);
    const minAvgHighC = optNumber(form.minAvgHighC);
    const parkDays = optNumber(form.parkDays);
    const days = weekdaysOf(form);
    const flying = form.modes.includes('FLIGHT');
    const flights =
        flying && (form.directOnly || form.outboundTimes.length > 0 || form.returnTimes.length > 0)
            ? {
                  ...(form.directOnly ? { directOnly: true } : {}),
                  ...(form.outboundTimes.length ? { outboundTimes: form.outboundTimes } : {}),
                  ...(form.returnTimes.length ? { returnTimes: form.returnTimes } : {}),
              }
            : undefined;
    return {
        origin: {
            label: origin.label,
            coordinates: { lat: origin.lat, lon: origin.lon },
            countryCode: 'PT',
        },
        dates:
            form.dateMode === 'EXACT'
                ? { kind: 'EXACT', checkIn: form.checkIn, checkOut: form.checkOut }
                : days
                  ? {
                        kind: 'FLEXIBLE',
                        windowStart: form.windowStart,
                        windowEnd: form.windowEnd,
                        nights: patternNights(days.departOn, days.returnOn),
                        weekdays: {
                            departOn: [days.departOn as Weekday],
                            returnOn: [days.returnOn as Weekday],
                        },
                    }
                  : {
                        kind: 'FLEXIBLE',
                        windowStart: form.windowStart,
                        windowEnd: form.windowEnd,
                        nights: form.nights,
                    },
        travellers: [
            ...Array.from({ length: form.adults }, () => ({ type: 'ADULT' as const })),
            ...form.childAges.map((age) => ({ type: 'CHILD' as const, age })),
            ...form.infantAges.map((age) => ({ type: 'INFANT' as const, age })),
        ],
        budget: { amount: form.budget, currency: 'EUR' },
        transport: {
            modes: form.modes,
            ...(flights ? { flights } : {}),
            ...(maxHours !== undefined || preferredMaxHours !== undefined
                ? {
                      driving: {
                          ...(maxHours !== undefined ? { maxHours } : {}),
                          ...(preferredMaxHours !== undefined ? { preferredMaxHours } : {}),
                      },
                  }
                : {}),
            ...(form.useVehicle && consumption !== undefined && fuelPrice !== undefined
                ? {
                      vehicle: {
                          fuelType: form.fuelType,
                          consumptionPer100Km: consumption,
                          fuelPrice: { amount: fuelPrice, currency: 'EUR' },
                      },
                  }
                : {}),
        },
        destination:
            form.destinationMode === 'KNOWN' && form.destinationIds.length > 0
                ? { kind: 'KNOWN', destinationIds: form.destinationIds }
                : { kind: 'DISCOVER', ...(form.regions.length ? { regions: form.regions } : {}) },
        requirements: form.requirements.map(withoutSource),
        accommodation: {
            types: form.accommodationTypes,
            ...(minStars !== undefined ? { minStars } : {}),
            ...(minRating !== undefined ? { minRating } : {}),
            ...(centreKm !== undefined
                ? { maxDistanceToCentreM: Math.round(centreKm * 1000) }
                : {}),
            ...(beachM !== undefined ? { maxDistanceToBeachM: beachM } : {}),
            ...(form.parkHotelsOnly ? { parkHotelsOnly: true } : {}),
        },
        ...(!form.includeParkTickets || parkDays !== undefined
            ? {
                  parkTickets: {
                      include: form.includeParkTickets,
                      ...(parkDays !== undefined ? { days: Math.round(parkDays) } : {}),
                  },
              }
            : {}),
        ...(minAvgHighC !== undefined || form.preferWarm
            ? {
                  weather: {
                      ...(minAvgHighC !== undefined ? { minAvgHighC } : {}),
                      ...(form.preferWarm ? { preferWarm: true } : {}),
                  },
              }
            : {}),
    };
}

/** The form's requirement without where it came from, as the API takes it. */
function withoutSource(r: FormRequirement): Requirement {
    return r.kind === 'DESTINATION'
        ? { kind: r.kind, attribute: r.attribute, priority: r.priority }
        : { kind: r.kind, facility: r.facility, priority: r.priority };
}

/** The listed origin closest to a point (straight-line in degrees is enough at this scale). */
function nearestOrigin(point: { readonly lat: number; readonly lon: number }): OriginOption {
    let best = ORIGINS[0] as OriginOption;
    for (const o of ORIGINS) {
        if (
            Math.hypot(o.lat - point.lat, o.lon - point.lon) <
            Math.hypot(best.lat - point.lat, best.lon - point.lon)
        )
            best = o;
    }
    return best;
}

/** Stored criteria (money in minor units) → editable form. */
export function fromCriteria(
    c: SearchCriteria,
    base: SearchFormState = defaultForm(),
): SearchFormState {
    const origin =
        ORIGINS.find((o) => o.label === c.origin.label) ?? nearestOrigin(c.origin.coordinates);
    const travellers = c.travellers;
    const v = c.transport.vehicle;
    return {
        ...base,
        originId: origin.id,
        dateMode: c.dates.kind,
        ...(c.dates.kind === 'EXACT'
            ? {
                  checkIn: c.dates.checkIn,
                  checkOut: c.dates.checkOut,
                  nights: nightsBetween(c.dates.checkIn, c.dates.checkOut),
              }
            : {
                  windowStart: c.dates.windowStart,
                  windowEnd: c.dates.windowEnd,
                  nights: c.dates.nights,
              }),
        ...(c.dates.kind === 'FLEXIBLE' && c.dates.weekdays
            ? (() => {
                  const d = c.dates.weekdays.departOn[0] ?? 5;
                  const r = c.dates.weekdays.returnOn[0] ?? 0;
                  return { weekdayPreset: presetFor(d, r), departDay: d, returnDay: r };
              })()
            : { weekdayPreset: 'ANY' as const }),
        directOnly: c.transport.flights?.directOnly ?? false,
        outboundTimes: [...(c.transport.flights?.outboundTimes ?? [])],
        returnTimes: [...(c.transport.flights?.returnTimes ?? [])],
        adults: travellers.filter((t) => t.type === 'ADULT').length,
        childAges: travellers.filter((t) => t.type === 'CHILD').map((t) => t.age ?? 8),
        infantAges: travellers.filter((t) => t.type === 'INFANT').map((t) => t.age ?? 0),
        budget: Math.round(c.budget.amountMinor / 100),
        modes: [...c.transport.modes],
        maxDrivingHours: c.transport.driving?.maxHours?.toString() ?? '',
        preferredDrivingHours: c.transport.driving?.preferredMaxHours?.toString() ?? '',
        useVehicle: v !== undefined,
        ...(v
            ? {
                  fuelType: v.fuelType,
                  consumption: String(v.consumptionPer100Km),
                  fuelPrice: String(v.fuelPrice.amountMinor / 100),
              }
            : {}),
        destinationMode: c.destination.kind,
        destinationIds: c.destination.kind === 'KNOWN' ? [...c.destination.destinationIds] : [],
        regions: c.destination.kind === 'DISCOVER' ? [...(c.destination.regions ?? [])] : [],
        requirements: c.requirements.map((r) => ({ ...r, source: 'USER' as const })),
        accommodationTypes: [...c.accommodation.types],
        minStars: c.accommodation.minStars?.toString() ?? '',
        minRating: c.accommodation.minRating?.toString() ?? '',
        maxDistanceToCentreKm:
            c.accommodation.maxDistanceToCentreM !== undefined
                ? String(c.accommodation.maxDistanceToCentreM / 1000)
                : '',
        maxDistanceToBeachM: c.accommodation.maxDistanceToBeachM?.toString() ?? '',
        minAvgHighC: c.weather?.minAvgHighC?.toString() ?? '',
        preferWarm: c.weather?.preferWarm ?? false,
        parkHotelsOnly: c.accommodation.parkHotelsOnly ?? false,
        includeParkTickets: c.parkTickets?.include ?? true,
        parkDays: c.parkTickets?.days?.toString() ?? '',
    };
}

export function requirementKey(r: Requirement): string {
    return r.kind === 'DESTINATION' ? `a:${r.attribute}` : `f:${r.facility}`;
}

/** Adds or replaces a requirement (one entry per attribute/facility). */
export function upsertRequirement(
    list: readonly FormRequirement[],
    next: FormRequirement,
): FormRequirement[] {
    const key = requirementKey(next);
    const i = list.findIndex((r) => requirementKey(r) === key);
    if (i === -1) return [...list, next];
    return list.map((r, j) => (j === i ? next : r));
}

export function setPriority(r: FormRequirement, priority: RequirementPriority): FormRequirement {
    return { ...r, priority, source: 'USER' };
}

/** Applies an AI interpretation to the form. Every applied requirement stays marked as AI until the user edits it. */
export function applyIntent(
    form: SearchFormState,
    intent: TravelIntent,
    destinationIds: readonly string[] = [],
): SearchFormState {
    let next: SearchFormState = { ...form };
    if (destinationIds.length > 0)
        next = { ...next, destinationMode: 'KNOWN', destinationIds: [...new Set(destinationIds)] };
    if (intent.regions?.length && destinationIds.length === 0)
        next = { ...next, destinationMode: 'DISCOVER', regions: [...intent.regions] };
    if (intent.parkHotelsOnly) next.parkHotelsOnly = true;
    if (intent.parkDays)
        next = { ...next, includeParkTickets: true, parkDays: String(intent.parkDays) };
    for (const r of intent.requirements)
        next.requirements = upsertRequirement(next.requirements, {
            ...r,
            source: 'AI_INTERPRETATION',
        });
    if (intent.budget) next.budget = Math.round(intent.budget.amount);
    if (intent.nights) next = { ...next, nights: intent.nights };
    if (intent.adults) next.adults = intent.adults;
    if (intent.childAges) {
        next.childAges = intent.childAges.filter((a) => a >= 2);
        next.infantAges = intent.childAges.filter((a) => a < 2);
    }
    if (intent.dateWindow)
        next = {
            ...next,
            dateMode: 'FLEXIBLE',
            windowStart: intent.dateWindow.start,
            windowEnd: intent.dateWindow.end,
        };
    if (intent.transportModes) next.modes = [...intent.transportModes];
    if (intent.directFlightsOnly) next.directOnly = true;
    if (intent.outboundTimes?.length) next.outboundTimes = [...intent.outboundTimes];
    if (intent.returnTimes?.length) next.returnTimes = [...intent.returnTimes];
    const d = intent.departOn?.[0];
    const r = intent.returnOn?.[0];
    if (d !== undefined && r !== undefined)
        next = {
            ...next,
            dateMode: 'FLEXIBLE',
            weekdayPreset: presetFor(d, r),
            departDay: d,
            returnDay: r,
        };
    if (intent.maxDrivingHours) next.maxDrivingHours = String(intent.maxDrivingHours);
    if (intent.minAvgHighC !== undefined) next.minAvgHighC = String(intent.minAvgHighC);
    return next;
}

/** Client-side checks that give instant feedback; the API validates again. */
export function validateForm(
    form: SearchFormState,
): Partial<Record<keyof SearchFormState, string>> {
    const e: Partial<Record<keyof SearchFormState, string>> = {};
    if (form.dateMode === 'EXACT' && nightsBetween(form.checkIn, form.checkOut) < 1)
        e.checkOut = 'Check-out must be after check-in.';
    const days = weekdaysOf(form);
    if (days) {
        if (countPatternTrips(form.windowStart, form.windowEnd, days.departOn, days.returnOn) === 0)
            e.windowEnd = 'No trips on those days fit inside this window.';
    } else if (form.dateMode === 'FLEXIBLE') {
        if (form.nights < 1) e.nights = 'At least one night.';
        else if (nightsBetween(form.windowStart, form.windowEnd) < form.nights)
            e.windowEnd = `The window is shorter than ${form.nights} nights.`;
    }
    if (!Number.isFinite(form.budget) || form.budget <= 0) e.budget = 'Enter a budget above zero.';
    if (form.modes.length === 0) e.modes = 'Choose flight, car or both.';
    if (form.accommodationTypes.length === 0)
        e.accommodationTypes = 'Choose hotels, apartments or both.';
    if (form.adults < 1) e.adults = 'At least one adult travels.';
    if (form.destinationMode === 'KNOWN' && form.destinationIds.length === 0)
        e.destinationIds = 'Pick at least one destination.';
    const pd = optNumber(form.parkDays);
    if (pd !== undefined && (!Number.isInteger(pd) || pd < 1 || pd > 7))
        e.parkDays = 'Between 1 and 7 days.';
    return e;
}

export interface FormSectionProps {
    readonly form: SearchFormState;
    readonly update: (patch: Partial<SearchFormState>) => void;
    readonly errors: Partial<Record<keyof SearchFormState, string>>;
}
