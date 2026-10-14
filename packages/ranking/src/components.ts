import type {
    AccommodationFacility,
    AccommodationOffer,
    CostBreakdown,
    Destination,
    DestinationAttribute,
    MatchReason,
    Requirement,
    RequirementPriority,
    SearchCriteria,
    TransportOption,
    WeatherResult,
} from '@travel-where-to/domain';
import { ATTRIBUTE_PRESENT_THRESHOLD } from '@travel-where-to/domain';
import { formatMoney, subtractMoney } from '@travel-where-to/shared';
import { PRIORITY_WEIGHT } from './weights';
import { hasFacility } from './constraints';
import { ATTRIBUTE_LABEL, FACILITY_LABEL, formatDistance, formatDuration } from './labels';

export interface ComponentScore {
    readonly score: number;
    readonly reasons: MatchReason[];
}

export const clamp = (v: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, v));
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number): number =>
    y0 + ((clamp(x, Math.min(x0, x1), Math.max(x0, x1)) - x0) / (x1 - x0)) * (y1 - y0);

// ---------------- Budget ----------------

/**
 * ≤60% of budget → 100; at budget → 85; at budget × (1 + tolerance) → 40; beyond → 0.
 * Cheaper is better, but using the budget you set is not heavily punished.
 */
export function scoreBudget(
    costs: CostBreakdown,
    budget: CostBreakdown['tripTotal'],
    tolerance: number,
): ComponentScore {
    const ratio = costs.tripTotal.amountMinor / budget.amountMinor;
    let score: number;
    if (ratio <= 0.6) score = 100;
    else if (ratio <= 1) score = lerp(ratio, 0.6, 1, 100, 85);
    else if (ratio <= 1 + tolerance) score = lerp(ratio, 1, 1 + tolerance, 85, 40);
    else score = 0;
    const reasons: MatchReason[] = [];
    if (ratio <= 1) {
        reasons.push({
            tone: 'POSITIVE',
            code: 'BUDGET_WITHIN',
            message: `Within budget (${formatMoney(subtractMoney(budget, costs.tripTotal))} to spare)`,
        });
    } else {
        reasons.push({
            tone: 'WARNING',
            code: 'BUDGET_ABOVE',
            message: `${formatMoney(costs.budgetDifference)} above your budget`,
        });
    }
    return { score: Math.round(score), reasons };
}

// ---------------- Preferences (destination attributes) ----------------

function attributeReason(
    attribute: DestinationAttribute,
    priority: RequirementPriority,
    attrScore: number,
): MatchReason {
    const label = ATTRIBUTE_LABEL[attribute];
    const present = attrScore >= ATTRIBUTE_PRESENT_THRESHOLD;
    if (priority === 'AVOID') {
        if (present) {
            return {
                tone: 'WARNING',
                code: `AVOID_${attribute}`,
                message: `Known for ${label}, which you wanted to avoid`,
            };
        }
        return { tone: 'POSITIVE', code: `AVOID_${attribute}`, message: `Not known for ${label}` };
    }
    if (present) {
        return {
            tone: 'POSITIVE',
            code: `ATTR_${attribute}`,
            message: `Good for ${label} (${attrScore}/100)`,
        };
    }
    return {
        tone: 'WARNING',
        code: `ATTR_${attribute}`,
        message: `Weak for ${label} (${attrScore}/100)`,
    };
}

export function scorePreferences(
    destination: Destination,
    requirements: readonly Requirement[],
): ComponentScore {
    const reasons: MatchReason[] = [];
    let weighted = 0;
    let totalWeight = 0;
    for (const r of requirements) {
        if (r.kind !== 'DESTINATION') continue;
        const attrScore = destination.scores[r.attribute];
        const w = PRIORITY_WEIGHT[r.priority];
        weighted += w * (r.priority === 'AVOID' ? 100 - attrScore : attrScore);
        reasons.push(attributeReason(r.attribute, r.priority, attrScore));
        totalWeight += w;
    }
    // With no destination preferences every destination is equally suitable.
    const score = totalWeight === 0 ? 100 : weighted / totalWeight;
    return { score: Math.round(score), reasons };
}

// ---------------- Transport ----------------

function flightStopReason(stops: number, airport: string, durationMinutes: number): MatchReason {
    const duration = formatDuration(durationMinutes);
    if (stops === 0) {
        return {
            tone: 'POSITIVE',
            code: 'FLIGHT_DIRECT',
            message: `Direct flight from ${airport} (${duration})`,
        };
    }
    return {
        tone: 'NEUTRAL',
        code: 'FLIGHT_STOPS',
        message: `${stops}-stop flight from ${airport} (${duration})`,
    };
}

