import { SearchPage } from '@/components/pages/search-page';

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return <SearchPage key={from ?? 'new'} {...(from ? { fromSearchId: from } : {})} />;
}
