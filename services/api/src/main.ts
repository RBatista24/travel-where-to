import {
    DESTINATION_CATALOGUE,
    InMemoryDestinationRepository,
} from '@travel-where-to/destination-engine';
import { MockLlmProvider } from '@travel-where-to/llm';
import { createApp } from './app';
import { createSearchEngine, providersFromEnv } from './composition';
import { InMemorySearchRepository } from './searchRepository';

import { loadEnv } from './loadEnv';

// Secrets and provider choice live in services/api/.env or the repo-root .env (never in the web app).
const envFiles = loadEnv();

const port = Number(process.env.PORT ?? 4000);
const providers = providersFromEnv(process.env);

const verifyTop = Number(process.env.VERIFY_TOP ?? 5);
const engine = createSearchEngine(providers, {
    config: { verifyTop: Number.isFinite(verifyTop) ? verifyTop : 5 },
    logger: {
        // Structured provider-call log. Contains no personal data (no origin, no traveller details).
        log: (e) => {
            if (process.env.LOG_PROVIDER_CALLS === '1' || e.status === 'ERROR')
                console.log(
                    JSON.stringify({
                        level: e.status === 'ERROR' ? 'warn' : 'info',
                        msg: 'provider_call',
                        ...e,
                    }),
                );
        },
    },
});

createApp({
    engine,
    searches: new InMemorySearchRepository(),
    destinations: new InMemoryDestinationRepository(DESTINATION_CATALOGUE),
    llm: new MockLlmProvider(),
}).listen(port, () => {
    console.log(`Travel API listening on http://localhost:${port}`);
    console.log(
        envFiles.length
            ? `Settings from ${envFiles.join(', ')}`
            : 'No .env found: every provider is a mock.',
    );
    const liveCheck = providers.flightVerifier
        ? ` (top ${verifyTop} checked live with ${providers.flightVerifier.name})`
        : '';
    console.log(
        `Providers → flights: ${providers.flights.name}${liveCheck}, stays: ${providers.accommodation.name}, routes: ${providers.routing.name}, weather: ${providers.weather.name}`,
    );
});
