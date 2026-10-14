import * as React from 'react';
import { PageHeader } from '@/components/molecules/page-header';

/** Standard page: header, then content with consistent spacing. */
export function PageLayout({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
