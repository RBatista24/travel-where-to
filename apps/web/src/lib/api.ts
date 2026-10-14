import type {
    DestinationSummary,
    InterpretResponse,
    RecentSearch,
    SearchRequest,
    SearchResult,
} from './types';

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/** Results already fetched this session, so moving between results and comparison is instant. */
const searchCache = new Map<string, SearchResult>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`/api${path}`, {
            ...init,
            headers: { 'content-type': 'application/json', ...init?.headers },
        });
    } catch {
        throw new ApiError(
            0,
            "Can't reach the travel API. Start it with `pnpm dev:api` and try again.",
        );
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
        const b = (body ?? {}) as { error?: string; details?: unknown };
        throw new ApiError(res.status, b.error ?? `The request failed (${res.status}).`, b.details);
    }
    return body as T;
}

export const api = {
    async search(body: SearchRequest): Promise<SearchResult> {
        const result = await request<SearchResult>('/searches', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        searchCache.set(result.searchId, result);
        return result;
    },
    async getSearch(searchId: string): Promise<SearchResult> {
        const cached = searchCache.get(searchId);
        if (cached) return cached;
        const result = await request<SearchResult>(`/searches/${encodeURIComponent(searchId)}`);
        searchCache.set(searchId, result);
        return result;
    },
    recentSearches: () =>
        request<{ searches: RecentSearch[] }>('/searches').then((r) => r.searches),
    destinations: () =>
        request<{ destinations: DestinationSummary[] }>('/destinations').then(
            (r) => r.destinations,
        ),
    interpret: (text: string) =>
        request<InterpretResponse>('/interpret', {
            method: 'POST',
            body: JSON.stringify({ text }),
        }),
};

/** Turn validation details from the API into readable lines. */
export function errorLines(error: unknown): string[] {
    if (!(error instanceof ApiError))
        return [error instanceof Error ? error.message : 'Something went wrong.'];
    const details = Array.isArray(error.details)
        ? error.details.map((d) =>
              typeof d === 'string'
                  ? d
                  : typeof d === 'object' && d && 'message' in d
                    ? `${(d as { path?: string }).path ? `${(d as { path: string }).path}: ` : ''}${String((d as { message: unknown }).message)}`
                    : JSON.stringify(d),
          )
        : [];
    return [error.message, ...details];
}
