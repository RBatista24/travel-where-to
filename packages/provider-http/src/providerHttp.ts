import { ProviderError, type ProviderErrorKind } from '@travel-where-to/domain';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProviderHttpOptions {
    readonly provider: string;
    readonly fetch?: FetchLike;
    readonly timeoutMs?: number;
}

function kindForStatus(status: number): ProviderErrorKind {
    if (status === 401 || status === 403) return 'AUTHENTICATION';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'UNAVAILABLE';
    return 'INVALID_RESPONSE';
}

/**
 * JSON over HTTP for provider adapters. Maps transport problems to ProviderError kinds
 * so the search engine can report them; never returns partial or guessed data.
 * Response bodies are returned as `unknown` and must be validated by the adapter.
 */
export async function providerFetchJson(
    url: string,
    init: RequestInit,
    options: ProviderHttpOptions,
): Promise<{ status: number; body: unknown }> {
    const doFetch = options.fetch ?? fetch;
    let res: Response;
    try {
        res = await doFetch(url, {
            ...init,
            signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
    } catch (err) {
        const name = err instanceof Error ? err.name : '';
        throw new ProviderError(
            options.provider,
            name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE',
            err instanceof Error ? err.message : String(err),
        );
    }
    const text = await res.text();
    let body: unknown;
    try {
        body = text.length ? JSON.parse(text) : null;
    } catch {
        throw new ProviderError(
            options.provider,
            res.ok ? 'INVALID_RESPONSE' : kindForStatus(res.status),
            `HTTP ${res.status}: non-JSON response`,
        );
    }
    return { status: res.status, body };
}

export function providerStatusError(
    provider: string,
    status: number,
    detail: string,
): ProviderError {
    return new ProviderError(
        provider,
        kindForStatus(status),
        `HTTP ${status}: ${detail.slice(0, 300)}`,
    );
}

/** Small in-memory TTL cache that also de-duplicates concurrent identical requests. */
export class PromiseCache<T> {
    private readonly entries = new Map<string, { at: number; value: Promise<T> }>();
    constructor(
        private readonly ttlMs: number,
        private readonly now: () => number = Date.now,
        private readonly maxEntries = 5000,
    ) {}

    get(key: string, load: () => Promise<T>): Promise<T> {
        const hit = this.entries.get(key);
        if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
        const value = load();
        this.entries.set(key, { at: this.now(), value });
        // Failed loads are not cached, so the next search retries.
        value.catch(() => this.entries.delete(key));
        if (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest !== undefined) this.entries.delete(oldest);
        }
        return value;
    }

    peek(key: string): Promise<T> | undefined {
        const hit = this.entries.get(key);
        return hit && this.now() - hit.at < this.ttlMs ? hit.value : undefined;
    }
}
