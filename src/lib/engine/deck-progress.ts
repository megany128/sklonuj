import type { FocusTopic } from '../types';
import { isFocusTopic } from './focus';
import { isRecord } from '../utils/is-record';
import {
	parseChapterSelection,
	serializeChapterSelection,
	type ChapterSelection
} from './chapter-selection';

/**
 * How a learner is doing in each deck: answers given and answers right. Kept
 * on the device (localStorage) so the Decks page can show "62% right · 41
 * answered"; it plays no part in scheduling.
 */
export interface DeckStat {
	attempts: number;
	correct: number;
	/** Epoch ms of the latest answer. */
	last: number;
}

export type DeckProgress = Partial<Record<FocusTopic, DeckStat>>;

const STORAGE_KEY = 'sklonuj_deck_progress';

function isStat(value: unknown): value is DeckStat {
	if (!isRecord(value)) return false;
	const { attempts, correct, last } = value;
	return (
		typeof attempts === 'number' &&
		typeof correct === 'number' &&
		typeof last === 'number' &&
		Number.isFinite(attempts) &&
		Number.isFinite(correct) &&
		Number.isFinite(last) &&
		attempts >= 0 &&
		correct >= 0 &&
		correct <= attempts
	);
}

/** Keep the well-formed entries of whatever was stored; drop the rest. */
export function sanitizeDeckProgress(raw: unknown): DeckProgress {
	const out: DeckProgress = {};
	if (!isRecord(raw)) return out;
	for (const [key, value] of Object.entries(raw)) {
		if (isFocusTopic(key) && isStat(value)) out[key] = value;
	}
	return out;
}

/** The progress after one more answer in `deck`. Does not mutate `progress`. */
export function withDeckAnswer(
	progress: DeckProgress,
	deck: FocusTopic,
	correct: boolean,
	now: number
): DeckProgress {
	const prev = progress[deck] ?? { attempts: 0, correct: 0, last: 0 };
	return {
		...progress,
		[deck]: {
			attempts: prev.attempts + 1,
			correct: prev.correct + (correct ? 1 : 0),
			last: now
		}
	};
}

/** Whole-number percent right, or null before the first answer. */
export function deckAccuracy(stat: DeckStat | undefined): number | null {
	if (!stat || stat.attempts === 0) return null;
	return Math.round((stat.correct / stat.attempts) * 100);
}

export function loadDeckProgress(): DeckProgress {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? sanitizeDeckProgress(JSON.parse(raw)) : {};
	} catch {
		return {};
	}
}

/** Count one answer in `deck` and save. Storage failures are ignored. */
export function recordDeckAnswer(deck: FocusTopic, correct: boolean, now = Date.now()): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const next = withDeckAnswer(loadDeckProgress(), deck, correct, now);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode or a full quota: the deck still works, it just isn't counted.
	}
}

const RETURN_CHAPTER_KEY = 'sklonuj_deck_return_chapter';

/**
 * The KzK chapter a deck was started from, so leaving the deck goes back to
 * it. Stored rather than held in memory: the practice page is rebuilt on a
 * refresh and on every trip to the Decks page and back.
 */
export function loadDeckReturnChapter(): ChapterSelection | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return parseChapterSelection(localStorage.getItem(RETURN_CHAPTER_KEY));
	} catch {
		return null;
	}
}

/** Remember the chapter to return to, or forget it with `null`. */
export function saveDeckReturnChapter(selection: ChapterSelection | null): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (selection === null) localStorage.removeItem(RETURN_CHAPTER_KEY);
		else localStorage.setItem(RETURN_CHAPTER_KEY, serializeChapterSelection(selection));
	} catch {
		// Without storage the deck still works; leaving it lands in free practice.
	}
}
