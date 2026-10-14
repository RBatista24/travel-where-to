'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Card, CardContent } from '@/components/atoms/card';
import { Skeleton } from '@/components/atoms/skeleton';
import { EmptyState } from '@/components/molecules/empty-state';
import { ErrorState } from '@/components/molecules/query-state';
import { CompareTable } from '@/components/organisms/compare-table';
import { PageLayout } from '@/components/templates/page-layout';
import { useSearchResult } from '@/hooks/queries';
import { findTrip } from '@/lib/result-views';

export function ComparePage({ searchId, destinationIds }: { searchId: string; destinationIds: readonly string[] }) {
  const result = useSearchResult(searchId);
  const back = (
    <Button asChild variant="outline">
      <Link href={`/results/${encodeURIComponent(searchId)}`}>
        <ArrowLeftIcon /> Back to results
      </Link>
    </Button>
  );
  if (result.status === 'loading') return <Skeleton className="h-96 w-full" />;
  if (result.status === 'error') return <ErrorState error={result.error} onRetry={result.reload} />;
  const recs = destinationIds.map((key) => findTrip(result.data, key)).filter((r) => r !== undefined);
  return (
    <PageLayout title="Side by side" description="The same facts for each trip. Prices are the ones found in this search." actions={back}>
      <Card className="py-0">
        <CardContent className="p-0 sm:p-2">
          {recs.length >= 2 ? <CompareTable recs={recs} /> : <EmptyState title="Pick at least two trips to compare" description="Tick “Compare” on the results you like." action={back} />}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
