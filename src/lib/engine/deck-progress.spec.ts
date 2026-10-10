import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	applyAccountDeckProgress,
	clearDeckProgress,
	deckAccuracy,
	deckProgress,
	isMissingFunctionError,
	loadDeckProgress,
	mergeDeckProgress,
	reconcileDeckProgress,
	recordDeckAnswer,
	sanitizeDeckProgress,
	withDeckAnswer
} from './deck-progress';

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

describe('merging two devices', () => {
	const stat = (attempts: number, correct: number, last: number) => ({ attempts, correct, last });

	it('per deck, the device with more attempts wins', () => {
		const laptop = { direction: stat(40, 30, 100), verbs: stat(5, 5, 900) };
		const phone = { direction: stat(12, 6, 999), verbs: stat(9, 2, 50) };
		expect(mergeDeckProgress(laptop, phone)).toEqual({
			direction: stat(40, 30, 100),
			verbs: stat(9, 2, 50)
		});
		// The same answer whichever side asks.
		expect(mergeDeckProgress(phone, laptop)).toEqual(mergeDeckProgress(laptop, phone));
	});

	it('on equal attempts the more recent wins, then the first argument', () => {
		expect(
			mergeDeckProgress({ numbers: stat(10, 4, 100) }, { numbers: stat(10, 9, 200) }).numbers
		).toEqual(stat(10, 9, 200));
		expect(
			mergeDeckProgress({ numbers: stat(10, 4, 100) }, { numbers: stat(10, 9, 100) }).numbers
		).toEqual(stat(10, 4, 100));
	});

	it('keeps decks only one side has, and changes neither input', () => {
		const a = { direction: stat(1, 1, 1) };
		const b = { determiners: stat(3, 2, 2) };
		expect(mergeDeckProgress(a, b)).toEqual({
			direction: stat(1, 1, 1),
			determiners: stat(3, 2, 2)
		});
		expect(mergeDeckProgress({}, b)).toEqual(b);
		expect(a).toEqual({ direction: stat(1, 1, 1) });
		expect(b).toEqual({ determiners: stat(3, 2, 2) });
	});
});

describe('deck progress on this device', () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
			removeItem: (key: string) => {
				storage.delete(key);
			}
		});
		clearDeckProgress();
	});

	afterEach(() => vi.unstubAllGlobals());

	it('counts answers into storage and the store', () => {
		recordDeckAnswer('numbers', true, 1000);
		recordDeckAnswer('numbers', false, 2000);
		expect(loadDeckProgress()).toEqual({ numbers: { attempts: 2, correct: 1, last: 2000 } });
		expect(get(deckProgress)).toEqual(loadDeckProgress());
	});

	it("takes the account's totals in, keeping answers given since", () => {
		recordDeckAnswer('numbers', true, 5000);
		applyAccountDeckProgress({
			numbers: { attempts: 1, correct: 0, last: 10 },
			verbs: { attempts: 20, correct: 15, last: 4000 },
			nonsense: { attempts: 3, correct: 3, last: 1 },
			direction: 'broken'
		});
		// numbers ties on attempts and the local answer is newer; verbs comes
		// from the account; the unknown deck and the broken entry are dropped.
		expect(loadDeckProgress()).toEqual({
			numbers: { attempts: 1, correct: 1, last: 5000 },
			verbs: { attempts: 20, correct: 15, last: 4000 }
		});
		expect(get(deckProgress)).toEqual(loadDeckProgress());
	});

	it('ignores an account payload that is not an object', () => {
		recordDeckAnswer('verbs', true, 1);
		applyAccountDeckProgress('oops');
		applyAccountDeckProgress([1, 2]);
		expect(loadDeckProgress()).toEqual({ verbs: { attempts: 1, correct: 1, last: 1 } });
	});

	it('forgets everything on sign-out', () => {
		recordDeckAnswer('verbs', true, 1);
		clearDeckProgress();
		expect(loadDeckProgress()).toEqual({});
		expect(get(deckProgress)).toEqual({});
	});
});

describe('reconciling with the account after a sync', () => {
	const stat = (attempts: number, correct: number, last: number) => ({ attempts, correct, last });

	it('keeps an answer given during the request when the account is ahead', () => {
		// A new device sends nothing, the learner answers once, and the account
		// comes back with 40: the result is 41, not 40.
		const sent = {};
		const remote = { verbs: stat(40, 30, 1000) };
		const current = { verbs: stat(1, 1, 5000) };
		expect(reconcileDeckProgress(sent, remote, current)).toEqual({ verbs: stat(41, 31, 5000) });
	});

	it('adds only what was counted since the request was sent', () => {
		const sent = { numbers: stat(10, 6, 100) };
		const remote = { numbers: stat(25, 20, 900) };
		const current = { numbers: stat(12, 7, 950) };
		// Two more answers, one right, on top of the account's 25.
		expect(reconcileDeckProgress(sent, remote, current)).toEqual({ numbers: stat(27, 21, 950) });
	});

	it('is the plain merge when nothing was answered meanwhile', () => {
		const sent = { direction: stat(3, 3, 10), verbs: stat(50, 40, 20) };
		const remote = { direction: stat(9, 4, 5), verbs: stat(2, 2, 99) };
		expect(reconcileDeckProgress(sent, remote, sent)).toEqual(mergeDeckProgress(sent, remote));
	});

	it('knows the error a database gives before the migration is run', () => {
		expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
		expect(isMissingFunctionError({ code: '42883' })).toBe(true);
		expect(isMissingFunctionError({ code: '23505' })).toBe(false);
		expect(isMissingFunctionError({})).toBe(false);
	});
});

describe('two tabs signing in at once', () => {
	const storage = new Map<string, string>();
	const account = { verbs: { attempts: 40, correct: 30, last: 1000 } };

	beforeEach(() => {
		storage.clear();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
			removeItem: (key: string) => {
				storage.delete(key);
			}
		});
		clearDeckProgress();
	});

	afterEach(() => vi.unstubAllGlobals());

	it('does not count the account totals twice', () => {
		// What the lock in syncDeckProgress enforces: the second tab reads what
		// it sends only after the first has applied its answer.
		const firstSent = loadDeckProgress();
		applyAccountDeckProgress(account, firstSent);
		const secondSent = loadDeckProgress();
		applyAccountDeckProgress(account, secondSent);
		expect(loadDeckProgress()).toEqual(account);
	});

	it('still keeps an answer either tab gives during an exchange', () => {
		const sent = loadDeckProgress();
		recordDeckAnswer('verbs', true, 5000);
		applyAccountDeckProgress(account, sent);
		expect(loadDeckProgress()).toEqual({ verbs: { attempts: 41, correct: 31, last: 5000 } });
	});
});
