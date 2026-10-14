export interface ProviderCallLog {
    readonly searchId: string;
    readonly provider: string;
    readonly operation: string;
    readonly destinationId?: string;
    readonly durationMs: number;
    readonly status: 'OK' | 'ERROR';
    readonly resultCount?: number;
    readonly errorKind?: string;
    readonly error?: string;
    readonly cacheHit: boolean;
}

/** Receives one entry per provider call. Must not receive personal data. */
export interface ProviderCallLogger {
    log(entry: ProviderCallLog): void;
}

export const noopLogger: ProviderCallLogger = { log: () => undefined };

export interface SearchIdGenerator {
    next(now: Date): string;
}

/** SEARCH-2026-000123. In-memory sequence; a database sequence replaces this in production. */
export class SequentialSearchIdGenerator implements SearchIdGenerator {
    private seq = 0;
    next(now: Date): string {
        this.seq += 1;
        return `SEARCH-${now.getUTCFullYear()}-${String(this.seq).padStart(6, '0')}`;
    }
}
