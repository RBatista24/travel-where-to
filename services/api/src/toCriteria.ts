import { fromMajor } from '@travel-where-to/shared';
import type { SearchCriteria } from '@travel-where-to/domain';
import type { SearchRequest } from '@travel-where-to/api-contract';

export function toCriteria(req: SearchRequest): SearchCriteria {
    const { vehicle, ...transport } = req.transport;
    return {
        ...req,
        budget: fromMajor(req.budget.amount, req.budget.currency),
        transport: {
            ...transport,
            ...(vehicle
                ? {
                      vehicle: {
                          ...vehicle,
                          fuelPrice: fromMajor(
                              vehicle.fuelPrice.amount,
                              vehicle.fuelPrice.currency,
                          ),
                      },
                  }
                : {}),
        },
    };
}
