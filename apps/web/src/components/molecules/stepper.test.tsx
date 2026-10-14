import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { a11yViolations } from '@/test/a11y';
import { Stepper } from './stepper';

describe('Stepper', () => {
    it('names its buttons after the label and reports the next value', async () => {
        const onChange = vi.fn();
        render(<Stepper id="adults" label="Adults" value={2} min={1} onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: 'More adults' }));
        await userEvent.click(screen.getByRole('button', { name: 'Fewer adults' }));
        expect(onChange.mock.calls).toEqual([[3], [1]]);
    });

    it('disables the button that would leave the allowed range', () => {
        render(<Stepper id="kids" label="Children" value={0} max={0} onChange={() => {}} />);
        expect(screen.getByRole('button', { name: 'Fewer children' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'More children' })).toBeDisabled();
    });

    it('groups the controls under the label, free of accessibility violations', async () => {
        const { container } = render(
            <Stepper id="adults" label="Adults" hint="18 or older" value={2} onChange={() => {}} />,
        );
        expect(screen.getByRole('group', { name: 'Adults' })).toBeInTheDocument();
        expect(await a11yViolations(container)).toEqual([]);
    });
});
