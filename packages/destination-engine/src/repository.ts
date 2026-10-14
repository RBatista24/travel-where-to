import type { Destination } from '@travel-where-to/domain';
import { DESTINATION_CATALOGUE } from './catalogue';

/** Read access to the destination database. Postgres-backed implementation comes later. */
export interface DestinationRepository {
  list(): Promise<readonly Destination[]>;
  get(id: string): Promise<Destination | undefined>;
}

export class InMemoryDestinationRepository implements DestinationRepository {
  private readonly byId: ReadonlyMap<string, Destination>;

  constructor(private readonly destinations: readonly Destination[] = DESTINATION_CATALOGUE) {
    this.byId = new Map(destinations.map((d) => [d.id, d]));
  }

  async list(): Promise<readonly Destination[]> {
    return this.destinations;
  }

  async get(id: string): Promise<Destination | undefined> {
    return this.byId.get(id);
  }
}
