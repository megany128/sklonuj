import {
	parseChapterSelection,
	serializeChapterSelection,
	type ChapterSelection
} from './chapter-selection';

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
