'use client';

import type * as React from 'react';
import { FerrisWheelIcon } from 'lucide-react';
import { Checkbox } from '@/components/atoms/checkbox';
import { Input } from '@/components/atoms/input';
import { Label } from '@/components/atoms/label';
import { FieldGroup } from '@/components/molecules/field-group';
import { FormField } from '@/components/molecules/form-field';
import { InfoTag } from '@/components/molecules/info-tag';
import { useDestinations } from '@/hooks/queries';
import { nightsBetween, weekdaysOf, type FormSectionProps } from '@/lib/search-form';
import { patternNights } from '@/lib/trip-preferences';

/**
 * Shown when the search can reach a theme park (a park destination picked, or theme parks
 * wanted): entrance tickets and "only the park's official hotels".
 */
export function ThemeParkSection({
    form,
    update,
    errors,
    separator,
}: FormSectionProps & { separator?: React.ReactNode }) {
    const destinations = useDestinations();
    const list = destinations.status === 'success' ? destinations.data : [];
    const picked =
        form.destinationMode === 'KNOWN'
            ? list.filter((d) => form.destinationIds.includes(d.id) && d.park)
            : [];
    const wantsParks = form.requirements.some(
        (r) => r.kind === 'DESTINATION' && r.attribute === 'themePark' && r.priority !== 'AVOID',
    );
    if (picked.length === 0 && !wantsParks) return null;

    const days = weekdaysOf(form);
    let nights = form.nights;
    if (form.dateMode === 'EXACT') nights = nightsBetween(form.checkIn, form.checkOut);
    else if (days) nights = patternNights(days.departOn, days.returnOn);
    const maxDays = Math.max(4, ...picked.map((d) => d.park?.maxTicketDays ?? 0));
    const parkNames = picked.length ? picked.map((d) => d.park?.name).join(', ') : 'theme parks';

    return (
        <>
            {separator}
            <FieldGroup
                title="Theme park"
                description={<>For {parkNames}. Applies only to theme-park destinations.</>}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="includeParkTickets"
                                checked={form.includeParkTickets}
                                onCheckedChange={(v) => update({ includeParkTickets: v === true })}
                            />
                            <Label htmlFor="includeParkTickets" className="font-normal">
                                Include entrance tickets in the budget
                            </Label>
                        </div>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                            <InfoTag kind="ESTIMATED" /> Prices change by date, so we use the middle
                            of the published range and link to the official site.
                        </p>
                    </div>
                    {form.includeParkTickets && (
                        <FormField
                            id="parkDays"
                            label="Days in the park"
                            error={errors.parkDays}
                            hint={`Longest ticket sold: ${maxDays} days. Under-3s go free.`}
                        >
                            <Input
                                type="number"
                                min={1}
                                max={7}
                                placeholder={`${Math.min(Math.max(nights, 1), maxDays)} (one per night)`}
                                value={form.parkDays}
                                onChange={(e) => update({ parkDays: e.target.value })}
                            />
                        </FormField>
                    )}
                </div>
                <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="parkHotelsOnly"
                            checked={form.parkHotelsOnly}
                            onCheckedChange={(v) => update({ parkHotelsOnly: v === true })}
                        />
                        <Label htmlFor="parkHotelsOnly" className="font-normal">
                            Only stay in the park&apos;s official hotels
                        </Label>
                    </div>
                    {picked.map((d) => (
                        <p
                            key={d.id}
                            className="text-muted-foreground flex items-start gap-1.5 pl-6 text-xs"
                        >
                            <FerrisWheelIcon className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                                {d.park?.name}: {d.park?.officialHotels.join(' · ')}
                            </span>
                        </p>
                    ))}
                </div>
            </FieldGroup>
        </>
    );
}
