import type { AccommodationFacility, DestinationAttribute, RequirementPriority } from '@travel-where-to/domain';
import type { ExplanationInput, LlmProvider } from './index';

/**
 * Deterministic stand-in for a real LLM (Phase 4), so the natural-language flow works
 * end-to-end with mocks. It only recognises keywords and returns the same structured
 * shape a real model must return; that output is validated like any LLM output.
 */

const ATTRIBUTE_KEYWORDS: [RegExp, DestinationAttribute][] = [
  [/\b(beach|beaches|sea|seaside|by the sea|coast|praia)\b/, 'beach'],
  [/\b(city|cities|urban|city break)\b/, 'city'],
  [/\b(nature|hiking|mountains?|countryside|outdoors)\b/, 'nature'],
  [/\b(family|families|kids|children|child)\b/, 'family'],
  [/\b(romantic|couple|honeymoon|getaway)\b/, 'romantic'],
  [/\b(culture|museums?|history|historic)\b/, 'culture'],
  [/\b(restaurants?|food|gastronomy|eat well)\b/, 'gastronomy'],
  [/\b(snow|ski|skiing)\b/, 'snow'],
  [/\b(theme parks?|disney|disneyland|amusement)\b/, 'themePark'],
  [/\b(tropical|exotic)\b/, 'tropical'],
  [/\b(nightlife|party|parties|clubs?|nightclubs?|bars)\b/, 'nightlife'],
];

const FACILITY_KEYWORDS: [RegExp, AccommodationFacility][] = [
  [/\bheated (swimming )?pool\b/, 'heatedPool'],
  [/\b(?<!heated )(swimming )?pool\b/, 'pool'],
  [/\bbreakfast\b/, 'breakfast'],
  [/\bfamily rooms?\b/, 'familyRooms'],
  [/\bparking\b/, 'parking'],
];

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const WEEKDAYS: [RegExp, number][] = [
  [/^sun(day)?$/, 0], [/^mon(day)?$/, 1], [/^tue(s|sday)?$/, 2], [/^wed(nesday)?$/, 3], [/^thu(rs|rsday)?$/, 4], [/^fri(day)?$/, 5], [/^sat(urday)?$/, 6],
];
const DAY = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)';
const weekday = (s: string): number | undefined => WEEKDAYS.find(([re]) => re.test(s))?.[1];
const TIME_WORDS: [RegExp, string][] = [
  [/\bmornings?\b|\bearly flights?\b/, 'MORNING'],
  [/\bafternoons?\b/, 'AFTERNOON'],
  [/\bevenings?\b|\blate flights?\b/, 'EVENING'],
  [/\bnight flights?\b|\bovernight flights?\b|\bred[- ]eye\b|\bat night\b/, 'NIGHT'],
];

const num = (s: string): number => NUMBER_WORDS[s] ?? Number(s);

