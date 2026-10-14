'use client';

import { BuildingIcon, HouseIcon } from 'lucide-react';
import { Input } from '@/components/atoms/input';
import { NativeSelect } from '@/components/atoms/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/toggle-group';
import { FieldGroup } from '@/components/molecules/field-group';
import { FormField } from '@/components/molecules/form-field';
import type { FormSectionProps } from '@/lib/search-form';
import type { AccommodationType } from '@/lib/types';

/** Hard accommodation filters. Facilities with priorities live in the preferences section. */
export function StaySection({ form, update, errors }: FormSectionProps) {
    return (
        <FieldGroup
            title="Where to stay"
            description="These are strict: places that don't meet them are not shown."
        >
            <ToggleGroup
                type="multiple"
                variant="outline"
                value={form.accommodationTypes}
                onValueChange={(v) => update({ accommodationTypes: v as AccommodationType[] })}
                aria-label="Accommodation type"
                className="w-full sm:w-auto"
            >
                <ToggleGroupItem
                    value="HOTEL"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-4"
                >
                    <BuildingIcon /> Hotels
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="APARTMENT"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-4"
                >
                    <HouseIcon /> Apartments
                </ToggleGroupItem>
            </ToggleGroup>
            {errors.accommodationTypes && (
                <p className="text-destructive text-sm">{errors.accommodationTypes}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField id="minStars" label="Hotel stars">
                    <NativeSelect
                        value={form.minStars}
                        onChange={(e) => update({ minStars: e.target.value })}
                    >
                        <option value="">Any</option>
                        <option value="3">3★ or more</option>
                        <option value="4">4★ or more</option>
                        <option value="5">5★</option>
                    </NativeSelect>
                </FormField>
                <FormField id="minRating" label="Guest rating">
                    <NativeSelect
                        value={form.minRating}
                        onChange={(e) => update({ minRating: e.target.value })}
                    >
                        <option value="">Any</option>
                        <option value="7">7+ Good</option>
                        <option value="7.5">7.5+</option>
                        <option value="8">8+ Very good</option>
                        <option value="8.5">8.5+</option>
                        <option value="9">9+ Superb</option>
                    </NativeSelect>
                </FormField>
                <FormField id="maxDistanceToCentreKm" label="Max. to centre (km)">
                    <Input
                        type="number"
                        min={0.1}
                        step={0.1}
                        placeholder="Any"
                        value={form.maxDistanceToCentreKm}
                        onChange={(e) => update({ maxDistanceToCentreKm: e.target.value })}
                    />
                </FormField>
                <FormField id="maxDistanceToBeachM" label="Max. to beach (m)">
                    <Input
                        type="number"
                        min={50}
                        step={50}
                        placeholder="Any"
                        value={form.maxDistanceToBeachM}
                        onChange={(e) => update({ maxDistanceToBeachM: e.target.value })}
                    />
                </FormField>
            </div>
        </FieldGroup>
    );
}
