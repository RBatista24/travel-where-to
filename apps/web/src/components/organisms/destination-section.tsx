'use client';

import { XIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { NativeSelect } from '@/components/atoms/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/toggle-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/atoms/tabs';
import { FieldGroup } from '@/components/molecules/field-group';
import { useDestinations } from '@/hooks/queries';
import type { FormSectionProps } from '@/lib/search-form';
import { OUTSIDE_EUROPE, REGION_OPTIONS, regionLabel } from '@/lib/regions';
import type { Region } from '@/lib/types';

/** Discover destinations, or compare specific ones the user already has in mind. */
/** Placeholder for the destination picker while the list loads or fails. */
const PICKER_PLACEHOLDER: Partial<Record<string, string>> = {
    loading: 'Loading destinations…',
    error: "Couldn't load destinations",
};

export function DestinationSection({ form, update, errors }: FormSectionProps) {
    const destinations = useDestinations();
    const list = destinations.status === 'success' ? destinations.data : [];
    const nameOf = (id: string) => list.find((d) => d.id === id)?.name ?? id;
    const outside =
        form.regions.length === OUTSIDE_EUROPE.length &&
        OUTSIDE_EUROPE.every((r) => form.regions.includes(r));
    const inRegions = list.filter((d) => form.regions.includes(d.region)).length;
    return (
        <FieldGroup title="Where to">
            <Tabs
                value={form.destinationMode}
                onValueChange={(v) => update({ destinationMode: v as 'DISCOVER' | 'KNOWN' })}
            >
                <TabsList aria-label="Destination">
                    <TabsTrigger value="DISCOVER">Surprise me</TabsTrigger>
                    <TabsTrigger value="KNOWN">I know where</TabsTrigger>
                </TabsList>
            </Tabs>
            {form.destinationMode === 'DISCOVER' ? (
                <div className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span id="regions-label" className="text-sm font-medium">
                            Where in the world
                        </span>
                        <div className="flex gap-1">
                            <Button
                                type="button"
                                size="sm"
                                variant={outside ? 'secondary' : 'ghost'}
                                onClick={() =>
                                    update({ regions: outside ? [] : [...OUTSIDE_EUROPE] })
                                }
                            >
                                Outside Europe
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={form.regions.length === 0 ? 'secondary' : 'ghost'}
                                onClick={() => update({ regions: [] })}
                            >
                                Anywhere
                            </Button>
                        </div>
                    </div>
                    <ToggleGroup
                        type="multiple"
                        variant="outline"
                        size="sm"
                        value={form.regions}
                        onValueChange={(v) => update({ regions: v as Region[] })}
                        aria-labelledby="regions-label"
                        className="grid w-full grid-cols-2 sm:grid-cols-3"
                    >
                        {REGION_OPTIONS.map((r) => (
                            <ToggleGroupItem
                                key={r.value}
                                value={r.value}
                                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                            >
                                {r.label}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                    <p className="text-muted-foreground text-sm">
                        {form.regions.length === 0
                            ? `We look across all ${list.length || ''} places we cover and rank the ones that fit.`.replace(
                                  '  ',
                                  ' ',
                              )
                            : `${inRegions} place${inRegions === 1 ? '' : 's'} in your selection.`}
                    </p>
                </div>
            ) : (
                <div className="grid gap-3">
                    <NativeSelect
                        aria-label="Add a destination"
                        value=""
                        disabled={destinations.status !== 'success'}
                        onChange={(e) =>
                            e.target.value &&
                            update({
                                destinationIds: [
                                    ...new Set([...form.destinationIds, e.target.value]),
                                ],
                            })
                        }
                    >
                        <option value="">
                            {PICKER_PLACEHOLDER[destinations.status] ?? 'Add a destination…'}
                        </option>
                        {REGION_OPTIONS.map((r) => {
                            const inRegion = list.filter(
                                (d) => d.region === r.value && !form.destinationIds.includes(d.id),
                            );
                            return inRegion.length === 0 ? null : (
                                <optgroup key={r.value} label={regionLabel(r.value)}>
                                    {inRegion.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}, {d.country}
                                        </option>
                                    ))}
                                </optgroup>
                            );
                        })}
                    </NativeSelect>
                    {form.destinationIds.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                            {form.destinationIds.map((id) => (
                                <li
                                    key={id}
                                    className="bg-secondary inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
                                >
                                    {nameOf(id)}
                                    <button
                                        type="button"
                                        className="hover:bg-background rounded-full p-0.5"
                                        aria-label={`Remove ${nameOf(id)}`}
                                        onClick={() =>
                                            update({
                                                destinationIds: form.destinationIds.filter(
                                                    (x) => x !== id,
                                                ),
                                            })
                                        }
                                    >
                                        <XIcon className="size-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {errors.destinationIds && (
                        <p className="text-destructive text-sm">{errors.destinationIds}</p>
                    )}
                </div>
            )}
        </FieldGroup>
    );
}
