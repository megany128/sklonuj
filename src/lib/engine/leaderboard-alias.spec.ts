import { describe, it, expect } from 'vitest';
import { aliasGloss, allAliases, generateAlias } from './leaderboard-alias';

describe('generateAlias', () => {
	it('is deterministic and always one of the listed names', () => {
		const names = new Set(allAliases());
		for (let i = 0; i < 500; i++) {
			const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
			const alias = generateAlias(id);
			expect(generateAlias(id)).toBe(alias);
			expect(names.has(alias)).toBe(true);
		}
	});

	it('spreads ids across many names', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 300; i++) seen.add(generateAlias(crypto.randomUUID()));
		expect(seen.size).toBeGreaterThan(150);
	});

	it('agrees the adjective with the noun gender', () => {
		const names = allAliases();
		expect(names).toContain('Statečná Svíčková');
		expect(names).toContain('Ospalé Kuře');
		expect(names).toContain('Smažený Kapr');
		expect(names).not.toContain('Statečný Svíčková');
	});

	it('keeps kitchen words to real dishes and drops nonsense pairs', () => {
		const names = allAliases();
		expect(names).toContain('Nakládaný Hermelín');
		expect(names).toContain('Vánoční Kapr');
		expect(names).not.toContain('Uzený Houbař');
		expect(names).not.toContain('Nakládaný Utopenec');
		expect(names).not.toContain('Vánoční Vánočka');
		expect(names).not.toContain('Moravská Kulajda');
	});
});

describe('aliasGloss', () => {
	it('gives the English and a note for generated names only', () => {
		expect(aliasGloss('Moravský Utopenec')?.english).toBe('Moravian Drowned Man');
		expect(aliasGloss('Moravský Utopenec')?.note).toContain('pickle');
		expect(aliasGloss('Jana Nováková')).toBeNull();
	});
});
