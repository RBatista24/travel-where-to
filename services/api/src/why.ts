/**
 * `pnpm explain [searchId]` (or `pnpm run why`; plain `pnpm why` is a pnpm built-in) - explains a search the running API already did:
 * which places were left out and why, provider problems, notices and data sources.
 * Reads from the running API (default http://localhost:4000); prints no secrets.
 */
const base = process.env.TRAVEL_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

interface Issue {
    provider: string;
    operation: string;
    kind: string;
    message: string;
    destinationId?: string;
}
interface Result {
    searchId: string;
    criteria: unknown;
    totalViable: number;
    recommendations: {
        destination: { name: string };
        costs: { tripTotal: { amountMinor: number } };
    }[];
    excluded: { destinationId: string; name?: string; reason: string }[];
    issues: Issue[];
    notices: string[];
    sources: Record<string, { provider: string; mock: boolean }>;
}

async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
}

let id = process.argv[2];
try {
    if (!id) {
        const list = await get<{ searches: { searchId: string }[] }>('/api/searches');
        id = list.searches[0]?.searchId;
        if (!id) throw new Error('No searches yet - run one in the app first.');
    }
    const r = await get<Result>(`/api/searches/${encodeURIComponent(id)}`);
    console.log(`Search ${r.searchId}: ${r.totalViable} trip(s) fit`);
    console.log(
        'Data:',
        Object.entries(r.sources)
            .map(([k, s]) => `${k}=${s.provider}${s.mock ? ' (mock)' : ''}`)
            .join(' · '),
    );
    if (r.recommendations.length)
        console.log(
            'Top:',
            r.recommendations
                .slice(0, 5)
                .map(
                    (x) =>
                        `${x.destination.name} €${Math.round(x.costs.tripTotal.amountMinor / 100)}`,
                )
                .join(' · '),
        );

    const byReason = new Map<string, string[]>();
    for (const e of r.excluded)
        byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.name ?? e.destinationId]);
    if (byReason.size) {
        console.log(`\nLeft out (${r.excluded.length}):`);
        for (const [reason, names] of [...byReason].sort((a, b) => b[1].length - a[1].length))
            console.log(`  ${names.length} × ${reason}\n      ${names.join(', ')}`);
    }

    const byIssue = new Map<string, { n: number; places: Set<string>; example: string }>();
    for (const i of r.issues) {
        const k = `${i.provider} · ${i.operation} · ${i.kind}`;
        const cur = byIssue.get(k) ?? {
            n: 0,
            places: new Set<string>(),
            example: i.message.slice(0, 160),
        };
        cur.n++;
        if (i.destinationId) cur.places.add(i.destinationId);
        byIssue.set(k, cur);
    }
    if (byIssue.size) {
        console.log(`\nProvider problems (${r.issues.length} calls failed):`);
        for (const [k, v] of [...byIssue].sort((a, b) => b[1].n - a[1].n))
            console.log(`  ${v.n} × ${k} (${v.places.size} places)\n      e.g. ${v.example}`);
    } else console.log('\nNo provider errors.');
    if (r.notices.length) console.log(`\nNotices:\n${r.notices.map((n) => `  - ${n}`).join('\n')}`);
} catch (e) {
    console.error(
        `Couldn't read the search from ${base}: ${e instanceof Error ? e.message : String(e)}. Is \`pnpm dev\` running?`,
    );
    process.exit(1);
}
export {};
