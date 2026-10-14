import * as React from 'react';
import { cn } from '@/lib/utils';

/** A titled group of fields inside a form section. */
export function FieldGroup({ title, description, children, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('grid gap-4', className)}>
      <div>
        <legend className="font-display text-lg font-semibold">{title}</legend>
        {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
