'use client';

import * as React from 'react';
import { Checkbox } from '@/components/atoms/checkbox';
import { Input } from '@/components/atoms/input';
import { Label } from '@/components/atoms/label';
import { ChoiceChip } from '@/components/molecules/choice-chip';
import { FieldGroup } from '@/components/molecules/field-group';
import { FormField } from '@/components/molecules/form-field';
import { RequirementRow } from '@/components/molecules/requirement-row';
import { ATTRIBUTE_LABEL, FACILITY_LABEL } from '@/lib/labels';
import { requirementKey, setPriority, upsertRequirement, type FormRequirement, type FormSectionProps } from '@/lib/search-form';
import type { AccommodationFacility, DestinationAttribute } from '@/lib/types';

const ATTRIBUTES = Object.keys(ATTRIBUTE_LABEL) as DestinationAttribute[];
const FACILITIES = Object.keys(FACILITY_LABEL) as AccommodationFacility[];

const labelOf = (r: FormRequirement) => (r.kind === 'DESTINATION' ? ATTRIBUTE_LABEL[r.attribute] : FACILITY_LABEL[r.facility]);

/** What the trip should (and should not) have, each with a priority. */
export function PreferencesSection({ form, update }: FormSectionProps) {
  const chosen = new Set(form.requirements.map(requirementKey));
  const replace = (list: FormRequirement[]) => update({ requirements: list });

  return (
    <FieldGroup title="What matters to you" description="Pick a priority for each. Must-haves rule places out; the rest shape the Match Score.">
      {form.requirements.length > 0 ? (
        <ul className="divide-y">
          {form.requirements.map((r) => (
            <RequirementRow
              key={requirementKey(r)}
              requirement={r}
              label={labelOf(r)}
              onPriority={(p) => replace(upsertRequirement(form.requirements, setPriority(r, p)))}
              onRemove={() => replace(form.requirements.filter((x) => requirementKey(x) !== requirementKey(r)))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Nothing yet. Add what you care about, or describe the trip above.</p>
      )}

      <div className="grid gap-3">
        <ChipRow title="The place">
          {ATTRIBUTES.filter((a) => !chosen.has(`a:${a}`)).map((a) => (
            <ChoiceChip
              key={a}
              label={ATTRIBUTE_LABEL[a]}
              onClick={() => replace(upsertRequirement(form.requirements, { kind: 'DESTINATION', attribute: a, priority: a === 'nightlife' ? 'AVOID' : 'IMPORTANT', source: 'USER' }))}
            />
          ))}
        </ChipRow>
        <ChipRow title="The stay">
          {FACILITIES.filter((f) => !chosen.has(`f:${f}`)).map((f) => (
            <ChoiceChip
              key={f}
              label={FACILITY_LABEL[f]}
              onClick={() => replace(upsertRequirement(form.requirements, { kind: 'FACILITY', facility: f, priority: 'IMPORTANT', source: 'USER' }))}
            />
          ))}
        </ChipRow>
      </div>

      <div className="grid items-end gap-4 sm:grid-cols-2">
        <FormField id="minAvgHighC" label="Warmest part of the day at least (°C)" hint="Uses forecasts close to the date, climate averages otherwise.">
          <Input type="number" min={-10} max={40} placeholder="Any" value={form.minAvgHighC} onChange={(e) => update({ minAvgHighC: e.target.value })} />
        </FormField>
        <div className="flex items-center gap-2 pb-6">
          <Checkbox id="preferWarm" checked={form.preferWarm} onCheckedChange={(v) => update({ preferWarm: v === true })} />
          <Label htmlFor="preferWarm" className="font-normal">
            The warmer the better
          </Label>
        </div>
      </div>
    </FieldGroup>
  );
}

function ChipRow({ title, children }: { title: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2">
      <span className="text-muted-foreground text-xs">{title}</span>
      <div className="flex flex-wrap gap-2">{items}</div>
    </div>
  );
}
