import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { a11yViolations } from '@/test/a11y';
import { LiveRegion } from './live-region';

describe('LiveRegion', () => {
    it('exposes its message as a status for screen readers', () => {
        render(<LiveRegion message="3 trips fit" />);
        expect(screen.getByRole('status')).toHaveTextContent('3 trips fit');
    });

    it('stays silent when there is nothing to announce', () => {
        render(<LiveRegion message="" />);
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('is free of accessibility violations', async () => {
        const { container } = render(<LiveRegion message="Searching" />);
        expect(await a11yViolations(container)).toEqual([]);
    });
});
