import type { Region } from './types';

export const REGION_OPTIONS: readonly { value: Region; label: string }[] = [
  { value: 'EUROPE', label: 'Europe' },
  { value: 'AFRICA', label: 'Africa' },
  { value: 'AMERICAS', label: 'Americas & Caribbean' },
  { value: 'MIDDLE_EAST', label: 'Middle East & Turkey' },
  { value: 'ASIA_PACIFIC', label: 'Asia' },
  { value: 'INDIAN_OCEAN', label: 'Indian Ocean islands' },
];

export const OUTSIDE_EUROPE: readonly Region[] = REGION_OPTIONS.map((r) => r.value).filter((r) => r !== 'EUROPE');

export function regionLabel(r: Region): string {
  return REGION_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

/** "Outside Europe", "Africa, Asia", or '' for anywhere. */
export function describeRegions(regions: readonly Region[] | undefined): string {
  if (!regions || regions.length === 0 || regions.length === REGION_OPTIONS.length) return '';
  if (regions.length === OUTSIDE_EUROPE.length && OUTSIDE_EUROPE.every((r) => regions.includes(r))) return 'Outside Europe';
  return REGION_OPTIONS.filter((o) => regions.includes(o.value)).map((o) => o.label).join(', ');
}
