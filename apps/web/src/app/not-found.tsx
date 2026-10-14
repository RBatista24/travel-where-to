import Link from 'next/link';
import { Button } from '@/components/atoms/button';
import { EmptyState } from '@/components/molecules/empty-state';

export default function NotFound() {
  return (
    <EmptyState
      title="This page doesn't exist"
      description="The link may be old, or the search was cleared when the API restarted."
      action={
        <Button asChild>
          <Link href="/">Start a new search</Link>
        </Button>
      }
    />
  );
}
