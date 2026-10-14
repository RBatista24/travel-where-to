'use client';

import { Input } from '@/components/atoms/input';
import { NativeSelect } from '@/components/atoms/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/atoms/tabs';
import { FieldGroup } from '@/components/molecules/field-group';
import { FormField } from '@/components/molecules/form-field';
import { ORIGINS, nightsBetween, weekdaysOf, type FormSectionProps } from '@/lib/search-form';
import { countPatternTrips, patternNights, WEEKDAY_NAMES, WEEKDAY_ORDER, WEEKDAY_PRESETS, type WeekdayPreset } from '@/lib/trip-preferences';
import { plural } from '@/lib/format';

/** Origin, dates (exact or flexible window), nights and budget. */
export function TripBasicsSection({ form, update, errors }: FormSectionProps) {
  const exactNights = nightsBetween(form.checkIn, form.checkOut);
  const days = weekdaysOf(form);
  return (
    <FieldGroup title="When, from where and how much" description="The budget covers transport and accommodation. Food is estimated separately.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="origin" label="Leaving from">
          <NativeSelect value={form.originId} onChange={(e) => update({ originId: e.target.value })}>
            {ORIGINS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="budget" label="Total budget (€)" error={errors.budget} hint="For everyone, the whole trip.">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={50}
            value={Number.isFinite(form.budget) ? form.budget : ''}
            onChange={(e) => update({ budget: Number(e.target.value) })}
          />
        </FormField>
      </div>

      <Tabs value={form.dateMode} onValueChange={(v) => update({ dateMode: v as 'EXACT' | 'FLEXIBLE' })}>
        <TabsList aria-label="Date type">
          <TabsTrigger value="FLEXIBLE">Flexible window</TabsTrigger>
          <TabsTrigger value="EXACT">Exact dates</TabsTrigger>
        </TabsList>
      </Tabs>

      {form.dateMode === 'EXACT' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="checkIn" label="Check-in">
            <Input type="date" value={form.checkIn} onChange={(e) => update({ checkIn: e.target.value })} />
          </FormField>
          <FormField id="checkOut" label="Check-out" error={errors.checkOut}>
            <Input type="date" value={form.checkOut} min={form.checkIn} onChange={(e) => update({ checkOut: e.target.value })} />
          </FormField>
          <div className="text-muted-foreground self-end pb-2 text-sm">{exactNights > 0 ? plural(exactNights, 'night') : ''}</div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="windowStart" label="Earliest departure">
              <Input type="date" value={form.windowStart} onChange={(e) => update({ windowStart: e.target.value })} />
            </FormField>
            <FormField id="windowEnd" label="Latest return" error={errors.windowEnd}>
              <Input type="date" value={form.windowEnd} min={form.windowStart} onChange={(e) => update({ windowEnd: e.target.value })} />
            </FormField>
            <FormField id="weekdayPreset" label="Days of the week" hint={days ? undefined : 'Any day you like.'}>
              <NativeSelect value={form.weekdayPreset} onChange={(e) => update({ weekdayPreset: e.target.value as WeekdayPreset })}>
                {WEEKDAY_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {!days ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="nights" label="Nights" error={errors.nights} hint="Exactly this many.">
                <Input type="number" min={1} max={30} value={form.nights} onChange={(e) => update({ nights: Number(e.target.value) })} />
              </FormField>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {form.weekdayPreset === 'CUSTOM' && (
                <>
                  <FormField id="departDay" label="Leave on">
                    <NativeSelect value={String(form.departDay)} onChange={(e) => update({ departDay: Number(e.target.value) })}>
                      {WEEKDAY_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_NAMES[d]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField id="returnDay" label="Come back on">
                    <NativeSelect value={String(form.returnDay)} onChange={(e) => update({ returnDay: Number(e.target.value) })}>
                      {WEEKDAY_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_NAMES[d]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </>
              )}
              <p className={`text-muted-foreground self-end pb-2 text-sm ${form.weekdayPreset === 'CUSTOM' ? '' : 'sm:col-span-3'}`}>
                {plural(patternNights(days.departOn, days.returnOn), 'night')}, leaving every {WEEKDAY_NAMES[days.departOn]} ·{' '}
                {plural(countPatternTrips(form.windowStart, form.windowEnd, days.departOn, days.returnOn), 'option')} in the window
              </p>
            </div>
          )}
        </div>
      )}
    </FieldGroup>
  );
}
