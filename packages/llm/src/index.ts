import { z } from 'zod';
import { ACCOMMODATION_FACILITIES, DESTINATION_ATTRIBUTES, RequirementPriority } from '@travel-where-to/domain';
import type { MatchReason, ScoreBreakdown } from '@travel-where-to/domain';

/*
 * LLM abstraction (Phase 4). Provider-independent: Claude, OpenAI, Gemini or a local
 * model can implement LlmProvider. The LLM only proposes *structured requirements*;
 * output is validated here before the domain ever sees it, and it can never carry
 * prices, availability, distances or scores.
 */

const Priority = z.enum([RequirementPriority.MUST_HAVE, RequirementPriority.IMPORTANT, RequirementPriority.PREFERRED, RequirementPriority.AVOID]);

const TIMES = ['NIGHT', 'MORNING', 'AFTERNOON', 'EVENING'] as const;

export const TravelIntentSchema = z
  .object({
    requirements: z.array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('DESTINATION'), attribute: z.enum(DESTINATION_ATTRIBUTES), priority: Priority }).strict(),
        z.object({ kind: z.literal('FACILITY'), facility: z.enum(ACCOMMODATION_FACILITIES), priority: Priority }).strict(),
      ]),
    ),
    /** User-stated budget, never a price the model came up with. */
    budget: z.object({ amount: z.number().positive(), currency: z.string().length(3) }).strict().optional(),
    nights: z.number().int().positive().optional(),
    adults: z.number().int().min(1).optional(),
    childAges: z.array(z.number().int().min(0).max(17)).optional(),
    dateWindow: z.object({ start: z.string(), end: z.string() }).strict().optional(),
    transportModes: z.array(z.enum(['FLIGHT', 'CAR'])).optional(),
    maxDrivingHours: z.number().positive().optional(),
    minAvgHighC: z.number().optional(),
    destinationNames: z.array(z.string()).optional(),
    /** Theme parks: stay only in the park's official hotels. */
    parkHotelsOnly: z.boolean().optional(),
    /** Theme parks: days in the park (tickets). */
    parkDays: z.number().int().min(1).max(7).optional(),
    /** Parts of the world to search ("outside Europe", "Caribbean", "Asia"…). */
    regions: z.array(z.enum(['EUROPE', 'AFRICA', 'AMERICAS', 'MIDDLE_EAST', 'ASIA_PACIFIC', 'INDIAN_OCEAN'])).min(1).optional(),
    /** Flights: non-stop only. */
    directFlightsOnly: z.boolean().optional(),
    /** Flights: departure time of day of each leg (empty/absent = any). */
    outboundTimes: z.array(z.enum(TIMES)).optional(),
    returnTimes: z.array(z.enum(TIMES)).optional(),
    /** Flexible dates: leave on these weekdays and come back on these (0 = Sunday). */
    departOn: z.array(z.number().int().min(0).max(6)).min(1).optional(),
    returnOn: z.array(z.number().int().min(0).max(6)).min(1).optional(),
    /** Parts of the request the model could not map to supported criteria — shown to the user. */
    unmapped: z.array(z.string()).default([]),
  })
  .strict();

export type TravelIntent = z.infer<typeof TravelIntentSchema>;

export interface ExplanationInput {
  readonly destinationName: string;
  readonly score: ScoreBreakdown;
  readonly reasons: readonly MatchReason[];
}

export interface LlmProvider {
  readonly name: string;
  /** Returns raw model output; callers must use `interpretTravelRequest` to validate it. */
  interpretTravelRequest(request: string): Promise<unknown>;
  /** Rephrases deterministic reasons. Must not add facts that are not in the input. */
  explainRecommendation(input: ExplanationInput): Promise<string>;
}

export class LlmOutputError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`LLM output failed validation: ${issues.join('; ')}`);
    this.name = 'LlmOutputError';
  }
}

export interface InterpretedIntent {
  readonly intent: TravelIntent;
  /** Lets the UI label these as AI INTERPRETATION, editable by the user. */
  readonly origin: 'AI_INTERPRETATION';
  readonly provider: string;
}

export async function interpretTravelRequest(llm: LlmProvider, request: string): Promise<InterpretedIntent> {
  const raw = await llm.interpretTravelRequest(request);
  const parsed = TravelIntentSchema.safeParse(raw);
  if (!parsed.success) throw new LlmOutputError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  return { intent: parsed.data, origin: 'AI_INTERPRETATION', provider: llm.name };
}

export { MockLlmProvider } from './MockLlmProvider';
