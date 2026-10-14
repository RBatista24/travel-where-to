'use client';

import * as React from 'react';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Spinner } from '@/components/atoms/spinner';
import { Textarea } from '@/components/atoms/textarea';
import { InfoTag } from '@/components/molecules/info-tag';
import { ErrorState } from '@/components/molecules/query-state';
import { useInterpret } from '@/hooks/queries';
import { ATTRIBUTE_LABEL, FACILITY_LABEL, PRIORITY_LABEL } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { describeWeekdays, timesText } from '@/lib/trip-preferences';
import { describeRegions } from '@/lib/regions';
import type { TravelIntent } from '@/lib/types';

const EXAMPLE = "Four nights in November, two adults and a 5-year-old, about €1,000. Warm, by the sea, a heated pool if possible, and no party area.";
// Also understood: "Disneyland Paris for 3 nights in December, a hotel inside the park, 2 days in the park".

/**
 * Natural-language entry (spec §5.4). The text is turned into structured requirements,
 * shown back as an AI interpretation, and only applied to the form when the user says so.
 */
export function DescribeTripBox({ onApply }: { onApply: (intent: TravelIntent, destinationIds: string[]) => void }) {
  const [text, setText] = React.useState('');
  const interpret = useInterpret();
  const intent = interpret.status === 'success' ? interpret.data?.intent : undefined;
  const places = interpret.status === 'success' ? (interpret.data?.destinations ?? []) : [];

  return (
    <section aria-labelledby="describe-heading" className="border-ai/50 bg-card rounded-xl border-[1.5px] border-dotted p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="describe-heading" className="text-lg font-semibold">
          Describe the trip in your own words
        </h2>
        <InfoTag kind="AI" />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">We turn it into the settings below. Nothing changes until you apply it, and you can edit everything after.</p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) void interpret.run(text);
        }}
      >
        <Textarea
          aria-label="Describe the trip"
          rows={3}
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-background min-h-20 resize-y"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={text.trim().length < 3 || interpret.status === 'running'}>
            {interpret.status === 'running' ? <Spinner /> : <SparklesIcon />} Read my description
          </Button>
          {text === '' && (
            <Button type="button" variant="ghost" onClick={() => setText(EXAMPLE)}>
              Use an example
            </Button>
          )}
        </div>
      </form>

      {interpret.status === 'error' && (
        <div className="mt-4">
          <ErrorState error={interpret.error} title="We couldn't read that" />
        </div>
      )}

      {intent && (
        <div className="bg-ai-soft/60 mt-4 grid gap-3 rounded-lg p-4">
          <p className="text-sm font-medium">Here is what we understood</p>
          <IntentSummary intent={intent} places={places.map((p) => p.name)} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                onApply(intent, places.map((p) => p.id));
                interpret.reset();
              }}
            >
              Apply to my search
            </Button>
            <Button type="button" variant="ghost" onClick={interpret.reset}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function IntentSummary({ intent, places }: { intent: TravelIntent; places: string[] }) {
  const facts: string[] = [];
  if (places.length) facts.push(`Going to ${places.join(', ')}`);
  if (intent.regions?.length) facts.push(describeRegions(intent.regions) || 'Anywhere');
  if (intent.parkHotelsOnly) facts.push("Only the park's official hotels");
  if (intent.parkDays) facts.push(`${intent.parkDays} day${intent.parkDays === 1 ? '' : 's'} in the park`);
  if (intent.budget) facts.push(`Budget €${intent.budget.amount.toLocaleString('en-IE')}`);
  if (intent.nights) facts.push(`${intent.nights} nights`);
  if (intent.adults) facts.push(`${intent.adults} adult${intent.adults === 1 ? '' : 's'}`);
  if (intent.childAges?.length) facts.push(`Children aged ${intent.childAges.join(', ')}`);
  if (intent.dateWindow) facts.push(`Between ${formatDate(intent.dateWindow.start)} and ${formatDate(intent.dateWindow.end)}`);
  if (intent.transportModes) facts.push(intent.transportModes.includes('FLIGHT') ? 'Flights only' : 'By car only');
  if (intent.maxDrivingHours) facts.push(`Drive at most ${intent.maxDrivingHours}h`);
  if (intent.directFlightsOnly) facts.push('Direct flights only');
  if (intent.outboundTimes?.length) facts.push(`Outbound in the ${timesText(intent.outboundTimes)}`);
  if (intent.returnTimes?.length) facts.push(`Return in the ${timesText(intent.returnTimes)}`);
  if (intent.departOn?.length && intent.returnOn?.length) facts.push(`Travel ${describeWeekdays({ departOn: intent.departOn, returnOn: intent.returnOn })}`);
  if (intent.minAvgHighC !== undefined) facts.push(`At least ${intent.minAvgHighC}°C`);
  return (
    <div className="grid gap-2 text-sm">
      {facts.length > 0 && <p>{facts.join(' · ')}</p>}
      {intent.requirements.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {intent.requirements.map((r) => (
            <li key={r.kind === 'DESTINATION' ? r.attribute : r.facility} className="bg-card rounded-full border px-2.5 py-0.5">
              {r.kind === 'DESTINATION' ? ATTRIBUTE_LABEL[r.attribute] : FACILITY_LABEL[r.facility]}
              <span className="text-muted-foreground"> · {PRIORITY_LABEL[r.priority]}</span>
            </li>
          ))}
        </ul>
      )}
      {intent.unmapped.length > 0 && (
        <p className="text-muted-foreground">Not used (we can't search for these yet): {intent.unmapped.map((u) => `“${u}”`).join(', ')}</p>
      )}
      {facts.length === 0 && intent.requirements.length === 0 && <p className="text-muted-foreground">We didn't find anything we can search for. Try mentioning places, dates or what you want nearby.</p>}
    </div>
  );
}
