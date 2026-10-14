'use client';

import * as React from 'react';
import { SearchIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Card, CardContent } from '@/components/atoms/card';
import { Separator } from '@/components/atoms/separator';
import { Spinner } from '@/components/atoms/spinner';
import { ErrorState } from '@/components/molecules/query-state';
import { DescribeTripBox } from '@/components/organisms/describe-trip-box';
import { DestinationSection } from '@/components/organisms/destination-section';
import { PreferencesSection } from '@/components/organisms/preferences-section';
import { StaySection } from '@/components/organisms/stay-section';
import { TransportSection } from '@/components/organisms/transport-section';
import { TravellersSection } from '@/components/organisms/travellers-section';
import { TripBasicsSection } from '@/components/organisms/trip-basics-section';
import { ThemeParkSection } from '@/components/organisms/theme-park-section';
import { applyIntent, validateForm, type SearchFormState } from '@/lib/search-form';

/**
 * The whole search: natural-language box on top, structured sections below.
 * Controlled by the page so a stored search can be reopened and edited.
 */
export function SearchForm({
    form,
    onChange,
    onSubmit,
    submitting,
    submitError,
    aside,
}: {
    form: SearchFormState;
    onChange: (next: SearchFormState) => void;
    onSubmit: () => void;
    submitting: boolean;
    submitError?: unknown;
    aside?: React.ReactNode;
}) {
    const [showErrors, setShowErrors] = React.useState(false);
    const errors = validateForm(form);
    const visibleErrors = showErrors ? errors : {};
    const update = (patch: Partial<SearchFormState>) => onChange({ ...form, ...patch });
    const props = { form, update, errors: visibleErrors };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setShowErrors(true);
        if (Object.keys(errors).length === 0) onSubmit();
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8">
            <div className="grid gap-6">
                <DescribeTripBox
                    onApply={(intent, destinationIds) =>
                        onChange(applyIntent(form, intent, destinationIds))
                    }
                />
                <form id="search-form" onSubmit={submit} noValidate>
                    <Card className="gap-0 py-0">
                        <CardContent className="grid gap-8 p-5 sm:p-6">
                            <TripBasicsSection {...props} />
                            <Separator />
                            <TravellersSection {...props} />
                            <Separator />
                            <DestinationSection {...props} />
                            <Separator />
                            <PreferencesSection {...props} />
                            <Separator />
                            <TransportSection {...props} />
                            <Separator />
                            <StaySection {...props} />
                            <ThemeParkSection {...props} separator={<Separator />} />
                        </CardContent>
                    </Card>
                </form>
            </div>

            <aside className="grid gap-6 lg:sticky lg:top-20">
                <div className="bg-card grid gap-3 rounded-xl border p-5">
                    <Button
                        type="submit"
                        form="search-form"
                        size="lg"
                        className="w-full"
                        disabled={submitting}
                    >
                        {submitting ? <Spinner /> : <SearchIcon />}{' '}
                        {submitting ? 'Searching flights, drives and stays…' : 'Find trips'}
                    </Button>
                    {showErrors && Object.keys(errors).length > 0 && (
                        <p className="text-destructive text-sm">
                            Fix the highlighted fields first.
                        </p>
                    )}
                    {submitError !== undefined && (
                        <ErrorState error={submitError} title="The search didn't run" />
                    )}
                </div>
                {aside}
            </aside>
        </div>
    );
}