/** A driving option: the penalty for going above the preferred hours (0 when it fits). */
function driveReview(
    drive: number,
    preferredHours: number | undefined,
): { penalty: number; reason: MatchReason } {
    if (preferredHours !== undefined && drive > preferredHours * 60) {
        const excessHours = (drive - preferredHours * 60) / 60;
        return {
            penalty: 15 + excessHours * 5,
            reason: {
                tone: 'WARNING',
                code: 'DRIVE_ABOVE_PREFERRED',
                message: `${formatDuration(drive)} drive, above your preferred ${preferredHours}h`,
            },
        };
    }
    return {
        penalty: 0,
        reason: {
            tone: 'POSITIVE',
            code: 'DRIVE',
            message: `${formatDuration(drive)} drive, no flights needed`,
        },
    };
}

/** Door-to-door one-way time drives the score: ≤1h30 → 100, −8 per extra hour; −8 per stop; soft driving penalty. */
export function scoreTransport(option: TransportOption, criteria: SearchCriteria): ComponentScore {
    const hours = option.doorToDoorMinutes / 60;
    let score = 100 - Math.max(0, hours - 1.5) * 8;
    if (option.mode === 'FLIGHT') {
        const stops = option.offer.outbound.stops;
        score -= stops * 8;
        const airport = option.departureAirport.name;
        const reasons: MatchReason[] = [
            flightStopReason(stops, airport, option.offer.outbound.durationMinutes),
            {
                tone: 'NEUTRAL',
                code: 'AIRPORT_ACCESS',
                message: `${formatDuration(option.airportAccess.durationMinutes)} drive to ${airport}`,
            },
        ];
        return { score: Math.round(clamp(score)), reasons };
    }
    const review = driveReview(
        option.route.durationMinutes,
        criteria.transport.driving?.preferredMaxHours,
    );
    score -= review.penalty;
    return { score: Math.round(clamp(score)), reasons: [review.reason] };
}

// ---------------- Accommodation ----------------

function facilityReason(facility: AccommodationFacility, has: boolean): MatchReason {
    const label = FACILITY_LABEL[facility];
    if (has) return { tone: 'POSITIVE', code: `FAC_${facility}`, message: label };
    return { tone: 'WARNING', code: `FAC_${facility}`, message: `No ${label.toLowerCase()}` };
}

function facilityPart(
    offer: AccommodationOffer,
    requirements: readonly Requirement[],
): { weighted: number; totalWeight: number; reasons: MatchReason[] } {
    let weighted = 0;
    let totalWeight = 0;
    const reasons: MatchReason[] = [];
    for (const r of requirements) {
        if (r.kind !== 'FACILITY') continue;
        const has = hasFacility(offer, r.facility);
        const w = PRIORITY_WEIGHT[r.priority];
        const satisfied = r.priority === 'AVOID' ? !has : has;
        weighted += w * (satisfied ? 100 : 0);
        totalWeight += w;
        if (r.priority !== 'AVOID') reasons.push(facilityReason(r.facility, has));
    }
    return { weighted, totalWeight, reasons };
}

export function scoreAccommodation(
    offer: AccommodationOffer,
    requirements: readonly Requirement[],
): ComponentScore {
    const reasons: MatchReason[] = [];
    let ratingScore = 50;
    if (offer.rating === undefined) {
        reasons.push({ tone: 'WARNING', code: 'NO_RATING', message: 'No guest rating available' });
    } else {
        ratingScore = lerp(offer.rating, 5, 9.5, 0, 100);
        reasons.push({
            tone: offer.rating >= 8 ? 'POSITIVE' : 'NEUTRAL',
            code: 'RATING',
            message: `${offer.type === 'HOTEL' ? 'Hotel' : 'Apartment'} rated ${offer.rating.toFixed(1)}${starsSuffix(offer.stars)}`,
        });
    }
    const facilities = facilityPart(offer, requirements);
    reasons.push(...facilities.reasons);
    const score =
        facilities.totalWeight === 0
            ? ratingScore
            : 0.6 * ratingScore + 0.4 * (facilities.weighted / facilities.totalWeight);
    return { score: Math.round(score), reasons };
}

// ---------------- Location ----------------

function centreScore(metres: number): number {
    if (metres <= 500) return 100;
    if (metres <= 3000) return lerp(metres, 500, 3000, 100, 40);
    return 20;
}

function beachScore(metres: number): number {
    if (metres <= 300) return 100;
    if (metres <= 2000) return lerp(metres, 300, 2000, 100, 40);
    return 20;
}

