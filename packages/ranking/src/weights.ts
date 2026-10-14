export interface RankingWeights {
    readonly budget: number;
    readonly preferences: number;
    readonly transport: number;
    readonly accommodation: number;
    readonly location: number;
    readonly weather: number;
}

/** Initial weighting from the V1 spec (§33). Must sum to 100. */
export const DEFAULT_WEIGHTS: RankingWeights = {
    budget: 27,
    preferences: 25,
    transport: 15,
    accommodation: 15,
    location: 8,
    weather: 10,
};

export function validateWeights(w: RankingWeights): void {
    const values = Object.values(w);
    if (values.some((v) => v < 0)) throw new RangeError('Ranking weights cannot be negative');
    const sum = values.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 1e-9)
        throw new RangeError(`Ranking weights must sum to 100, got ${sum}`);
}

/** Relative influence of each requirement priority. MUST_HAVE failures exclude results before scoring. */
export const PRIORITY_WEIGHT = { MUST_HAVE: 2, IMPORTANT: 3, PREFERRED: 1, AVOID: 2 } as const;
