import {
    matchDestinationNames,
    type DestinationRepository,
} from '@travel-where-to/destination-engine';
import { interpretTravelRequest, type LlmProvider } from '@travel-where-to/llm';

export interface InterpretSearchTextDeps {
    readonly llm: LlmProvider;
    readonly destinations: DestinationRepository;
}

/**
 * Use case: read a free-text trip request, validate the model's interpretation, and resolve
 * the destinations it named to catalogue entries. Throws LlmOutputError when the model's
 * output does not validate; the HTTP layer maps that to a 502.
 */
export async function interpretSearchText(deps: InterpretSearchTextDeps, text: string) {
    const interpreted = await interpretTravelRequest(deps.llm, text);
    const catalogue = await deps.destinations.list();
    const destinations = matchDestinationNames(
        interpreted.intent.destinationNames ?? [],
        catalogue,
    );
    return { ...interpreted, destinations };
}
