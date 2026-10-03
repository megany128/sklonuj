import { describe, expect, it } from 'vitest';
import { capitalizeSentence } from './sentence-case';

describe('capitalizeSentence', () => {
	it('capitalizes a sentence that starts with the filled blank', () => {
		expect(capitalizeSentence('lidé jsou tady.')).toBe('Lidé jsou tady.');
	});

	it('skips the bracket that marks the drilled word', () => {
		expect(capitalizeSentence('[život] existuje.')).toBe('[Život] existuje.');
	});

	it('leaves an already capitalized sentence alone', () => {
		expect(capitalizeSentence('Jdu do školy.')).toBe('Jdu do školy.');
	});
});
