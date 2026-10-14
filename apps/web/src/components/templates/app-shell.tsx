import * as React from 'react';
import { TooltipProvider } from '@/components/atoms/tooltip';
import { SiteHeader } from '@/components/organisms/site-header';

/** Header, centred content column, and the standing reminder about prices. */
export function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <TooltipProvider>
            <div className="flex min-h-svh flex-col">
                <SiteHeader />
                <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 sm:px-6 lg:py-10">
                    {children}
                </main>
                <footer className="text-muted-foreground mx-auto w-full max-w-6xl px-4 pb-24 text-xs sm:px-6">
                    Prices and availability come from providers and can change until you book with
                    them. Every search shows which data was real and which was a test mock. Weather
                    data by Open-Meteo.com (CC BY 4.0); routes © openrouteservice.org by HeiGIT, map
                    data © OpenStreetMap contributors.
                    <span className="mt-2 block">Built by RB Software Engineering.</span>
                </footer>
            </div>
        </TooltipProvider>
    );
}
