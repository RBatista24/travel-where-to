import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { a11yViolations } from '@/test/a11y';
import { ChoiceChip } from './choice-chip';

describe('ChoiceChip', () => {
    it('is a button named by its label that reports a click', async () => {
        const onClick = vi.fn();
        const { container } = render(<ChoiceChip label="Beach" onClick={onClick} />);
        await userEvent.click(screen.getByRole('button', { name: 'Beach' }));
        expect(onClick).toHaveBeenCalledOnce();
        expect(await a11yViolations(container)).toEqual([]);
    });
});
