import { z } from 'zod';
import { money } from '@travel-where-to/shared';
import type { FlightOffer, IndicativeFlightResult } from '@travel-where-to/domain';
import { ProviderError } from '@travel-where-to/domain';

/**
 * The mock provider emits a provider-shaped raw payload, which is validated and mapped
 * exactly like a real adapter (e.g. Skyscanner) would do. Provider-specific shapes never
 * leave this package.
 */
export const RawQuoteSchema = z.object({
  quoteId: z.string().min(1),
  from: z.string().length(3),
  to: z.string().length(3),
  outboundDate: z.string(),
  returnDate: z.string(),
  totalPriceCents: z.number().int().positive(),
  currency: z.string().length(3),
  direct: z.boolean(),
  carrier: z.string().min(1),
  outboundDeparture: z.string(),
  outboundDurationMin: z.number().int().positive(),
  inboundDeparture: z.string(),
  inboundDurationMin: z.number().int().positive(),
  stops: z.number().int().min(0),
  cabinBag: z.boolean(),
  bookingUrl: z.string().url(),
});
export type RawQuote = z.infer<typeof RawQuoteSchema>;

export const RawPayloadSchema = z.object({
  status: z.literal('OK'),
  quotes: z.array(z.unknown()),
});

export interface MappingContext {
  readonly provider: string;
  readonly retrievedAt: Date;
  readonly ttlMinutes?: number;
  readonly expectedCurrency: string;
}

export interface MappedQuotes<T> {
  readonly items: T[];
  /** Individual quotes dropped because they failed validation. */
  readonly rejected: number;
}

function parseQuotes(raw: unknown, ctx: MappingContext): { quotes: RawQuote[]; rejected: number } {
  const payload = RawPayloadSchema.safeParse(raw);
  if (!payload.success) throw new ProviderError(ctx.provider, 'INVALID_RESPONSE', payload.error.message);
  const quotes: RawQuote[] = [];
  let rejected = 0;
  for (const q of payload.data.quotes) {
    const parsed = RawQuoteSchema.safeParse(q);
    // Never trust provider data blindly: invalid quotes and unexpected currencies are dropped.
    if (!parsed.success || parsed.data.currency !== ctx.expectedCurrency) rejected++;
    else quotes.push(parsed.data);
  }
  return { quotes, rejected };
}

function addMinutes(isoLocal: string, minutes: number): string {
  const d = new Date(`${isoLocal}Z`);
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 16);
}

export function mapLiveQuotes(raw: unknown, ctx: MappingContext): MappedQuotes<FlightOffer> {
  const { quotes, rejected } = parseQuotes(raw, ctx);
  const expiresAt = ctx.ttlMinutes ? new Date(ctx.retrievedAt.getTime() + ctx.ttlMinutes * 60_000) : undefined;
  return {
    rejected,
    items: quotes.map((q) => ({
      originAirport: q.from,
      destinationAirport: q.to,
      outbound: {
        from: q.from,
        to: q.to,
        departure: q.outboundDeparture,
        arrival: addMinutes(q.outboundDeparture, q.outboundDurationMin),
        durationMinutes: q.outboundDurationMin,
        stops: q.stops,
        carrier: q.carrier,
      },
      inbound: {
        from: q.to,
        to: q.from,
        departure: q.inboundDeparture,
        arrival: addMinutes(q.inboundDeparture, q.inboundDurationMin),
        durationMinutes: q.inboundDurationMin,
        stops: q.stops,
        carrier: q.carrier,
      },
      price: {
        amount: money(q.totalPriceCents, q.currency),
        confidence: 'VERIFIED',
        attribution: {
          provider: ctx.provider,
          providerOfferId: q.quoteId,
          retrievedAt: ctx.retrievedAt,
          ...(expiresAt ? { expiresAt } : {}),
          deepLink: q.bookingUrl,
        },
      },
      cabinBaggageIncluded: q.cabinBag,
    })),
  };
}

export function mapIndicativeQuotes(raw: unknown, ctx: MappingContext): MappedQuotes<IndicativeFlightResult> {
  const { quotes, rejected } = parseQuotes(raw, ctx);
  return {
    rejected,
    items: quotes.map((q) => ({
      originAirport: q.from,
      destinationAirport: q.to,
      outboundDate: q.outboundDate,
      returnDate: q.returnDate,
      direct: q.direct,
      price: {
        amount: money(q.totalPriceCents, q.currency),
        confidence: 'INDICATIVE',
        attribution: { provider: ctx.provider, providerOfferId: q.quoteId, retrievedAt: ctx.retrievedAt, deepLink: q.bookingUrl },
      },
    })),
  };
}
