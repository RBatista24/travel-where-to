import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { a11yViolations } from '@/test/a11y';
import { MatchScore } from './match-score';

describe('MatchScore', () => {
    it('reads as the score and "% match", with the bar hidden from assistive technology', async () => {
        const { container } = render(<MatchScore score={94} />);
        expect(container).toHaveTextContent('94% match');
        expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
        expect(await a11yViolations(container)).toEqual([]);
    });
});
