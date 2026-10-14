'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Skeleton } from '@/components/atoms/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/atoms/tabs';
import { BudgetPicks } from '@/components/organisms/budget-picks';
import { ErrorState } from '@/components/molecules/query-state';
import { CompareTray, MAX_COMPARE } from '@/components/organisms/compare-tray';
import { RelaxationPanel } from '@/components/organisms/relaxation-panel';
import { ResultCard } from '@/components/organisms/result-card';
import { ResultRow } from '@/components/organisms/result-row';
import { DataSources } from '@/components/organisms/data-sources';
import { SearchNotices } from '@/components/organisms/search-notices';
import { SearchSummary } from '@/components/organisms/search-summary';
import { TripDetailSheet } from '@/components/organisms/trip-detail-sheet';
import { ResultsLayout } from '@/components/templates/results-layout';
import { useRunSearch, useSearchResult } from '@/hooks/queries';
import { fromCriteria, toSearchRequest } from '@/lib/search-form';
import { allTrips, viewList, type ResultView } from '@/lib/result-views';
import type { RelaxationSuggestion, SearchResult } from '@/lib/types';

const FEATURED = 3;
const VIEW_LABEL: Record<ResultView, string> = {
    MATCH: 'Best matches',
    CHEAPEST: 'Cheapest trips',
    FULL_BUDGET: 'Best trips for your budget',
};
const VIEW_HINT: Record<ResultView, string> = {
    MATCH: 'Ranked by Match Score: fit, price, travel time, stay, weather.',
    CHEAPEST: 'Lowest trip total first, one trip per place.',
    FULL_BUDGET:
        'The best trip per place spending 75–100% of your budget (better stays), price aside.',
};

export function ResultsPage({ searchId }: { searchId: string }) {
    const result = useSearchResult(searchId);
    if (result.status === 'loading') return <ResultsSkeleton />;
    if (result.status === 'error')
        return (
            <ErrorState
                error={result.error}
                title="We couldn't load these results"
                onRetry={result.reload}
            />
        );
    return <Results result={result.data} />;
}

function Results({ result }: { result: SearchResult }) {
    const router = useRouter();
    const [view, setView] = React.useState<ResultView>('MATCH');
    const recs = viewList(result, view);
    const trips = React.useMemo(() => allTrips(result), [result]);
    const hasPicks =
        (result.picks?.cheapest.length ?? 0) > 0 || (result.picks?.fullBudget.length ?? 0) > 0;
    const listRef = React.useRef<HTMLDivElement>(null);
    const [showAll, setShowAll] = React.useState(false);
    const showList = (v: ResultView) => {
        setView(v);
        setShowAll(false);
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const [openId, setOpenId] = React.useState<string | null>(null);
    const [compare, setCompare] = React.useState<string[]>([]);
    const rerun = useRunSearch();
    const [applying, setApplying] = React.useState<string | null>(null);

    const toggle = (id: string) =>
        setCompare((c) =>
            c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_COMPARE ? [...c, id] : c,
        );
    const actionsFor = (id: string) => ({
        selected: compare.includes(id),
        canSelect: compare.length < MAX_COMPARE,
        onToggleCompare: () => toggle(id),
        onOpen: () => setOpenId(id),
    });

    const applyRelaxation = async (s: RelaxationSuggestion) => {
        setApplying(s.code);
        const next = await rerun.run(toSearchRequest(fromCriteria(s.criteria)));
        setApplying(null);
        if (next) router.push(`/results/${encodeURIComponent(next.searchId)}`);
    };

    const open = trips.find((r) => r.id === openId) ?? null;
    const featured = recs.slice(0, FEATURED);
    const rest = recs.slice(FEATURED);

    return (
        <ResultsLayout
            headline={
                result.recommendations.length === 0
                    ? 'Nothing fits every requirement'
                    : result.recommendations.length === 1
                      ? 'One trip fits'
                      : `${result.totalViable} trips fit: here are the best ${result.recommendations.length}`
            }
            summary={
                <>
                    <SearchSummary searchId={result.searchId} criteria={result.criteria} />
                    <DataSources sources={result.sources} />
                </>
            }
            notices={<SearchNotices result={result} />}
            overlays={
                <>
                    <TripDetailSheet
                        rec={open}
                        travellers={result.criteria.travellers}
                        open={open !== null}
                        onOpenChange={(o) => !o && setOpenId(null)}
                    />
                    <CompareTray
                        searchId={result.searchId}
                        selected={trips.filter((r) => compare.includes(r.id))}
                        onRemove={(id) => setCompare((c) => c.filter((x) => x !== id))}
                        onClear={() => setCompare([])}
                    />
                </>
            }
        >
            {result.recommendations.length === 0 ? (
                <>
                    <RelaxationPanel
                        suggestions={result.relaxations}
                        onApply={(s) => void applyRelaxation(s)}
                        applying={applying}
                    />
                    {rerun.status === 'error' && (
                        <ErrorState error={rerun.error} title="The new search didn't run" />
                    )}
                </>
            ) : (
                <>
                    {hasPicks && (
                        <BudgetPicks
                            cheapest={result.picks?.cheapest[0]}
                            fullBudget={result.picks?.fullBudget[0]}
                            budget={result.criteria.budget}
                            onOpen={setOpenId}
                            onShowList={showList}
                        />
                    )}
                    {hasPicks && (
                        <div
                            ref={listRef}
                            className="flex scroll-mt-20 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <Tabs value={view} onValueChange={(v) => showList(v as ResultView)}>
                                <TabsList
                                    aria-label="Order results by"
                                    className="h-auto flex-wrap"
                                >
                                    <TabsTrigger value="MATCH">Best match</TabsTrigger>
                                    <TabsTrigger value="CHEAPEST">Cheapest</TabsTrigger>
                                    <TabsTrigger value="FULL_BUDGET">
                                        Best for your budget
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                            <p className="text-muted-foreground text-sm">{VIEW_HINT[view]}</p>
                        </div>
                    )}
                    <section
                        aria-label={VIEW_LABEL[view]}
                        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    >
                        {featured.map((rec, i) => (
                            <ResultCard
                                key={rec.id}
                                rec={rec}
                                rank={i + 1}
                                {...actionsFor(rec.id)}
                            />
                        ))}
                    </section>
                    {rest.length > 0 &&
                        (showAll ? (
                            <section aria-labelledby="more-heading" className="grid gap-2">
                                <h2 id="more-heading" className="text-xl font-semibold">
                                    More options
                                </h2>
                                <ul className="bg-card divide-y rounded-xl border px-5">
                                    {rest.map((rec, i) => (
                                        <ResultRow
                                            key={rec.id}
                                            rec={rec}
                                            rank={i + FEATURED + 1}
                                            {...actionsFor(rec.id)}
                                        />
                                    ))}
                                </ul>
                            </section>
                        ) : (
                            <Button
                                variant="outline"
                                className="w-fit justify-self-center"
                                onClick={() => setShowAll(true)}
                            >
                                <ChevronDownIcon /> View all {recs.length} results
                            </Button>
                        ))}
                </>
            )}
        </ResultsLayout>
    );
}

function ResultsSkeleton() {
    return (
        <div className="grid gap-6" aria-busy="true" aria-label="Loading results">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-96" />
                ))}
            </div>
        </div>
    );
}
