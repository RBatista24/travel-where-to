import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** shadcn-style select built on the native <select>: accessible and mobile-friendly. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative w-full', className)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          'border-input dark:bg-input/30 h-9 w-full min-w-0 appearance-none rounded-md border bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
    </div>
  );
}

export { NativeSelect };
