/** Hook used by mock providers to simulate provider failures in tests and demos. */
export type FailureInjector = (operation: string, key: string) => 'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'AUTHENTICATION' | 'INVALID_RESPONSE' | undefined;

export const SEASON_FACTOR: readonly number[] = [0.8, 0.75, 0.85, 1.0, 1.0, 1.2, 1.45, 1.5, 1.1, 0.95, 0.8, 1.15];

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
