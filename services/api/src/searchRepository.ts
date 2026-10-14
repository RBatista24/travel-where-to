import type { SearchResult } from '@travel-where-to/domain';

/** Search history (spec §40). In-memory for now; PostgreSQL is the system of record later. */
export interface SearchRepository {
  save(result: SearchResult): Promise<void>;
  get(searchId: string): Promise<SearchResult | undefined>;
  list(limit: number): Promise<SearchResult[]>;
}

export class InMemorySearchRepository implements SearchRepository {
  private readonly items = new Map<string, SearchResult>();

  async save(result: SearchResult): Promise<void> {
    this.items.set(result.searchId, result);
  }

  async get(searchId: string): Promise<SearchResult | undefined> {
    return this.items.get(searchId);
  }

  async list(limit: number): Promise<SearchResult[]> {
    return [...this.items.values()].reverse().slice(0, limit);
  }
}