function priorityFor(clause: string): RequirementPriority {
  if (/\b(no|not|don'?t|without|avoid|never|hate)\b/.test(clause)) return 'AVOID';
  if (/\b(must|need|needs|have to|essential|required)\b/.test(clause)) return 'MUST_HAVE';
  if (/\b(ideally|would like|nice to have|maybe|if possible|prefer)\b/.test(clause)) return 'PREFERRED';
  return 'IMPORTANT';
}

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock-keyword-interpreter';

  constructor(private readonly today: () => Date = () => new Date()) {}

  async interpretTravelRequest(request: string): Promise<unknown> {
    const text = request.toLowerCase().replace(/\s+/g, ' ');
    const clauses = text.split(/[,.;!?]| but | and | with /).map((c) => c.trim()).filter(Boolean);

    const requirements: { kind: string; attribute?: string; facility?: string; priority: RequirementPriority }[] = [];
    const seen = new Set<string>();
    const unmapped: string[] = [];

    for (const clause of clauses) {
      let matched = false;
      const priority = priorityFor(clause);
      for (const [re, facility] of FACILITY_KEYWORDS) {
        if (re.test(clause) && !seen.has(`f:${facility}`)) {
          seen.add(`f:${facility}`);
          requirements.push({ kind: 'FACILITY', facility, priority });
          matched = true;
        }
      }
      for (const [re, attribute] of ATTRIBUTE_KEYWORDS) {
        // "family room" is a facility, not a family destination.
        if (attribute === 'family' && /family rooms?/.test(clause)) continue;
        if (re.test(clause) && !seen.has(`a:${attribute}`)) {
          seen.add(`a:${attribute}`);
          requirements.push({ kind: 'DESTINATION', attribute, priority });
          matched = true;
        }
      }
      const structured =
        (/€|°/.test(clause) || /\b(europe|european|long[- ]haul|far away|caribbean|brazil|mexico|america|americas|usa|africa|asia|middle east|indian ocean|dubai|thailand|bali|maldives|mauritius|cuba|egypt|direct|non[- ]?stop|mornings?|afternoons?|evenings?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun|eur|euros?|budget|nights?|adults?|child|children|kids|infants?|baby|babies|hours?|fly|flights?|car|drive|driving|warm|hot|sunny|degrees|disney|disneyland|paris|rome|london|madeira|funchal|azores|tenerife|marrakech|marrakesh|cape verde|salvador|fortaleza|rio|punta cana|canc[uú]n|varadero|orlando|new york|antalya|hurghada|djerba|zanzibar|cape town|phuket|park|parks|resort|tickets?|days?)\b/.test(clause)) ||
        MONTHS.some((m) => clause.includes(m));
      if (!matched && !structured && clause.split(' ').length > 1) unmapped.push(clause);
    }

    const out: Record<string, unknown> = { requirements, unmapped };

    const budget = /(?:€\s?([\d.,]+)|([\d.,]+)\s?(?:€|eur|euros?))/.exec(text);
    if (budget) {
      const amount = Number((budget[1] ?? budget[2] ?? '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
      if (amount > 0) out.budget = { amount, currency: 'EUR' };
    }
    const nights = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) nights?\b/.exec(text);
    if (nights?.[1]) out.nights = num(nights[1]);
    const adults = /\b(\d+|one|two|three|four|five|six) adults?\b/.exec(text);
    if (adults?.[1]) out.adults = num(adults[1]);
    else if (/\b(we are a couple|my partner|my wife|my husband|two of us)\b/.test(text)) out.adults = 2;

    const ages = [...text.matchAll(/\b(?:aged?|age) (\d{1,2})\b|\b(\d{1,2})[- ]?(?:year[- ]old|yo)\b/g)].map((m) => Number(m[1] ?? m[2]));
    if (ages.length > 0) out.childAges = ages.filter((a) => a <= 17);

    const month = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`).test(text));
    if (month >= 0) {
      const now = this.today();
      const year = month < now.getUTCMonth() ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      out.dateWindow = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }

    const drive = /\b(?:max(?:imum)?|up to|no more than|less than|at most)\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b(?=[^,.;]*driv)/.exec(text);
    if (drive?.[1]) out.maxDrivingHours = Number(drive[1]);
    if (/\b(don'?t want to fly|no fl(y|ights?)|not fly|without flying)\b/.test(text)) out.transportModes = ['CAR'];
    else if (/\b(no car|don'?t want to drive|not drive)\b/.test(text)) out.transportModes = ['FLIGHT'];

    const places = [
      [/\bdisney ?land( paris)?\b|\bdisney paris\b|\bdisneyland\b/, 'Disneyland Paris'],
      [/\bparis\b(?! disney)/, 'Paris'],
      [/\brome\b/, 'Rome'],
      [/\blondon\b/, 'London'],
      [/\bmadeira\b|\bfunchal\b/, 'Funchal'],
      [/\bazores\b/, 'Ponta Delgada'],
      [/\btenerife\b/, 'Costa Adeje'],
      [/\bmarrakech\b|\bmarrakesh\b/, 'Marrakech'],
      [/\bcape verde\b|\bcabo verde\b|\bsal island\b/, 'Cape Verde'],
      [/\bsalvador\b|\bbahia\b/, 'Salvador'],
      [/\bfortaleza\b/, 'Fortaleza'],
      [/\brio( de janeiro)?\b/, 'Rio de Janeiro'],
      [/\bpunta cana\b|\bdominican republic\b/, 'Punta Cana'],
      [/\bcanc[uú]n\b|\briviera maya\b/, 'Cancún'],
      [/\bvaradero\b|\bcuba\b/, 'Varadero'],
      [/\borlando\b|\bdisney world\b/, 'Orlando'],
      [/\bnew york\b|\bnyc\b/, 'New York'],
      [/\bdubai\b/, 'Dubai'],
      [/\bantalya\b/, 'Antalya'],
      [/\bhurghada\b/, 'Hurghada'],
      [/\bdjerba\b/, 'Djerba'],
      [/\bzanzibar\b/, 'Zanzibar'],
      [/\bcape town\b/, 'Cape Town'],
      [/\bmauritius\b/, 'Mauritius'],
      [/\bmaldives\b/, 'Maldives'],
      [/\bphuket\b/, 'Phuket'],
      [/\bbali\b/, 'Bali'],
    ] as const;
    const names = places.filter(([re]) => re.test(text)).map(([, n]) => n);
    // "Disneyland Paris" also matches "paris": keep the more specific one.
    const destinationNames = names.includes('Disneyland Paris') ? names.filter((n) => n !== 'Paris' || /\bparis\b.*\bparis\b/.test(text)) : names;
    if (destinationNames.length) out.destinationNames = destinationNames;
    if (/\b(inside|in) the (park|resort)\b|\b(official|disney) hotels?\b|\bon[- ]site hotel/.test(text)) out.parkHotelsOnly = true;
    const parkDays = /\b(\d|one|two|three|four|five) (?:park )?days? (?:in|at) the parks?\b|\b(\d|one|two|three|four|five)[- ]day (?:park )?tickets?\b/.exec(text);
    if (parkDays) out.parkDays = num((parkDays[1] ?? parkDays[2]) as string);

    // ---- Where in the world ----
    const regions = new Set<string>();
    if (/\b(outside (of )?europe|out of europe|long[- ]haul|far away|another continent|intercontinental)\b/.test(text))
      ['AFRICA', 'AMERICAS', 'MIDDLE_EAST', 'ASIA_PACIFIC', 'INDIAN_OCEAN'].forEach((r) => regions.add(r));
    if (/\b(in europe|within europe|european)\b/.test(text)) regions.add('EUROPE');
    if (/\b(caribbean|brazil|mexico|america|americas|usa|united states|cuba)\b/.test(text)) regions.add('AMERICAS');
    if (/\b(africa|african|egypt|cape verde|zanzibar|tunisia)\b/.test(text)) regions.add('AFRICA');
    if (/\b(asia|asian|thailand|bali|indonesia)\b/.test(text)) regions.add('ASIA_PACIFIC');
    if (/\b(middle east|dubai|turkey)\b/.test(text)) regions.add('MIDDLE_EAST');
    if (/\b(indian ocean|maldives|mauritius|seychelles)\b/.test(text)) regions.add('INDIAN_OCEAN');
    if (regions.size) out.regions = [...regions];

    // ---- Flights: direct only, departure times per leg ----
    if (/\b(direct|non[- ]?stop) (flights?|only)\b|\bonly direct\b|\bno (stops|layovers|connections)\b|\bwithout (stops|layovers)\b/.test(text)) out.directFlightsOnly = true;
    const outTimes = new Set<string>();
    const backTimes = new Set<string>();
    for (const clause of clauses) {
      const times = TIME_WORDS.filter(([re]) => re.test(clause)).map(([, t]) => t);
      if (times.length === 0) continue;
      const isReturn = /\b(return|back|home|coming back|inbound)\b/.test(clause);
      const isOut = /\b(leave|leaving|depart|departing|outbound|go|going|fly out|there)\b/.test(clause);
      const aboutFlights = isReturn || isOut || /\b(fly|flights?)\b/.test(clause);
      if (!aboutFlights) continue;
      if (isReturn) times.forEach((t) => backTimes.add(t));
      if (isOut || !isReturn) {
        times.forEach((t) => outTimes.add(t));
        // "morning flights" with no direction applies to both legs.
        if (!isOut) times.forEach((t) => backTimes.add(t));
      }
    }
    if (outTimes.size) out.outboundTimes = [...outTimes];
    if (backTimes.size) out.returnTimes = [...backTimes];

    // ---- Days of the week (flexible windows) ----
    const span = new RegExp(`\\b${DAY}\\w*\\s*(?:to|until|till|through|-|–|→|and back(?: on)?|back on|return(?:ing)? on)\\s*${DAY}\\b`).exec(text);
    const from = span?.[1] ? weekday(span[1]) : undefined;
    const to = span?.[2] ? weekday(span[2]) : undefined;
    if (from !== undefined && to !== undefined) {
      out.departOn = [from];
      out.returnOn = [to];
    } else if (/\blong weekends?\b/.test(text)) {
      out.departOn = [5];
      out.returnOn = [1];
    } else if (/\bweekends?\b/.test(text)) {
      out.departOn = [5];
      out.returnOn = [0];
    }

    const temp = /(\d{2})\s?(?:°c?|degrees)/.exec(text);
    if (temp?.[1]) out.minAvgHighC = Number(temp[1]);
    else if (/\b(warm|hot|sunny)\b|\b(the|some) sun\b/.test(text)) out.minAvgHighC = 20;

    return out;
  }

  async explainRecommendation(input: ExplanationInput): Promise<string> {
    const good = input.reasons.filter((r) => r.tone === 'POSITIVE').map((r) => r.message.toLowerCase());
    const warn = input.reasons.filter((r) => r.tone === 'WARNING').map((r) => r.message.toLowerCase());
    return `${input.destinationName} scores ${input.score.total}%${good.length ? `: ${good.slice(0, 3).join(', ')}` : ''}${warn.length ? `. Watch out: ${warn.join(', ')}` : ''}.`;
  }
}
