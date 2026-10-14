import { InfoTag } from '@/components/molecules/info-tag';
import { INFO_KIND, type InfoKind } from '@/lib/labels';

const KINDS: InfoKind[] = ['VERIFIED', 'INDICATIVE', 'ESTIMATED', 'AI'];

/** Explains the four kinds of information shown everywhere (spec §55). */
export function PriceLegend() {
    return (
        <section aria-labelledby="legend-heading" className="grid gap-3">
            <h2 id="legend-heading" className="text-base font-semibold">
                How to read our prices
            </h2>
            <ul className="grid gap-3">
                {KINDS.map((k) => (
                    <li key={k} className="grid gap-1">
                        <InfoTag kind={k} className="w-fit" />
                        <span className="text-muted-foreground text-sm">
                            {INFO_KIND[k].explanation}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-muted-foreground text-xs">
                We never book or take payment. You book with the provider, and their price is the
                one that counts.
            </p>
        </section>
    );
}
