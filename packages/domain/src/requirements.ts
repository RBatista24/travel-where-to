import type { DestinationAttribute } from './destination';

export const RequirementPriority = {
    MUST_HAVE: 'MUST_HAVE',
    IMPORTANT: 'IMPORTANT',
    PREFERRED: 'PREFERRED',
    AVOID: 'AVOID',
} as const;
export type RequirementPriority = (typeof RequirementPriority)[keyof typeof RequirementPriority];

export const ACCOMMODATION_FACILITIES = [
    'pool',
    'heatedPool',
    'breakfast',
    'familyRooms',
    'parking',
] as const;
export type AccommodationFacility = (typeof ACCOMMODATION_FACILITIES)[number];

export type Requirement =
    | {
          readonly kind: 'DESTINATION';
          readonly attribute: DestinationAttribute;
          readonly priority: RequirementPriority;
      }
    | {
          readonly kind: 'FACILITY';
          readonly facility: AccommodationFacility;
          readonly priority: RequirementPriority;
      };

/** Where a requirement came from, so the UI can distinguish user input from AI interpretation. */
export type RequirementOrigin = 'USER' | 'AI_INTERPRETATION';
