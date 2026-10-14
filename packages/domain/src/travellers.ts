export const TravellerType = {
  ADULT: 'ADULT',
  CHILD: 'CHILD',
  INFANT: 'INFANT',
} as const;
export type TravellerType = (typeof TravellerType)[keyof typeof TravellerType];

export interface Traveller {
  readonly type: TravellerType;
  /** Required for CHILD and INFANT so it can be passed to providers. */
  readonly age?: number;
}

/** Age boundaries used by V1. Infant < 2, child 2–17, adult 18+. */
export const INFANT_MAX_AGE = 1;
export const CHILD_MAX_AGE = 17;

export interface TravellerCounts {
  readonly adults: number;
  readonly children: number;
  readonly infants: number;
  readonly childAges: readonly number[];
  readonly infantAges: readonly number[];
}

export function countTravellers(travellers: readonly Traveller[]): TravellerCounts {
  const children = travellers.filter((t) => t.type === 'CHILD');
  const infants = travellers.filter((t) => t.type === 'INFANT');
  return {
    adults: travellers.filter((t) => t.type === 'ADULT').length,
    children: children.length,
    infants: infants.length,
    childAges: children.map((c) => c.age ?? CHILD_MAX_AGE),
    infantAges: infants.map((i) => i.age ?? 0),
  };
}

export function validateTravellers(travellers: readonly Traveller[]): string[] {
  const errors: string[] = [];
  const counts = countTravellers(travellers);
  if (counts.adults < 1) errors.push('At least one adult is required.');
  if (travellers.length > 9) errors.push('A maximum of 9 travellers is supported.');
  if (counts.infants > counts.adults) errors.push('Each infant must travel with an adult.');
  travellers.forEach((t, i) => {
    if (t.type === 'CHILD') {
      if (t.age === undefined) errors.push(`Traveller ${i + 1}: child age is required.`);
      else if (!Number.isInteger(t.age) || t.age < INFANT_MAX_AGE + 1 || t.age > CHILD_MAX_AGE)
        errors.push(`Traveller ${i + 1}: child age must be between ${INFANT_MAX_AGE + 1} and ${CHILD_MAX_AGE}.`);
    }
    if (t.type === 'INFANT') {
      if (t.age === undefined) errors.push(`Traveller ${i + 1}: infant age is required.`);
      else if (!Number.isInteger(t.age) || t.age < 0 || t.age > INFANT_MAX_AGE)
        errors.push(`Traveller ${i + 1}: infant age must be 0 or 1.`);
    }
  });
  return errors;
}
