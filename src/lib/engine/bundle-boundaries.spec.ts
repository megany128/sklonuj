import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

/**
 * Guards on what the first page load carries. They read the source, because a
 * stray static import doesn't break anything a behaviour test would notice:
 * it only makes every page megabytes heavier.
 */

// `import … from '…'`, `import '…'` and `export … from '…'`; dynamic
// `import('…')` is the on-demand route and is not matched.
const STATIC_SPECIFIER =
	/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

/** Specifiers a file loads at import time. Type-only statements are erased by the compiler. */
function staticImports(file: string): string[] {
	return [...readFileSync(file, 'utf-8').matchAll(STATIC_SPECIFIER)]
		.filter((m) => m[1] === undefined)
		.map((m) => m[2]);
}

/** A specifier's source file inside `src`, or null for packages and SvelteKit modules. */
function resolveSpecifier(from: string, spec: string): string | null {
	let base: string;
	if (spec.startsWith('$lib/')) base = join('src/lib', spec.slice('$lib/'.length));
	else if (spec.startsWith('.')) base = join(dirname(from), spec);
	else return null;
	for (const candidate of [base, `${base}.ts`, `${base}.svelte`, join(base, 'index.ts')]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return normalize(candidate);
	}
	throw new Error(`cannot resolve "${spec}" from ${from}`);
}

/** Every source file reachable from `entry` through static imports and re-exports. */
function staticClosure(entry: string): Set<string> {
	const seen = new Set<string>();
	const queue = [normalize(entry)];
	for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
		if (seen.has(file)) continue;
		seen.add(file);
		if (!/\.(ts|svelte)$/.test(file)) continue;
		for (const spec of staticImports(file)) {
			const target = resolveSpecifier(file, spec);
			if (target) queue.push(target);
		}
	}
	return seen;
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(ts|svelte)$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
	});
}

describe('first-load weight', () => {
	it('reads imports, re-exports and side-effect imports, and skips type-only ones', () => {
		expect(staticImports('src/lib/engine/adjective-drill.ts')).toContain('./adjective-keys');
		expect(staticImports('src/lib/engine/adjective-drill.ts')).toContain('../data/word_bank.json');
		expect(staticImports('src/lib/engine/adjective-keys.ts')).toEqual([]);
		expect(staticImports('src/routes/+layout.svelte')).toContain('../app.css');
	});

	it('nothing imports the lookup dictionary statically', () => {
		const offenders = sourceFiles('src').filter((file) =>
			staticImports(file).some((spec) => spec.endsWith('dictionary.json'))
		);
		expect(offenders).toEqual([]);
	});

	it('the root layout, which every page loads, never reaches the word banks', () => {
		const closure = [...staticClosure('src/routes/+layout.svelte')];
		expect(closure.length).toBeGreaterThan(10);
		// Followed through every file the layout pulls in, so a helper that
		// imports a bank is caught as well as a direct import.
		const heavy = closure.filter((file) =>
			/src\/lib\/data\/(word_bank|adjective_bank|pronoun_bank|dictionary|sentence_templates)\.json$|src\/lib\/engine\/(drill|adjective-drill|pronoun-drill)\.ts$/.test(
				file
			)
		);
		expect(heavy).toEqual([]);
	});
});
