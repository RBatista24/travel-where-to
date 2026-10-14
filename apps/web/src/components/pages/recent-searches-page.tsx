'use client';

import Link from 'next/link';
import { HistoryIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Skeleton } from '@/components/atoms/skeleton';
import { EmptyState } from '@/components/molecules/empty-state';
import { ErrorState } from '@/components/molecules/query-state';
import { RecentSearchesList } from '@/components/organisms/recent-searches-list';
import { PageLayout } from '@/components/templates/page-layout';
import { useRecentSearches } from '@/hooks/queries';

export function RecentSearchesPage() {
  const searches = useRecentSearches();
  return (
    <PageLayout title="Recent searches" description="Every search is kept with its results, so you can reopen or change it.">
      {searches.status === 'loading' && <Skeleton className="h-48 w-full" />}
      {searches.status === 'error' && <ErrorState error={searches.error} onRetry={searches.reload} />}
      {searches.status === 'success' &&
        (searches.data.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon />}
            title="No searches yet"
            description="Your searches show up here once you run one."
            action={
              <Button asChild>
                <Link href="/">Start a search</Link>
              </Button>
            }
          />
        ) : (
          <RecentSearchesList searches={searches.data} />
        ))}
    </PageLayout>
  );
}
