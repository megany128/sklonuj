import { describe, it, expect } from 'vitest';
import { deckAccuracy, sanitizeDeckProgress, withDeckAnswer } from './deck-progress';

describe('deck progress', () => {
	it('counts answers per deck without touching the others', () => {
		let p = withDeckAnswer({}, 'direction', true, 1000);
		p = withDeckAnswer(p, 'direction', false, 2000);
		p = withDeckAnswer(p, 'verbs', true, 3000);
		expect(p.direction).toEqual({ attempts: 2, correct: 1, last: 2000 });
		expect(p.verbs).toEqual({ attempts: 1, correct: 1, last: 3000 });
	});

	it('does not mutate the progress it was given', () => {
		const before = { direction: { attempts: 1, correct: 1, last: 5 } };
		withDeckAnswer(before, 'direction', false, 9);
		expect(before.direction).toEqual({ attempts: 1, correct: 1, last: 5 });
	});

	it('reports percent right, and nothing before the first answer', () => {
		expect(deckAccuracy(undefined)).toBeNull();
		expect(deckAccuracy({ attempts: 0, correct: 0, last: 0 })).toBeNull();
		expect(deckAccuracy({ attempts: 41, correct: 25, last: 1 })).toBe(61);
		expect(deckAccuracy({ attempts: 3, correct: 3, last: 1 })).toBe(100);
	});

	it('keeps well-formed stored entries and drops the rest', () => {
		expect(
			sanitizeDeckProgress({
				direction: { attempts: 4, correct: 3, last: 10 },
				verbs: { attempts: 2, correct: 5, last: 10 },
				retired_deck: { attempts: 1, correct: 1, last: 1 },
				junk: 'x'
			})
		).toEqual({ direction: { attempts: 4, correct: 3, last: 10 } });
		expect(sanitizeDeckProgress(null)).toEqual({});
		expect(sanitizeDeckProgress('nope')).toEqual({});
		expect(sanitizeDeckProgress({ direction: { attempts: -1, correct: 0, last: 0 } })).toEqual({});
	});
});
