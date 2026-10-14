import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import { formatAgo, plural } from '@/lib/format';
import { Amount } from '@/components/molecules/amount';
import { describeDates, describeTravellers } from '@/components/organisms/search-summary';
import type { RecentSearch } from '@/lib/types';

export function RecentSearchesList({ searches }: { searches: readonly RecentSearch[] }) {
    return (
        <ul className="bg-card divide-y rounded-xl border">
            {searches.map((s) => (
                <li key={s.searchId}>
                    <Link
                        href={`/results/${encodeURIComponent(s.searchId)}`}
                        className="hover:bg-accent/50 flex items-center gap-4 px-5 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="font-medium">
                                {describeDates(s.criteria.dates)} ·{' '}
                                {describeTravellers(s.criteria.travellers)}
                            </p>
                            <p className="text-muted-foreground text-sm">
                                {plural(s.results, 'trip')} found ·{' '}
                                {s.top.length > 0
                                    ? s.top.map((t, i) => (
                                          <span key={t.name}>
                                              {i > 0 && ', '}
                                              {t.name} <Amount value={t.tripTotal} rounded />
                                          </span>
                                      ))
                                    : 'no matches'}{' '}
                                · {formatAgo(s.createdAt)}
                            </p>
                        </div>
                        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                    </Link>
                </li>
            ))}
        </ul>
    );
}
