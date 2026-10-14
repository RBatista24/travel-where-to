import { z } from 'zod';
import { fromMajor, isValidLocalDate } from '@travel-where-to/shared';
import {
    ACCOMMODATION_FACILITIES,
    DESTINATION_ATTRIBUTES,
    REGIONS,
    type SearchCriteria,
    type Weekday,
} from '@travel-where-to/domain';

const LocalDate = z.string().refine(isValidLocalDate, 'Expected a date as YYYY-MM-DD');
const MoneyInput = z
    .object({ amount: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/) })
    .strict();
const Priority = z.enum(['MUST_HAVE', 'IMPORTANT', 'PREFERRED', 'AVOID']);
const WeekdayInput = z
    .number()
    .int()
    .min(0)
    .max(6)
    .transform((n) => n as Weekday);
const Times = z.array(z.enum(['NIGHT', 'MORNING', 'AFTERNOON', 'EVENING'])).max(4);

/** Public API contract for POST /api/searches. Money is given in major units (e.g. euros). */
export const SearchRequestSchema = z
    .object({
        origin: z
            .object({
                label: z.string().min(1).max(120),
                coordinates: z
                    .object({
                        lat: z.number().min(-90).max(90),
                        lon: z.number().min(-180).max(180),
                    })
                    .strict(),
                countryCode: z.literal('PT'),
            })
            .strict(),
        dates: z.discriminatedUnion('kind', [
            z
                .object({ kind: z.literal('EXACT'), checkIn: LocalDate, checkOut: LocalDate })
                .strict(),
            z
                .object({
                    kind: z.literal('FLEXIBLE'),
                    windowStart: LocalDate,
                    windowEnd: LocalDate,
                    nights: z.number().int().min(1).max(30),
                    /** Travel on these days of the week, e.g. Thursday (4) → Sunday (0). */
                    weekdays: z
                        .object({
                            departOn: z.array(WeekdayInput).min(1).max(7),
                            returnOn: z.array(WeekdayInput).min(1).max(7),
                        })
                        .strict()
                        .optional(),
                })
                .strict(),
        ]),
        travellers: z
            .array(
                z
                    .object({
                        type: z.enum(['ADULT', 'CHILD', 'INFANT']),
                        age: z.number().int().min(0).max(120).optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(9),
        budget: MoneyInput,
        transport: z
            .object({
                modes: z.array(z.enum(['FLIGHT', 'CAR'])).min(1),
                driving: z
                    .object({
                        maxHours: z.number().positive().optional(),
                        preferredMaxHours: z.number().positive().optional(),
                    })
                    .strict()
                    .optional(),
                vehicle: z
                    .object({
                        fuelType: z.enum(['PETROL', 'DIESEL', 'LPG', 'ELECTRIC']),
                        consumptionPer100Km: z.number().positive().max(100),
                        fuelPrice: MoneyInput,
                    })
                    .strict()
                    .optional(),
                departureAirports: z.array(z.string().length(3)).optional(),
                flights: z
                    .object({
                        directOnly: z.boolean().optional(),
                        outboundTimes: Times.optional(),
                        returnTimes: Times.optional(),
                    })
                    .strict()
                    .optional(),
            })
            .strict(),
        destination: z
            .discriminatedUnion('kind', [
                z
                    .object({
                        kind: z.literal('DISCOVER'),
                        regions: z.array(z.enum(REGIONS)).max(REGIONS.length).optional(),
                    })
                    .strict(),
                z
                    .object({
                        kind: z.literal('KNOWN'),
                        destinationIds: z.array(z.string().min(1)).min(1),
                    })
                    .strict(),
            ])
            .default({ kind: 'DISCOVER' }),
        requirements: z
            .array(
                z.discriminatedUnion('kind', [
                    z
                        .object({
                            kind: z.literal('DESTINATION'),
                            attribute: z.enum(DESTINATION_ATTRIBUTES),
                            priority: Priority,
                        })
                        .strict(),
                    z
                        .object({
                            kind: z.literal('FACILITY'),
                            facility: z.enum(ACCOMMODATION_FACILITIES),
                            priority: Priority,
                        })
                        .strict(),
                ]),
            )
            .default([]),
        accommodation: z
            .object({
                types: z.array(z.enum(['HOTEL', 'APARTMENT'])).min(1),
                minStars: z.number().int().min(1).max(5).optional(),
                minRating: z.number().min(0).max(10).optional(),
                maxDistanceToCentreM: z.number().positive().optional(),
                maxDistanceToBeachM: z.number().positive().optional(),
                parkHotelsOnly: z.boolean().optional(),
            })
            .strict()
            .default({ types: ['HOTEL', 'APARTMENT'] }),
        weather: z
            .object({ minAvgHighC: z.number().optional(), preferWarm: z.boolean().optional() })
            .strict()
            .optional(),
        parkTickets: z
            .object({
                include: z.boolean().optional(),
                days: z.number().int().min(1).max(7).optional(),
            })
            .strict()
            .optional(),
    })
    .strict();

/** The body as sent over HTTP (before parsing). Web clients build this type. */
export type SearchRequestInput = z.input<typeof SearchRequestSchema>;
/** The parsed body the API works with (weekdays and defaults applied). */
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
