'use client';

import { XIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { InfoTag } from '@/components/molecules/info-tag';
import { PriorityPicker } from '@/components/molecules/priority-picker';
import type { FormRequirement } from '@/lib/search-form';
import type { RequirementPriority } from '@/lib/types';

/** One requirement: what, how much it matters, and whether the AI or the user set it. */
export function RequirementRow({
  requirement,
  label,
  onPriority,
  onRemove,
}: {
  requirement: FormRequirement;
  label: string;
  onPriority: (p: RequirementPriority) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-medium">{label}</span>
        {requirement.source === 'AI_INTERPRETATION' && <InfoTag kind="AI" />}
      </div>
      <div className="flex items-center gap-1">
        <PriorityPicker label={label} value={requirement.priority} onChange={(p) => (p ? onPriority(p) : onRemove())} />
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onRemove} aria-label={`Remove ${label}`}>
          <XIcon />
        </Button>
      </div>
    </li>
  );
}
