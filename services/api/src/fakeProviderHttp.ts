import { addDays, haversineKm } from '@travel-where-to/shared';
import {
    DESTINATION_CATALOGUE,
    PORTUGAL_DEPARTURE_AIRPORTS,
} from '@travel-where-to/destination-engine';
import type { FetchLike } from '@travel-where-to/domain';

/** Answers Travelpayouts, openrouteservice and Open-Meteo requests with payloads in their documented shapes. Tests only. */
const airports = new Map(
    [...PORTUGAL_DEPARTURE_AIRPORTS, ...DESTINATION_CATALOGUE.flatMap((d) => d.airports)].map(
        (a) => [a.iata, a],
    ),
);

export const fakeHttp: FetchLike = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'api.travelpayouts.com' && u.pathname.endsWith('grouped_prices')) {
        const from = u.searchParams.get('origin')!;
        const to = u.searchParams.get('destination')!;
        const nights = Number(u.searchParams.get('min_trip_duration'));
        const month = u.searchParams.get('departure_at')!;
        const a = airports.get(from)!;
        const b = airports.get(to)!;
        const km = haversineKm(a.coordinates, b.coordinates);
        if (km < 300 || from === 'FAO')
            return new Response(JSON.stringify({ success: true, currency: 'eur', data: {} }));
        const data: Record<string, unknown> = {};
        for (let day = 1; day <= 28; day += 3) {
            const dep = `${month}-${String(day).padStart(2, '0')}`;
            data[dep] = {
                origin_airport: from,
                destination_airport: to,
                price: Math.round(30 + km * 0.08 + day),
                airline: 'TP',
                flight_number: 100 + day,
                departure_at: `${dep}T09:00:00+01:00`,
                return_at: `${addDays(dep, nights)}T18:00:00+01:00`,
                transfers: 0,
                return_transfers: 0,
                duration_to: Math.round(40 + km / 12),
                duration_back: Math.round(40 + km / 12),
                link: `/search/${from}0101${to}05011?t=x`,
            };
        }
        return new Response(JSON.stringify({ success: true, currency: 'eur', data }));
    }
    if (u.hostname === 'api.travelpayouts.com')
        return new Response(JSON.stringify({ success: true, currency: 'eur', data: [] }));
    if (u.hostname === 'api.openrouteservice.org') {
        const [[lon1, lat1], [lon2, lat2]] = JSON.parse(String(init?.body)).coordinates as [
            [number, number],
            [number, number],
        ];
        const km = haversineKm({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }) * 1.25;
        return new Response(
            JSON.stringify({
                routes: [
                    {
                        summary: { distance: km * 1000, duration: (km / 90) * 3600 },
                        extras: { tollways: { summary: [{ value: 1, distance: km * 500 }] } },
                    },
                ],
            }),
        );
    }
    if (u.hostname.includes('open-meteo.com')) {
        const start = u.searchParams.get('start_date')!;
        const end = u.searchParams.get('end_date')!;
        const time: string[] = [];
        for (let d = start; d <= end; d = addDays(d, 1)) time.push(d);
        return new Response(
            JSON.stringify({
                daily: {
                    time,
                    temperature_2m_max: time.map(() => 21),
                    temperature_2m_min: time.map(() => 13),
                    precipitation_sum: time.map((t) => (t.endsWith('1') ? 4 : 0)),
                },
            }),
        );
    }
    if (u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google_flights') {
        const from = u.searchParams.get('departure_id')!;
        const to = u.searchParams.get('arrival_id')!;
        const km = haversineKm(airports.get(from)!.coordinates, airports.get(to)!.coordinates);
        const pax =
            Number(u.searchParams.get('adults')) + Number(u.searchParams.get('children') ?? 0);
        const dep = u.searchParams.get('outbound_date')!;
        const minutes = Math.round(40 + km / 12);
        const arr = new Date(Date.parse(`${dep}T07:30:00Z`) + minutes * 60_000)
            .toISOString()
            .slice(11, 16);
        return new Response(
            JSON.stringify({
                search_metadata: {
                    google_flights_url: `https://www.google.com/travel/flights?q=${from}-${to}`,
                },
                best_flights: [
                    {
                        flights: [
                            {
                                departure_airport: { id: from, time: `${dep} 07:30` },
                                arrival_airport: { id: to, time: `${dep} ${arr}` },
                                duration: minutes,
                                airline: 'TAP Air Portugal',
                                flight_number: 'TP 1100',
                            },
                        ],
                        total_duration: minutes,
                        price: Math.round((45 + km * 0.09) * pax),
                        type: 'Round trip',
                    },
                ],
            }),
        );
    }
    if (u.hostname === 'api.liteapi.travel') {
        const body = JSON.parse(String(init?.body)) as {
            latitude: number;
            longitude: number;
            checkin: string;
        };
        const hotels = Array.from({ length: 6 }, (_, i) => ({
            id: `h${i}`,
            name: [
                'Hotel Atlântico',
                'Casa do Largo',
                'Hotel Miramar',
                'Residencial Sol',
                'Hotel Central',
                'Palácio Verde',
            ][i],
            rating: 7.6 + i * 0.3,
            reviewCount: 300 + i * 120,
            stars: 3 + (i % 3),
            latitude: body.latitude + (i - 3) * 0.003,
            longitude: body.longitude + (i % 2) * 0.004,
        }));
        return new Response(
            JSON.stringify({
                data: hotels.map((h, i) => ({
                    hotelId: h.id,
                    roomTypes: [
                        {
                            offerId: `${h.id}-o`,
                            offerRetailRate: { amount: 360 + i * 55, currency: 'EUR' },
                            rates: [
                                {
                                    name: i % 2 ? 'Family Room' : 'Triple Room',
                                    boardType: i % 3 ? 'RO' : 'BB',
                                    boardName: i % 3 ? 'Room Only' : 'Bed & Breakfast',
                                },
                            ],
                        },
                    ],
                })),
                hotels,
            }),
        );
    }
    return new Response('{}', { status: 404 });
};
