import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/atoms/tooltip';
import { a11yViolations } from '@/test/a11y';
import { PriceLegend } from './price-legend';

describe('PriceLegend', () => {
    it('is a named section with one focusable tag per kind of information', async () => {
        const { container } = render(
            <TooltipProvider>
                <PriceLegend />
            </TooltipProvider>,
        );
        expect(screen.getByRole('region', { name: 'How to read our prices' })).toBeInTheDocument();
        for (const name of ['Verified', 'Indicative', 'Our estimate', 'AI interpretation']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        expect(await a11yViolations(container)).toEqual([]);
    });
});
