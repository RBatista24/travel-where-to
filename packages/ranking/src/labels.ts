import type { AccommodationFacility, DestinationAttribute, TimeOfDay } from '@travel-where-to/domain';

export const ATTRIBUTE_LABEL: Record<DestinationAttribute, string> = {
  beach: 'beach',
  city: 'city break',
  nature: 'nature',
  family: 'families',
  romantic: 'romantic trips',
  culture: 'culture',
  gastronomy: 'food & restaurants',
  snow: 'snow',
  themePark: 'theme parks',
  tropical: 'tropical feel',
  nightlife: 'nightlife',
};

export const FACILITY_LABEL: Record<AccommodationFacility, string> = {
  pool: 'Swimming pool',
  heatedPool: 'Heated pool',
  breakfast: 'Breakfast',
  familyRooms: 'Family rooms',
  parking: 'Parking',
};

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  NIGHT: 'night (00–05h)',
  MORNING: 'morning (05–12h)',
  AFTERNOON: 'afternoon (12–18h)',
  EVENING: 'evening (18–24h)',
};

export function timesLabel(times: readonly TimeOfDay[]): string {
  const order: TimeOfDay[] = ['NIGHT', 'MORNING', 'AFTERNOON', 'EVENING'];
  return order.filter((t) => times.includes(t)).map((t) => TIME_OF_DAY_LABEL[t].split(' ')[0]).join(' or ');
}
