import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards on what the first page load carries. They read the source, because a
 * stray static import doesn't break anything a behaviour test would notice:
 * it only makes every page megabytes heavier.
 */

const STATIC_IMPORT = /^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm;

function staticImports(file: string): string[] {
	return [...readFileSync(file, 'utf-8').matchAll(STATIC_IMPORT)].map((m) => m[1]);
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(ts|svelte)$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
	});
}

describe('first-load weight', () => {
	it('nothing imports the lookup dictionary statically', () => {
		const offenders = sourceFiles('src').filter((file) =>
			staticImports(file).some((spec) => spec.endsWith('dictionary.json'))
		);
		expect(offenders).toEqual([]);
	});

	it('the modules every page loads do not pull in the word banks', () => {
		// The engine modules the root layout imports, directly or through each other.
		const everyPage = [
			'progress.ts',
			'progress-merge.ts',
			'mistakes.ts',
			'streak.ts',
			'achievements.ts',
			'guest-sessions.ts',
			'guest-id.ts',
			'mastery-celebrations.ts',
			'spacing.ts',
			'adjective-keys.ts'
		];
		const banks =
			/(^|\/)(drill|adjective-drill|pronoun-drill|determiners|cell-pools)(\.ts)?$|\/data\/.*_bank\.json$/;
		for (const name of everyPage) {
			const heavy = staticImports(join('src/lib/engine', name)).filter((spec) => banks.test(spec));
			expect(heavy, name).toEqual([]);
		}
	});
});
