'use client';

import { CarFrontIcon, PlaneTakeoffIcon } from 'lucide-react';
import { Checkbox } from '@/components/atoms/checkbox';
import { Input } from '@/components/atoms/input';
import { Label } from '@/components/atoms/label';
import { NativeSelect } from '@/components/atoms/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/toggle-group';
import { FieldGroup } from '@/components/molecules/field-group';
import { FormField } from '@/components/molecules/form-field';
import type { FormSectionProps, SearchFormState } from '@/lib/search-form';
import type { TransportMode } from '@/lib/types';
import { TIMES_OF_DAY, type TimeOfDay } from '@/lib/trip-preferences';

/** Flight, car or both; driving limits; the user's own car for fuel estimates. */
export function TransportSection({ form, update, errors }: FormSectionProps) {
    const car = form.modes.includes('CAR');
    const flight = form.modes.includes('FLIGHT');
    return (
        <FieldGroup
            title="Getting there"
            description="With both selected, we compare flying and driving for each place."
        >
            <ToggleGroup
                type="multiple"
                variant="outline"
                value={form.modes}
                onValueChange={(v) => update({ modes: v as TransportMode[] })}
                aria-label="Transport"
                className="w-full sm:w-auto"
            >
                <ToggleGroupItem
                    value="FLIGHT"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-4"
                >
                    <PlaneTakeoffIcon /> Fly
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="CAR"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-4"
                >
                    <CarFrontIcon /> Drive
                </ToggleGroupItem>
            </ToggleGroup>
            {errors.modes && <p className="text-destructive text-sm">{errors.modes}</p>}

            {flight && (
                <div className="grid gap-4 rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="directOnly"
                            checked={form.directOnly}
                            onCheckedChange={(v) => update({ directOnly: v === true })}
                        />
                        <Label htmlFor="directOnly" className="font-normal">
                            Direct flights only
                        </Label>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <TimePicker
                            id="outboundTimes"
                            label="Outbound flight leaves"
                            value={form.outboundTimes}
                            onChange={(v) => update({ outboundTimes: v })}
                        />
                        <TimePicker
                            id="returnTimes"
                            label="Return flight leaves"
                            value={form.returnTimes}
                            onChange={(v) => update({ returnTimes: v })}
                        />
                    </div>
                    <p className="text-muted-foreground text-xs">
                        Local time at the departure airport. Nothing selected means any time.
                        Flights outside your choices are left out.
                    </p>
                </div>
            )}

            {car && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        id="maxDrivingHours"
                        label="Never drive more than (hours)"
                        hint="Longer drives are left out."
                    >
                        <Input
                            type="number"
                            min={1}
                            step={0.5}
                            placeholder="No limit"
                            value={form.maxDrivingHours}
                            onChange={(e) => update({ maxDrivingHours: e.target.value })}
                        />
                    </FormField>
                    <FormField
                        id="preferredDrivingHours"
                        label="Prefer driving less than (hours)"
                        hint="Longer drives score lower."
                    >
                        <Input
                            type="number"
                            min={1}
                            step={0.5}
                            placeholder="No preference"
                            value={form.preferredDrivingHours}
                            onChange={(e) => update({ preferredDrivingHours: e.target.value })}
                        />
                    </FormField>
                </div>
            )}

            <div className="grid gap-3">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="useVehicle"
                        checked={form.useVehicle}
                        onCheckedChange={(v) => update({ useVehicle: v === true })}
                    />
                    <Label htmlFor="useVehicle" className="font-normal">
                        Use my car for fuel estimates{' '}
                        <span className="text-muted-foreground">
                            (also used for driving to the airport)
                        </span>
                    </Label>
                </div>
                {form.useVehicle && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <FormField id="fuelType" label="Fuel">
                            <NativeSelect
                                value={form.fuelType}
                                onChange={(e) =>
                                    update({
                                        fuelType: e.target.value as SearchFormState['fuelType'],
                                    })
                                }
                            >
                                <option value="DIESEL">Diesel</option>
                                <option value="PETROL">Petrol</option>
                                <option value="LPG">LPG</option>
                                <option value="ELECTRIC">Electric</option>
                            </NativeSelect>
                        </FormField>
                        <FormField
                            id="consumption"
                            label={
                                form.fuelType === 'ELECTRIC'
                                    ? 'kWh per 100 km'
                                    : 'Litres per 100 km'
                            }
                        >
                            <Input
                                type="number"
                                min={0.1}
                                step={0.1}
                                value={form.consumption}
                                onChange={(e) => update({ consumption: e.target.value })}
                            />
                        </FormField>
                        <FormField
                            id="fuelPrice"
                            label={form.fuelType === 'ELECTRIC' ? '€ per kWh' : '€ per litre'}
                        >
                            <Input
                                type="number"
                                min={0.01}
                                step={0.01}
                                value={form.fuelPrice}
                                onChange={(e) => update({ fuelPrice: e.target.value })}
                            />
                        </FormField>
                    </div>
                )}
            </div>
        </FieldGroup>
    );
}

function TimePicker({
    id,
    label,
    value,
    onChange,
}: {
    id: string;
    label: string;
    value: TimeOfDay[];
    onChange: (v: TimeOfDay[]) => void;
}) {
    return (
        <div className="grid gap-2">
            <span id={`${id}-label`} className="text-sm font-medium">
                {label}
            </span>
            <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                value={value}
                onValueChange={(v) => onChange(v as TimeOfDay[])}
                aria-labelledby={`${id}-label`}
                className="grid w-full grid-cols-4"
            >
                {TIMES_OF_DAY.map((t) => (
                    <ToggleGroupItem
                        key={t.value}
                        value={t.value}
                        className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-auto flex-col gap-0 py-1.5"
                        aria-label={`${t.label}, ${t.hours}`}
                    >
                        <span>{t.label}</span>
                        <span className="text-[10px] opacity-75">{t.hours}</span>
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </div>
    );
}
