import type { Money } from '@travel-where-to/shared';
import { eur, multiplyMoney } from '@travel-where-to/shared';
import type { Vehicle } from '@travel-where-to/domain';

/**
 * Assumption (documented in docs/assumptions.md): when the user has not configured a
 * vehicle, a typical diesel car is used. Results built on it are always ESTIMATED.
 */
export const DEFAULT_VEHICLE: Vehicle = {
  fuelType: 'DIESEL',
  consumptionPer100Km: 6.5,
  fuelPrice: eur(1.65),
};

/**
 * fuel = distanceKm × (roundTrip ? 2 : 1) / 100 × consumption × fuelPrice
 */
export function fuelCost(distanceKmOneWay: number, vehicle: Vehicle, roundTrip = true): Money {
  if (distanceKmOneWay < 0) throw new RangeError('Distance cannot be negative');
  if (vehicle.consumptionPer100Km <= 0) throw new RangeError('Consumption must be positive');
  const km = distanceKmOneWay * (roundTrip ? 2 : 1);
  const units = (km / 100) * vehicle.consumptionPer100Km;
  return multiplyMoney(vehicle.fuelPrice, units);
}
