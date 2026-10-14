import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MatchReason } from '@/lib/types';
import { a11yViolations } from '@/test/a11y';
import { pickReasons, ReasonList } from './reason-list';

const reasons: MatchReason[] = [
    { tone: 'POSITIVE', code: 'BUDGET_WITHIN', message: 'Within budget (€188 to spare)' },
    { tone: 'POSITIVE', code: 'FLIGHT_DIRECT', message: 'Direct flight from Lisbon (1h20)' },
    { tone: 'POSITIVE', code: 'BEACH_DISTANCE', message: 'Beach within 600 m' },
    { tone: 'NEUTRAL', code: 'AIRPORT_ACCESS', message: '45m drive to Lisbon' },
    { tone: 'WARNING', code: 'WEATHER_BELOW_MIN', message: 'Avg high 18°C, below your 20°C' },
    { tone: 'POSITIVE', code: 'RATING', message: 'Hotel rated 8.8 · 4★' },
];

describe('ReasonList', () => {
    it('lists each reason and announces warnings as such', async () => {
        const { container } = render(<ReasonList reasons={reasons} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(reasons.length);
        expect(screen.getByRole('img', { name: 'Warning' })).toBeInTheDocument();
        expect(await a11yViolations(container)).toEqual([]);
    });

    it('shows only the first lines when limited', () => {
        render(<ReasonList reasons={reasons} limit={2} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
});

describe('pickReasons', () => {
    it('keeps warnings in a short list and leaves budget lines to the card', () => {
        const picked = pickReasons(reasons, 3).map((r) => r.code);
        expect(picked).toEqual(['FLIGHT_DIRECT', 'BEACH_DISTANCE', 'WEATHER_BELOW_MIN']);
    });
});
