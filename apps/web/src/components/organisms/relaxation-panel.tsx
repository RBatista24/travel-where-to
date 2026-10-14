'use client';

import { Button } from '@/components/atoms/button';
import { Spinner } from '@/components/atoms/spinner';
import { plural } from '@/lib/format';
import type { RelaxationSuggestion } from '@/lib/types';

/** Spec §37: never just "No results" - show which single change unlocks options. */
export function RelaxationPanel({
    suggestions,
    onApply,
    applying,
}: {
    suggestions: readonly RelaxationSuggestion[];
    onApply: (s: RelaxationSuggestion) => void;
    applying: string | null;
}) {
    return (
        <section aria-labelledby="relax-heading" className="bg-card rounded-xl border p-6 sm:p-8">
            <h2 id="relax-heading" className="text-2xl font-semibold">
                No trip fits everything yet
            </h2>
            {suggestions.length > 0 ? (
                <>
                    <p className="text-muted-foreground mt-1">
                        Each of these changes, on its own, opens up options. Pick one to search
                        again.
                    </p>
                    <ul className="mt-5 divide-y">
                        {suggestions.map((s) => (
                            <li
                                key={s.code}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                            >
                                <div>
                                    <p className="font-medium">{s.description}</p>
                                    <p className="text-muted-foreground text-sm">
                                        {plural(s.resultCount, 'option')}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    disabled={applying !== null}
                                    onClick={() => onApply(s)}
                                >
                                    {applying === s.code && <Spinner />} Search with this change
                                </Button>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className="text-muted-foreground mt-1">
                    No single change was enough. Try a bigger budget, more flexible dates and fewer
                    must-haves together.
                </p>
            )}
        </section>
    );
}
