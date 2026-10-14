import type { Money } from '@travel-where-to/shared';
import { eur, formatMoney, multiplyMoney } from '@travel-where-to/shared';
import type { CostItem, FlightOffer, RouteResult, Vehicle } from '@travel-where-to/domain';
import { fuelCost } from './fuel';

/** Assumption: generic long-stay airport parking rate when no airport-specific data exists. */
export const DEFAULT_AIRPORT_PARKING_PER_DAY = eur(12);

export function carTripCosts(route: RouteResult, vehicle: Vehicle): CostItem[] {
    const items: CostItem[] = [
        {
            kind: 'CAR_FUEL',
            label: 'Fuel (round trip)',
            amount: fuelCost(route.distanceKm, vehicle, true),
            confidence: 'ESTIMATED',
            countsTowardsBudget: true,
            basis: `${Math.round(route.distanceKm * 2)} km × ${vehicle.consumptionPer100Km} per 100 km × ${formatMoney(vehicle.fuelPrice)}`,
        },
    ];
    if (route.tolls) {
        items.push({
            kind: 'CAR_TOLLS',
            label: 'Tolls (round trip)',
            amount: multiplyMoney(route.tolls, 2),
            confidence: 'ESTIMATED',
            countsTowardsBudget: true,
            basis: `Toll estimate from ${route.provider}`,
        });
    }
    return items;
}

export interface AirportAccessInput {
    readonly airportName: string;
    readonly route: RouteResult;
    readonly vehicle: Vehicle;
    readonly parkingDays: number;
    readonly parkingPerDay?: Money;
}

/** Origin → airport → origin: fuel, tolls and parking. All ESTIMATED. */
export function airportAccessCosts(input: AirportAccessInput): CostItem[] {
    const parkingPerDay = input.parkingPerDay ?? DEFAULT_AIRPORT_PARKING_PER_DAY;
    const items: CostItem[] = [
        {
            kind: 'AIRPORT_ACCESS_FUEL',
            label: `Fuel to ${input.airportName} (round trip)`,
            amount: fuelCost(input.route.distanceKm, input.vehicle, true),
            confidence: 'ESTIMATED',
            countsTowardsBudget: true,
            basis: `${Math.round(input.route.distanceKm * 2)} km round trip`,
        },
    ];
    if (input.route.tolls && input.route.tolls.amountMinor > 0) {
        items.push({
            kind: 'AIRPORT_ACCESS_TOLLS',
            label: `Tolls to ${input.airportName} (round trip)`,
            amount: multiplyMoney(input.route.tolls, 2),
            confidence: 'ESTIMATED',
            countsTowardsBudget: true,
        });
    }
    items.push({
        kind: 'AIRPORT_PARKING',
        label: `Parking at ${input.airportName}`,
        amount: multiplyMoney(parkingPerDay, input.parkingDays),
        confidence: 'ESTIMATED',
        countsTowardsBudget: true,
        basis: `${input.parkingDays} days × ${formatMoney(parkingPerDay)}`,
    });
    return items;
}

export function flightCostItem(offer: FlightOffer): CostItem {
    return {
        kind: 'FLIGHT',
        label: `Flights ${offer.originAirport} ⇄ ${offer.destinationAirport}`,
        amount: offer.price.amount,
        confidence: offer.price.confidence,
        attribution: offer.price.attribution,
        countsTowardsBudget: true,
        ...(offer.priceBasis ? { basis: offer.priceBasis } : {}),
    };
}
