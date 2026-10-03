import { describe, it, expect } from 'vitest';
import { diffAnswer } from './answer-diff';

describe('diffAnswer', () => {
	it('marks the differing ending', () => {
		expect(diffAnswer('ženem', 'ženou')).toEqual([
			{ text: 'žen', changed: false },
			{ text: 'em', changed: true }
		]);
		expect(diffAnswer('ženou', 'ženem')).toEqual([
			{ text: 'žen', changed: false },
			{ text: 'ou', changed: true }
		]);
	});

	it('marks only the letters whose accents differ', () => {
		expect(diffAnswer('zene', 'ženě')).toEqual([
			{ text: 'z', changed: true },
			{ text: 'en', changed: false },
			{ text: 'e', changed: true }
		]);
		expect(diffAnswer('ženě', 'zene')).toEqual([
			{ text: 'ž', changed: true },
			{ text: 'en', changed: false },
			{ text: 'ě', changed: true }
		]);
	});

	it('pinpoints a stem alternation using the shared suffix', () => {
		expect(diffAnswer('kočke', 'kočce')).toEqual([
			{ text: 'koč', changed: false },
			{ text: 'k', changed: true },
			{ text: 'e', changed: false }
		]);
	});

	it('marks nothing in the shorter word when the other only adds an ending', () => {
		expect(diffAnswer('hrad', 'hradu')).toEqual([{ text: 'hrad', changed: false }]);
		expect(diffAnswer('hradu', 'hrad')).toEqual([
			{ text: 'hrad', changed: false },
			{ text: 'u', changed: true }
		]);
	});

	it('marks the whole word when nothing is shared', () => {
		expect(diffAnswer('jemu', 'mu')).toEqual([
			{ text: 'je', changed: true },
			{ text: 'mu', changed: false }
		]);
		expect(diffAnswer('ji', 'ho')).toEqual([{ text: 'ji', changed: true }]);
	});

	it('ignores case but keeps the original casing', () => {
		expect(diffAnswer('Ženě', 'ženě')).toEqual([{ text: 'Ženě', changed: false }]);
	});

	it('handles decomposed input', () => {
		expect(diffAnswer('ženě', 'ženě')).toEqual([{ text: 'ženě', changed: false }]);
	});
});
