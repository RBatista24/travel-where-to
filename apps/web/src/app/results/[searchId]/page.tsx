import { ResultsPage } from '@/components/pages/results-page';

export default async function Page({ params }: { params: Promise<{ searchId: string }> }) {
    const { searchId } = await params;
    return <ResultsPage searchId={decodeURIComponent(searchId)} />;
}
