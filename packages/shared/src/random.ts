/** Deterministic pseudo-randomness for mocks and tests. Never used for real data. */
export function hashString(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export type Rng = () => number;

/** mulberry32 seeded by a string key. Returns values in [0, 1). */
export function seededRng(key: string): Rng {
    let a = hashString(key);
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function between(rng: Rng, min: number, max: number): number {
    return min + rng() * (max - min);
}
