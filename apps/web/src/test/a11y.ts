import axe from 'axe-core';

/**
 * Accessibility violations axe finds in a rendered tree (REF-Accessibility §10, runtime tier).
 * Colour contrast is off: jsdom has no layout or computed colours, so contrast is checked on
 * the design tokens instead.
 */
export async function a11yViolations(container: Element): Promise<string[]> {
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
}
