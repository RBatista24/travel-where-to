import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { a11yViolations } from '@/test/a11y';
import { PriorityPicker } from './priority-picker';

describe('PriorityPicker', () => {
    it('offers the four priorities as a named single choice', async () => {
        const { container } = render(
            <PriorityPicker label="Beach" value="IMPORTANT" onChange={() => {}} />,
        );
        expect(screen.getByRole('radiogroup', { name: 'Priority for Beach' })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Important' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Must have' })).not.toBeChecked();
        expect(await a11yViolations(container)).toEqual([]);
    });

    it('reports the chosen priority, and null when the current one is unselected', async () => {
        const onChange = vi.fn();
        render(<PriorityPicker label="Beach" value="IMPORTANT" onChange={onChange} />);
        await userEvent.click(screen.getByRole('radio', { name: 'Avoid' }));
        await userEvent.click(screen.getByRole('radio', { name: 'Important' }));
        expect(onChange.mock.calls).toEqual([['AVOID'], [null]]);
    });
});
