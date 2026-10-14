/**
 * Conformance guard: the dependency rule between workspace packages
 * (REF-CleanArchitecture §1 and §6, REF-TypeScript §8, spec §52).
 *
 * - Each package imports only the workspace packages its layer allows: the domain
 *   knows nothing of pricing, ranking or providers; provider adapters never import
 *   each other; only the API composes adapters; the web app never reaches a provider.
 * - `shared` and `domain` import no third-party package.
 * - Every workspace import is declared in the importing package's package.json.
 * - Relative imports never leave their package.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCOPE = '@travel-where-to/';

const PROVIDERS = [
    'flight-providers',
    'accommodation-providers',
    'routing-providers',
    'weather-providers',
];

/** Workspace packages each package may import from production code. */
const ALLOWED: Record<string, readonly string[]> = {
    shared: [],
    domain: ['shared'],
    'provider-http': ['domain'],
    pricing: ['shared', 'domain'],
    ranking: ['shared', 'domain'],
    'destination-engine': ['shared', 'domain', 'ranking'],
    'flight-providers': ['shared', 'domain', 'provider-http'],
    'accommodation-providers': ['shared', 'domain', 'provider-http'],
    'routing-providers': ['shared', 'domain', 'provider-http'],
    'weather-providers': ['shared', 'domain', 'provider-http'],
    llm: ['shared', 'domain'],
    'search-engine': ['shared', 'domain', 'pricing', 'ranking', 'destination-engine'],
    api: [
        'shared',
        'domain',
        'provider-http',
        'pricing',
        'ranking',
        'destination-engine',
        'llm',
        'search-engine',
        ...PROVIDERS,
    ],
    web: ['shared', 'domain', 'llm', 'ranking'],
};

/** Extra workspace packages a package's tests may import (real adapters exercised by the engine tests). */
const ALLOWED_IN_TESTS: Record<string, readonly string[]> = {
    'search-engine': PROVIDERS,
};

/** Packages that import nothing outside the workspace and Node's built-ins. */
const NO_THIRD_PARTY = ['shared', 'domain', 'provider-http'];

interface Pkg {
    readonly name: string;
    readonly dir: string;
    readonly deps: ReadonlySet<string>;
    readonly devDeps: ReadonlySet<string>;
}

function workspacePackages(): Pkg[] {
    const dirs = ['packages', 'services', 'apps'].flatMap((group) =>
        readdirSync(join(ROOT, group))
            .map((d) => join(ROOT, group, d))
            .filter((d) => statSync(d).isDirectory()),
    );
    return dirs.map((dir) => {
        const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
            name: string;
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const local = (o: Record<string, string> | undefined) =>
            new Set(
                Object.keys(o ?? {})
                    .filter((k) => k.startsWith(SCOPE))
                    .map((k) => k.slice(SCOPE.length)),
            );
        return {
            name: json.name.slice(SCOPE.length),
            dir,
            deps: local(json.dependencies),
            devDeps: local(json.devDependencies),
        };
    });
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts') ? [path] : [];
    });
}

const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const FROM_CLAUSE = /\bfrom\s*['"]([^'"]+)['"]$/;

/** Module specifiers of a file's static imports and re-exports, and of its dynamic imports. */
function importsOf(file: string): string[] {
    const text = readFileSync(file, 'utf8');
    const found: string[] = [];
    for (const chunk of text.split(';')) {
        const lines = chunk.split('\n');
        const first = lines.findIndex((l) => /^(import|export)\b/.test(l.trimStart()));
        if (first === -1) continue;
        const statement = lines.slice(first).join('\n').trim();
        const sideEffect = /^import\s*['"]([^'"]+)['"]$/.exec(statement);
        const from = FROM_CLAUSE.exec(statement);
        const spec = sideEffect?.[1] ?? from?.[1];
        if (spec) found.push(spec);
    }
    for (const m of text.matchAll(DYNAMIC_IMPORT)) if (m[1]) found.push(m[1]);
    return found;
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const packages = workspacePackages();

test('every workspace package has a layer rule', () => {
    assert.deepEqual(
        packages.map((p) => p.name).filter((n) => !(n in ALLOWED)),
        [],
    );
});

for (const pkg of packages) {
    const files = sourceFiles(join(pkg.dir, 'src'));

    test(`${pkg.name}: imports only the workspace packages its layer allows`, () => {
        const violations: string[] = [];
        for (const file of files) {
            const allowed = new Set([
                ...(ALLOWED[pkg.name] ?? []),
                ...(isTest(file) ? (ALLOWED_IN_TESTS[pkg.name] ?? []) : []),
            ]);
            for (const spec of importsOf(file)) {
                if (!spec.startsWith(SCOPE)) continue;
                const target = spec.slice(SCOPE.length).split('/')[0] ?? '';
                if (!allowed.has(target))
                    violations.push(`${relative(ROOT, file)} imports ${spec}`);
            }
        }
        assert.deepEqual(violations, []);
    });

    test(`${pkg.name}: workspace imports are declared in package.json`, () => {
        const missing: string[] = [];
        for (const file of files) {
            for (const spec of importsOf(file)) {
                if (!spec.startsWith(SCOPE)) continue;
                const target = spec.slice(SCOPE.length).split('/')[0] ?? '';
                const declared = pkg.deps.has(target) || (isTest(file) && pkg.devDeps.has(target));
                if (!declared) missing.push(`${relative(ROOT, file)} imports ${spec}`);
            }
        }
        assert.deepEqual(missing, []);
    });

    test(`${pkg.name}: relative imports stay inside the package`, () => {
        const escaping: string[] = [];
        for (const file of files) {
            for (const spec of importsOf(file)) {
                if (!spec.startsWith('.')) continue;
                const target = resolve(dirname(file), spec);
                if (!(target + sep).startsWith(pkg.dir + sep))
                    escaping.push(`${relative(ROOT, file)} imports ${spec}`);
            }
        }
        assert.deepEqual(escaping, []);
    });

    if (NO_THIRD_PARTY.includes(pkg.name)) {
        test(`${pkg.name}: imports no third-party package`, () => {
            const thirdParty: string[] = [];
            for (const file of files) {
                for (const spec of importsOf(file)) {
                    if (spec.startsWith('.') || spec.startsWith('node:') || spec.startsWith(SCOPE))
                        continue;
                    thirdParty.push(`${relative(ROOT, file)} imports ${spec}`);
                }
            }
            assert.deepEqual(thirdParty, []);
        });
    }
}
