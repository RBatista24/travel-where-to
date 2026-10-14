import type {
    AccommodationOffer,
    CostBreakdown,
    Destination,
    MatchReason,
    Requirement,
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
        const label = ATTRIBUTE_LABEL[r.attribute];
        if (r.priority === 'AVOID') {
            weighted += w * (100 - attrScore);
            reasons.push(
                attrScore >= ATTRIBUTE_PRESENT_THRESHOLD
                    ? {
                          tone: 'WARNING',
                          code: `AVOID_${r.attribute}`,
                          message: `Known for ${label}, which you wanted to avoid`,
                      }
                    : {
                          tone: 'POSITIVE',
                          code: `AVOID_${r.attribute}`,
                          message: `Not known for ${label}`,
                      },
            );
        } else {
            weighted += w * attrScore;
            reasons.push(
                attrScore >= ATTRIBUTE_PRESENT_THRESHOLD
                    ? {
                          tone: 'POSITIVE',
                          code: `ATTR_${r.attribute}`,
                          message: `Good for ${label} (${attrScore}/100)`,
                      }
                    : {
                          tone: 'WARNING',
                          code: `ATTR_${r.attribute}`,
                          message: `Weak for ${label} (${attrScore}/100)`,
                      },
            );
        }
        totalWeight += w;
    }
    // With no destination preferences every destination is equally suitable.
    const score = totalWeight === 0 ? 100 : weighted / totalWeight;
    return { score: Math.round(score), reasons };
}

// ---------------- Transport ----------------

/** Door-to-door one-way time drives the score: ≤1h30 → 100, −8 per extra hour; −8 per stop; soft driving penalty. */
export function scoreTransport(option: TransportOption, criteria: SearchCriteria): ComponentScore {
    const reasons: MatchReason[] = [];
    const hours = option.doorToDoorMinutes / 60;
    let score = 100 - Math.max(0, hours - 1.5) * 8;
    if (option.mode === 'FLIGHT') {
        const stops = option.offer.outbound.stops;
        score -= stops * 8;
        reasons.push(
            stops === 0
                ? {
                      tone: 'POSITIVE',
                      code: 'FLIGHT_DIRECT',
                      message: `Direct flight from ${option.departureAirport.name} (${formatDuration(option.offer.outbound.durationMinutes)})`,
                  }
                : {
                      tone: 'NEUTRAL',
                      code: 'FLIGHT_STOPS',
                      message: `${stops}-stop flight from ${option.departureAirport.name} (${formatDuration(option.offer.outbound.durationMinutes)})`,
                  },
        );
        reasons.push({
            tone: 'NEUTRAL',
            code: 'AIRPORT_ACCESS',
            message: `${formatDuration(option.airportAccess.durationMinutes)} drive to ${option.departureAirport.name}`,
        });
    } else {
        const drive = option.route.durationMinutes;
        const pref = criteria.transport.driving?.preferredMaxHours;
        if (pref !== undefined && drive > pref * 60) {
            const excessHours = (drive - pref * 60) / 60;
            score -= 15 + excessHours * 5;
            reasons.push({
                tone: 'WARNING',
                code: 'DRIVE_ABOVE_PREFERRED',
                message: `${formatDuration(drive)} drive, above your preferred ${pref}h`,
            });
        } else {
            reasons.push({
                tone: 'POSITIVE',
                code: 'DRIVE',
                message: `${formatDuration(drive)} drive, no flights needed`,
            });
        }
    }
    return { score: Math.round(clamp(score)), reasons };
}

// ---------------- Accommodation ----------------

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
    let weighted = 0;
    let totalWeight = 0;
    for (const r of requirements) {
        if (r.kind !== 'FACILITY') continue;
        const has = hasFacility(offer, r.facility);
        const w = PRIORITY_WEIGHT[r.priority];
        const label = FACILITY_LABEL[r.facility];
        const satisfied = r.priority === 'AVOID' ? !has : has;
        weighted += w * (satisfied ? 100 : 0);
        totalWeight += w;
        if (r.priority === 'AVOID') continue;
        reasons.push(
            has
                ? { tone: 'POSITIVE', code: `FAC_${r.facility}`, message: label }
                : {
                      tone: 'WARNING',
                      code: `FAC_${r.facility}`,
                      message: `No ${label.toLowerCase()}`,
                  },
        );
    }
    const score =
        totalWeight === 0 ? ratingScore : 0.6 * ratingScore + 0.4 * (weighted / totalWeight);
    return { score: Math.round(score), reasons };
}

// ---------------- Location ----------------

export function scoreLocation(offer: AccommodationOffer, criteria: SearchCriteria): ComponentScore {
    const reasons: MatchReason[] = [];
    const parts: number[] = [];
    if (offer.distanceToCentreM !== undefined) {
        parts.push(
            offer.distanceToCentreM <= 500
                ? 100
                : offer.distanceToCentreM <= 3000
                  ? lerp(offer.distanceToCentreM, 500, 3000, 100, 40)
                  : 20,
        );
        reasons.push({
            tone: offer.distanceToCentreM <= 1500 ? 'POSITIVE' : 'NEUTRAL',
            code: 'CENTRE_DISTANCE',
            message: `${formatDistance(offer.distanceToCentreM)} from the centre`,
        });
    }
    const wantsBeach =
        criteria.accommodation.maxDistanceToBeachM !== undefined ||
        criteria.requirements.some(
            (r) => r.kind === 'DESTINATION' && r.attribute === 'beach' && r.priority !== 'AVOID',
        );
    if (wantsBeach) {
        if (offer.distanceToBeachM !== undefined) {
            parts.push(
                offer.distanceToBeachM <= 300
                    ? 100
                    : offer.distanceToBeachM <= 2000
                      ? lerp(offer.distanceToBeachM, 300, 2000, 100, 40)
                      : 20,
            );
            reasons.push({
                tone: offer.distanceToBeachM <= 1000 ? 'POSITIVE' : 'NEUTRAL',
                code: 'BEACH_DISTANCE',
                message: `Beach within ${formatDistance(offer.distanceToBeachM)}`,
            });
        } else {
            parts.push(20);
            reasons.push({
                tone: 'WARNING',
                code: 'BEACH_DISTANCE_UNKNOWN',
                message: 'Distance to the beach unknown',
            });
        }
    }
    const score = parts.length === 0 ? 50 : parts.reduce((a, b) => a + b, 0) / parts.length;
    return { score: Math.round(score), reasons };
}

// ---------------- Weather ----------------

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
    let score: number;
    if (wc?.minAvgHighC !== undefined) {
        score = high >= wc.minAvgHighC ? 100 : 100 - (wc.minAvgHighC - high) * 12;
        if (high < wc.minAvgHighC)
            reasons.push({
                tone: 'WARNING',
                code: 'WEATHER_BELOW_MIN',
                message: `Avg high ${Math.round(high)}°C, below your ${wc.minAvgHighC}°C`,
            });
    } else if (wc?.preferWarm) {
        score = lerp(high, 12, 26, 0, 100);
    } else {
        score = high < 18 ? 100 - (18 - high) * 5 : high > 30 ? 100 - (high - 30) * 5 : 100;
    }
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
