import type { Destination } from '@travel-where-to/domain';

/** Lower-case, accent-free form used to compare a spoken name with a catalogue name. */
function normalise(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The catalogue name without its parenthesised qualifier, e.g. "Seville (Sevilla)" → "Seville". */
function shortName(d: Pick<Destination, 'name'>): string {
    return normalise(d.name.replace(/ \(.*\)$/, ''));
}

/**
 * Resolves destination names the model mentioned to catalogue entries. The model never invents
 * destinations: a name matches an exact catalogue name first, otherwise the longest catalogue
 * name contained in what was said. Unmatched names are dropped.
 */
export function matchDestinationNames<T extends Pick<Destination, 'id' | 'name'>>(
    names: readonly string[],
    catalogue: readonly T[],
): Array<Pick<T, 'id' | 'name'>> {
    const matches: Array<Pick<T, 'id' | 'name'>> = [];
    for (const spoken of names) {
        const said = normalise(spoken);
        const hit =
            catalogue.find((d) => shortName(d) === said) ??
            catalogue
                .filter((d) => said.includes(shortName(d)) || normalise(d.name).includes(said))
                .sort((a, b) => shortName(b).length - shortName(a).length)[0];
        if (hit !== undefined) matches.push({ id: hit.id, name: hit.name });
    }
    return matches;
}
