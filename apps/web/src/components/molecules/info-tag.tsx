import * as React from 'react';
import { CalculatorIcon, GaugeIcon, ShieldCheckIcon, SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INFO_KIND, type InfoKind } from '@/lib/labels';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/atoms/tooltip';

const STYLE: Record<InfoKind, string> = {
    VERIFIED: 'border-solid border-verified/45 bg-verified-soft text-verified',
    INDICATIVE: 'border-solid border-indicative/45 bg-indicative-soft text-indicative',
    ESTIMATED: 'border-dashed border-estimated/60 bg-estimated-soft text-estimated',
    AI: 'border-dotted border-ai/70 bg-ai-soft text-ai',
};

const ICON: Record<InfoKind, React.ComponentType<{ className?: string }>> = {
    VERIFIED: ShieldCheckIcon,
    INDICATIVE: GaugeIcon,
    ESTIMATED: CalculatorIcon,
    AI: SparklesIcon,
};

/**
 * Says what kind of information a value is: provider fact, indicative, our estimate or
 * AI interpretation. Shape (line style + icon) carries the meaning, colour reinforces it.
 */
export function InfoTag({
    kind,
    className,
    compact = false,
}: {
    kind: InfoKind;
    className?: string;
    compact?: boolean;
}) {
    const Icon = ICON[kind];
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'inline-flex shrink-0 cursor-help items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 text-[0.7rem] leading-none font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                        STYLE[kind],
                        compact && 'px-1.5',
                        className,
                    )}
                >
                    <Icon className="size-3" />
                    {compact ? (
                        <span className="sr-only">{INFO_KIND[kind].label}</span>
                    ) : (
                        INFO_KIND[kind].label
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent>{INFO_KIND[kind].explanation}</TooltipContent>
        </Tooltip>
    );
}

/** The left rule used on ledger lines: same vocabulary as InfoTag, as a line. */
export const INFO_RULE: Record<InfoKind, string> = {
    VERIFIED: 'border-l-verified border-solid',
    INDICATIVE: 'border-l-indicative border-solid',
    ESTIMATED: 'border-l-estimated border-dashed',
    AI: 'border-l-ai border-dotted',
};
