import { z } from 'zod';

/**
 * Travelpayouts / Aviasales Data API v3 payloads (prices_for_dates, grouped_prices).
 * Prices come from Aviasales' cache of recent searches (2–7 days old), per ONE adult,
 * economy, round trip when a return date is given.
 */
export const TpTicketSchema = z.object({
    origin: z.string().optional(),
    destination: z.string().optional(),
    origin_airport: z.string().length(3).optional(),
    destination_airport: z.string().length(3).optional(),
    price: z.number().positive(),
    airline: z.string().optional(),
    flight_number: z.union([z.string(), z.number()]).optional(),
    departure_at: z.string().min(10),
    return_at: z.string().min(10).optional(),
    transfers: z.number().int().min(0).optional(),
    return_transfers: z.number().int().min(0).optional(),
    duration: z.number().optional(),
    duration_to: z.number().positive().optional(),
    duration_back: z.number().positive().optional(),
    link: z.string().optional(),
});
export type TpTicket = z.infer<typeof TpTicketSchema>;

export const TpListResponseSchema = z.object({
    success: z.boolean(),
    data: z.array(z.unknown()),
    currency: z.string().optional(),
    error: z.string().optional(),
});

export const TpGroupedResponseSchema = z.object({
    success: z.boolean(),
    data: z.record(z.string(), z.unknown()),
    currency: z.string().optional(),
    error: z.string().optional(),
});

/** Validates tickets one by one; bad records are dropped, never repaired. */
export function parseTickets(items: readonly unknown[]): { tickets: TpTicket[]; rejected: number } {
    const tickets: TpTicket[] = [];
    let rejected = 0;
    for (const item of items) {
        const p = TpTicketSchema.safeParse(item);
        if (p.success) tickets.push(p.data);
        else rejected++;
    }
    return { tickets, rejected };
}
