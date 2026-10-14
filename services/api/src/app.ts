import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DESTINATION_ATTRIBUTES, type Destination } from '@travel-where-to/domain';
import type { DestinationRepository } from '@travel-where-to/destination-engine';
import { SearchValidationError, type SearchEngine } from '@travel-where-to/search-engine';
import { SearchRequestSchema, toCriteria } from './schema';
import type { SearchRepository } from './searchRepository';
import { interpretTravelRequest, LlmOutputError, type LlmProvider } from '@travel-where-to/llm';
import { z } from 'zod';

const InterpretRequestSchema = z.object({ text: z.string().trim().min(3).max(2000) }).strict();

export interface AppDeps {
    readonly engine: SearchEngine;
    readonly searches: SearchRepository;
    readonly destinations: DestinationRepository;
    readonly llm: LlmProvider;
    readonly maxBodyBytes?: number;
}

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
    }
}

function send(res: ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(json);
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buf = chunk as Buffer;
        size += buf.length;
        if (size > maxBytes) throw new HttpError(413, 'Request body too large');
        chunks.push(buf);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new HttpError(400, 'Invalid JSON body');
    }
}

const destinationSummary = (d: Destination) => ({
    id: d.id,
    name: d.name,
    country: d.country,
    region: d.region,
    categories: DESTINATION_ATTRIBUTES.filter((a) => a !== 'nightlife' && d.scores[a] >= 60),
    ...(d.park
        ? {
              park: {
                  name: d.park.name,
                  officialHotels: d.park.officialHotels.map((h) => h.name),
                  maxTicketDays: Math.max(
                      ...Object.keys(d.park.tickets.adultRangeByDays).map(Number),
                  ),
              },
          }
        : {}),
});

/**
 * Travel API. All provider calls happen server-side; no credentials are ever sent to clients.
 * Routes:
 *   GET  /health
 *   GET  /api/destinations
 *   POST /api/interpret         natural language → structured requirements (AI interpretation)
 *   POST /api/searches          run a search (body: SearchRequest)
 *   GET  /api/searches          recent searches
 *   GET  /api/searches/:id      a stored search
 */
export function createApp(deps: AppDeps): Server {
    const maxBody = deps.maxBodyBytes ?? 64 * 1024;
    return createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const path = url.pathname.replace(/\/+$/, '') || '/';

            if (req.method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });

            if (req.method === 'GET' && path === '/api/destinations') {
                return send(res, 200, {
                    destinations: (await deps.destinations.list()).map(destinationSummary),
                });
            }

            if (req.method === 'POST' && path === '/api/interpret') {
                const parsed = InterpretRequestSchema.safeParse(await readJson(req, maxBody));
                if (!parsed.success)
                    throw new HttpError(
                        400,
                        'Invalid interpret request',
                        parsed.error.issues.map((i) => i.message),
                    );
                try {
                    const interpreted = await interpretTravelRequest(deps.llm, parsed.data.text);
                    // Names the model mentioned → catalogue ids (the model never invents destinations).
                    const all = await deps.destinations.list();
                    const norm = (x: string) =>
                        x
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLowerCase();
                    const destinations = (interpreted.intent.destinationNames ?? [])
                        .map((n) => {
                            const short = (d: { name: string }) =>
                                norm(d.name.replace(/ \(.*\)$/, ''));
                            // Exact name first, then the longest catalogue name contained in what was said.
                            return (
                                all.find((d) => short(d) === norm(n)) ??
                                all
                                    .filter(
                                        (d) =>
                                            norm(n).includes(short(d)) ||
                                            norm(d.name).includes(norm(n)),
                                    )
                                    .sort((a, b) => short(b).length - short(a).length)[0]
                            );
                        })
                        .filter((d): d is NonNullable<typeof d> => d !== undefined)
                        .map((d) => ({ id: d.id, name: d.name }));
                    return send(res, 200, { ...interpreted, destinations });
                } catch (e) {
                    if (e instanceof LlmOutputError)
                        throw new HttpError(
                            502,
                            'The interpretation could not be validated',
                            e.issues,
                        );
                    throw e;
                }
            }

            if (req.method === 'POST' && path === '/api/searches') {
                const parsed = SearchRequestSchema.safeParse(await readJson(req, maxBody));
                if (!parsed.success) {
                    throw new HttpError(
                        400,
                        'Invalid search request',
                        parsed.error.issues.map((i) => ({
                            path: i.path.join('.'),
                            message: i.message,
                        })),
                    );
                }
                const result = await deps.engine.search(toCriteria(parsed.data));
                await deps.searches.save(result);
                return send(res, 201, result);
            }

            if (req.method === 'GET' && path === '/api/searches') {
                const recent = await deps.searches.list(20);
                return send(res, 200, {
                    searches: recent.map((s) => ({
                        searchId: s.searchId,
                        createdAt: s.createdAt,
                        criteria: s.criteria,
                        results: s.totalViable,
                        top: s.recommendations
                            .slice(0, 3)
                            .map((r) => ({
                                name: r.destination.name,
                                score: r.score.total,
                                tripTotal: r.costs.tripTotal,
                            })),
                    })),
                });
            }

            const match = /^\/api\/searches\/([A-Za-z0-9-]+)$/.exec(path);
            if (req.method === 'GET' && match) {
                const found = await deps.searches.get(match[1] ?? '');
                if (!found) throw new HttpError(404, 'Search not found');
                return send(res, 200, found);
            }

            throw new HttpError(404, 'Not found');
        } catch (err) {
            if (err instanceof HttpError)
                return send(res, err.status, {
                    error: err.message,
                    ...(err.details ? { details: err.details } : {}),
                });
            if (err instanceof SearchValidationError)
                return send(res, 422, { error: 'Invalid search criteria', details: err.errors });
            console.error(
                JSON.stringify({
                    level: 'error',
                    msg: 'Unhandled request error',
                    error: err instanceof Error ? err.message : String(err),
                }),
            );
            return send(res, 500, { error: 'Internal server error' });
        }
    });
}
