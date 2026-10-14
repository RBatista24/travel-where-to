import { ComparePage } from '@/components/pages/compare-page';

export default async function Page({ params, searchParams }: { params: Promise<{ searchId: string }>; searchParams: Promise<{ d?: string }> }) {
  const { searchId } = await params;
  const { d } = await searchParams;
  return <ComparePage searchId={decodeURIComponent(searchId)} destinationIds={(d ?? '').split(',').filter(Boolean)} />;
}