function wantsBeach(criteria: SearchCriteria): boolean {
    return (
        criteria.accommodation.maxDistanceToBeachM !== undefined ||
        criteria.requirements.some(
            (r) => r.kind === 'DESTINATION' && r.attribute === 'beach' && r.priority !== 'AVOID',
        )
    );
}

function beachPart(metres: number | undefined): { score: number; reason: MatchReason } {
    if (metres === undefined) {
        return {
            score: 20,
            reason: {
                tone: 'WARNING',
                code: 'BEACH_DISTANCE_UNKNOWN',
                message: 'Distance to the beach unknown',
            },
        };
    }
    return {
        score: beachScore(metres),
        reason: {
            tone: metres <= 1000 ? 'POSITIVE' : 'NEUTRAL',
            code: 'BEACH_DISTANCE',
            message: `Beach within ${formatDistance(metres)}`,
        },
    };
}

export function scoreLocation(offer: AccommodationOffer, criteria: SearchCriteria): ComponentScore {
    const reasons: MatchReason[] = [];
    const parts: number[] = [];
    if (offer.distanceToCentreM !== undefined) {
        parts.push(centreScore(offer.distanceToCentreM));
        reasons.push({
            tone: offer.distanceToCentreM <= 1500 ? 'POSITIVE' : 'NEUTRAL',
            code: 'CENTRE_DISTANCE',
            message: `${formatDistance(offer.distanceToCentreM)} from the centre`,
        });
    }
    if (wantsBeach(criteria)) {
        const beach = beachPart(offer.distanceToBeachM);
        parts.push(beach.score);
        reasons.push(beach.reason);
    }
    const score = parts.length === 0 ? 50 : parts.reduce((a, b) => a + b, 0) / parts.length;
    return { score: Math.round(score), reasons };
}

// ---------------- Weather ----------------

/** Without a stated preference: 18–30 °C is ideal, colder or hotter is penalised. */
function idealTempScore(high: number): number {
    if (high < 18) return 100 - (18 - high) * 5;
    if (high > 30) return 100 - (high - 30) * 5;
    return 100;
}

function temperatureScore(high: number, wc: SearchCriteria['weather']): number {
    if (wc?.minAvgHighC !== undefined) {
        return high >= wc.minAvgHighC ? 100 : 100 - (wc.minAvgHighC - high) * 12;
    }
    if (wc?.preferWarm) return lerp(high, 12, 26, 0, 100);
    return idealTempScore(high);
}

export function scoreWeather(
    weather: WeatherResult | null,
    criteria: SearchCriteria,
): ComponentScore {
    if (!weather) {
        // Never invent weather. Neutral score, clearly flagged.
        return {
            score: 50,
            reasons: [
                {
                    tone: 'WARNING',
                    code: 'WEATHER_UNAVAILABLE',
                    message: 'Weather information unavailable',
                },
            ],
        };
    }
    const reasons: MatchReason[] = [];
    const high = weather.avgHighC;
    const wc = criteria.weather;
    if (wc?.minAvgHighC !== undefined && high < wc.minAvgHighC) {
        reasons.push({
            tone: 'WARNING',
            code: 'WEATHER_BELOW_MIN',
            message: `Avg high ${Math.round(high)}°C, below your ${wc.minAvgHighC}°C`,
        });
    }
    let score = temperatureScore(high, wc);
    score -= Math.min(20, Math.max(0, weather.rainyDaysExpected - 1) * 4);
    const source = weather.confidence === 'FORECAST' ? 'forecast' : 'climate average';
    reasons.push({
        tone: score >= 70 ? 'POSITIVE' : 'NEUTRAL',
        code: 'WEATHER',
        message: `Avg high ${Math.round(high)}°C, ~${Math.round(weather.rainyDaysExpected)} rainy day(s) (${source})`,
    });
    return { score: Math.round(clamp(score)), reasons };
}

// ---------------- Comfort (budget views) ----------------

/**
 * How comfortable the stay is, 0–100, for "best use of your budget": hotel class first
 * (2★ → 25 … 5★ → 100), guest rating otherwise. Not part of the Match Score.
 */
export function comfortScore(offer: AccommodationOffer): number {
    const byRating = offer.rating !== undefined ? lerp(offer.rating, 6, 9.5, 0, 100) : 50;
    if (offer.stars === undefined) return Math.round(byRating);
    const byStars = lerp(offer.stars, 1, 5, 0, 100);
    return Math.round(0.7 * byStars + 0.3 * byRating);
}

function starsSuffix(stars: number | undefined): string {
    return stars ? ` · ${stars}★` : '';
}
