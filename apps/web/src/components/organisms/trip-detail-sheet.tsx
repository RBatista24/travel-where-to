'use client';

import * as React from 'react';
import { ExternalLinkIcon, MapPinIcon, StarIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Separator } from '@/components/atoms/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/atoms/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { Amount } from '@/components/molecules/amount';
import { MatchScore } from '@/components/molecules/match-score';
import { ReasonList } from '@/components/molecules/reason-list';
import { ScoreBreakdown } from '@/components/molecules/score-breakdown';
import { CostLedger } from '@/components/organisms/cost-ledger';
import { BOOKING_SITE, FACILITY_LABEL, providerLabel } from '@/lib/labels';
import { formatDateRange, formatDayShort, formatDistance, formatDuration } from '@/lib/format';
import type { SearchCriteria, TripRecommendation } from '@/lib/types';

/** Everything about one trip: why it ranks, how you get there, where you stay, what it costs. */
export function TripDetailSheet({
  rec,
  travellers,
  open,
  onOpenChange,
}: {
  rec: TripRecommendation | null;
  travellers: SearchCriteria['travellers'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {rec && (
          <>
            <SheetHeader className="border-b p-5 pr-12">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <SheetTitle className="font-display text-2xl">{rec.destination.name}</SheetTitle>
                  <SheetDescription>
                    {rec.destination.country} · {formatDateRange(rec.checkIn, rec.checkOut)} · {rec.nights} nights
                  </SheetDescription>
                </div>
                <MatchScore score={rec.score.total} size="md" />
              </div>
            </SheetHeader>
            <div className="grid gap-7 p-5">
              <Section title="Why it scores this way">
                <ReasonList reasons={rec.reasons} />
                <ScoreBreakdown score={rec.score} className="mt-4" />
              </Section>
              <Separator />
              <TransportDetails rec={rec} />
              <Separator />
              <StayDetails rec={rec} travellers={travellers} />
              <Separator />
              <Section title="What it costs">
                <CostLedger costs={rec.costs} />
              </Section>
              {rec.weather && (
                <>
                  <Separator />
                  <Section title="Weather">
                    <p className="text-sm">
                      Highs around <strong>{Math.round(rec.weather.avgHighC)}°C</strong>, lows {Math.round(rec.weather.avgLowC)}°C, about{' '}
                      {Math.round(rec.weather.rainyDaysExpected)} rainy day(s).
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {rec.weather.confidence === 'FORECAST' ? 'Based on the forecast.' : 'Too far ahead for a forecast: averages for these dates in recent years.'}{' '}
                      Source: {providerLabel(rec.weather.attribution.provider)}.
                    </p>
                  </Section>
                </>
              )}
              {rec.alternatives.length > 0 && (
                <>
                  <Separator />
                  <Section title="Other ways to do this trip">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dates</TableHead>
                          <TableHead>By</TableHead>
                          <TableHead>Travel</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Match</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rec.alternatives.map((a) => (
                          <TableRow key={`${a.checkIn}-${a.mode}`}>
                            <TableCell>{formatDayShort(a.checkIn)}</TableCell>
                            <TableCell>{a.mode === 'FLIGHT' ? 'Flight' : 'Car'}</TableCell>
                            <TableCell>{formatDuration(a.doorToDoorMinutes)}</TableCell>
                            <TableCell className="text-right">
                              <Amount value={a.tripTotal} rounded />
                            </TableCell>
                            <TableCell className="tabular text-right">{a.score}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function BookLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <Button asChild variant="outline" size="sm" className="w-fit">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children} <ExternalLinkIcon />
      </a>
    </Button>
  );
}

type Offer = Extract<TripRecommendation['transport'], { mode: 'FLIGHT' }>['offer'];
type Leg = Offer['outbound'];
function legsOf(o: Offer): [string, Leg][] {
  return o.inbound ? [['Out', o.outbound], ['Back', o.inbound]] : [['Out', o.outbound]];
}

function TransportDetails({ rec }: { rec: TripRecommendation }) {
  const t = rec.transport;
  if (t.mode === 'CAR') {
    return (
      <Section title="Getting there by car">
        <p className="text-sm">
          {formatDuration(t.route.durationMinutes)} each way, {Math.round(t.route.distanceKm)} km. Fuel and tolls are our estimates.
        </p>
        <p className="text-muted-foreground text-xs">Route from {providerLabel(t.route.provider)}.</p>
      </Section>
    );
  }
  const o = t.offer;
  return (
    <Section title="Getting there by plane">
      <ul className="grid gap-2 text-sm">
        {legsOf(o).map(([label, leg]) => (
          <li key={label} className="grid grid-cols-[4.5rem_1fr] gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span>
              {formatDayShort(leg.departure.slice(0, 10))}
              {leg.departure.length > 10 && ` · ${leg.departure.slice(11, 16)}`} {leg.from} → {leg.arrival ? `${leg.arrival.slice(11, 16)} ` : ''}
              {leg.to}
              {leg.durationMinutes > 0 && ` · ${formatDuration(leg.durationMinutes)}`} · {leg.stops === 0 ? 'direct' : `${leg.stops} stop`} · {leg.carrier}
            </span>
          </li>
        ))}
        {!o.inbound && (
          <li className="text-muted-foreground grid grid-cols-[4.5rem_1fr] gap-2">
            <span>Back</span>
            <span>Return flight included in the price; times shown on the booking site.</span>
          </li>
        )}
      </ul>
      <p className="text-muted-foreground text-sm">
        Includes the {formatDuration(t.airportAccess.durationMinutes)} drive to {t.departureAirport.name} and parking. About {formatDuration(t.doorToDoorMinutes)} door to door.
        {o.cabinBaggageIncluded === false && ' Cabin bag not included.'}
      </p>
      {o.price.confidence === 'INDICATIVE' && (
        <p className="text-muted-foreground text-sm">This price comes from recent searches, per adult, scaled to your group. The link opens the live search for your whole group with the real total.</p>
      )}
      <BookLink href={o.price.attribution.deepLink}>
        {BOOKING_SITE[o.price.attribution.provider] ? `See these flights on ${BOOKING_SITE[o.price.attribution.provider]}` : `Book flights with ${providerLabel(o.price.attribution.provider)}`}
      </BookLink>
    </Section>
  );
}

/** A Booking.com search for this hotel, dates and group — for providers without a public booking page. */
function bookingSearchLink(rec: TripRecommendation, travellers: SearchCriteria['travellers']): string {
  const adults = travellers.filter((t) => t.type === 'ADULT').length;
  const kids = travellers.filter((t) => t.type !== 'ADULT');
  const q = new URLSearchParams({
    ss: `${rec.accommodation.name}, ${rec.destination.name.replace(/ \(.*\)$/, '')}`,
    checkin: rec.checkIn,
    checkout: rec.checkOut,
    group_adults: String(adults),
    group_children: String(kids.length),
    no_rooms: '1',
  });
  for (const k of kids) q.append('age', String(k.age ?? 0));
  return `https://www.booking.com/searchresults.html?${q.toString()}`;
}

function StayDetails({ rec, travellers }: { rec: TripRecommendation; travellers: SearchCriteria['travellers'] }) {
  const s = rec.accommodation;
  return (
    <Section title="Where you'll stay">
      <div>
        <p className="font-medium">{s.name}</p>
        <p className="text-muted-foreground text-sm">
          {s.type === 'HOTEL' ? 'Hotel' : 'Apartment'}
          {s.stars ? ` · ${'★'.repeat(s.stars)}` : ''} · {s.roomDescription}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {s.rating !== undefined && (
          <span className="inline-flex items-center gap-1">
            <StarIcon className="size-3.5" /> {s.rating.toFixed(1)} from {s.reviewCount?.toLocaleString('en-IE') ?? 0} reviews
          </span>
        )}
        {s.distanceToCentreM !== undefined && (
          <span className="inline-flex items-center gap-1">
            <MapPinIcon className="size-3.5" /> {formatDistance(s.distanceToCentreM)} to the centre
          </span>
        )}
        {s.distanceToBeachM !== undefined && <span>{formatDistance(s.distanceToBeachM)} to the beach</span>}
      </div>
      {(s.facilities.length > 0 || s.breakfastIncluded) && (
        <ul className="flex flex-wrap gap-1.5">
          {s.breakfastIncluded && <Badge variant="success">Breakfast included</Badge>}
          {s.facilities
            .filter((f) => !(f === 'breakfast' && s.breakfastIncluded))
            .map((f) => (
              <Badge key={f} variant="secondary">
                {FACILITY_LABEL[f]}
              </Badge>
            ))}
        </ul>
      )}
      {s.price.attribution.deepLink ? (
        <BookLink href={s.price.attribution.deepLink}>
          {s.price.attribution.provider === 'serpapi-google-hotels' ? "Open the hotel's site" : `Book this stay with ${providerLabel(s.price.attribution.provider)}`}
        </BookLink>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Price from {providerLabel(s.price.attribution.provider)}, which has no public booking page. Prices elsewhere may differ.
          </p>
          <BookLink href={bookingSearchLink(rec, travellers)}>Find this hotel on Booking.com</BookLink>
        </>
      )}
    </Section>
  );
}
