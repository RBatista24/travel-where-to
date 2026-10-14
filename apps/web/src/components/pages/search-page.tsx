'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/atoms/skeleton';
import { ErrorState } from '@/components/molecules/query-state';
import { PriceLegend } from '@/components/organisms/price-legend';
import { SearchForm } from '@/components/organisms/search-form';
import { useRunSearch, useSearchResult } from '@/hooks/queries';
import {
    defaultForm,
    fromCriteria,
    toSearchRequest,
    type SearchFormState,
} from '@/lib/search-form';

/**
 * Home: describe the trip or set it up, then search.
 * `?from=SEARCH-…` reopens a previous search for editing (spec §56: change requirements without starting over).
 */
export function SearchPage({ fromSearchId }: { fromSearchId?: string }) {
    const router = useRouter();
    const previous = useSearchResult(fromSearchId ?? null);
    const [form, setForm] = React.useState<SearchFormState | null>(
        fromSearchId ? null : defaultForm(),
    );
    const search = useRunSearch();

    React.useEffect(() => {
        if (fromSearchId && previous.status === 'success' && form === null)
            setForm(fromCriteria(previous.data.criteria));
    }, [fromSearchId, previous.status, previous.data, form]);

    const submit = async () => {
        if (!form) return;
        const result = await search.run(toSearchRequest(form));
        if (result) router.push(`/results/${encodeURIComponent(result.searchId)}`);
    };

    return (
        <div className="grid gap-8">
            <header className="max-w-2xl">
                <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
                    {fromSearchId ? 'Change your search' : 'Where can we go?'}
                </h1>
                <p className="text-muted-foreground mt-3 text-lg">
                    Tell us when you can travel, who is coming and what you want to spend. We search
                    flights, drives and stays and rank the places that fit.
                </p>
            </header>

            {fromSearchId && previous.status === 'error' && (
                <ErrorState
                    error={previous.error}
                    title="We couldn't reopen that search"
                    onRetry={previous.reload}
                />
            )}
            {form === null ? (
                previous.status === 'error' ? null : (
                    <Skeleton className="h-[40rem] w-full" />
                )
            ) : (
                <SearchForm
                    form={form}
                    onChange={setForm}
                    onSubmit={() => void submit()}
                    submitting={search.status === 'running'}
                    submitError={search.status === 'error' ? search.error : undefined}
                    aside={
                        <div className="bg-card rounded-xl border p-5">
                            <PriceLegend />
                        </div>
                    }
                />
            )}
        </div>
    );
}
