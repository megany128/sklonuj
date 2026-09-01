/**
 * KzK chapter-mode selection, shared by the client (localStorage) and the
 * server (`sklonuj_chapter` cookie) so SSR renders the same layout branch the
 * client will hydrate into. Pure module: no browser or SvelteKit imports.
 */
import kzkChaptersData from '$lib/data/kzk_chapters.json';

export type ChapterBook = 'kzk1' | 'kzk2';

export interface ChapterSelection {
	book: ChapterBook;
	chapter: string;
}

/** Key used for both `localStorage` and the mirroring cookie. */
export const CHAPTER_STORAGE_KEY = 'sklonuj_chapter';

/** Only the chapter ids are needed here; structural typing keeps this cast-free. */
interface ChapterIdIndex {
	kzk1: { chapters: { id: string }[] };
	kzk2: { chapters: { id: string }[] };
}
const chapterIndex: ChapterIdIndex = kzkChaptersData;

export function isChapterBook(value: unknown): value is ChapterBook {
	return value === 'kzk1' || value === 'kzk2';
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Narrow an already-parsed value (e.g. `page.data.initialChapter`) to a
 * ChapterSelection whose chapter exists in the named book.
 */
export function isChapterSelection(value: unknown): value is ChapterSelection {
	if (!isRecord(value)) return false;
	if (!isChapterBook(value.book)) return false;
	if (typeof value.chapter !== 'string') return false;
	const chapterId = value.chapter;
	return chapterIndex[value.book].chapters.some((ch) => ch.id === chapterId);
}

/**
 * Parse the serialized form stored in localStorage / the cookie:
 * `{"book":"kzk1"|"kzk2"|null,"chapter":"<id>"|null}`.
 *
 * Returns `null` for free practice, for anything malformed, and for a chapter
 * id that isn't in the selected book — chapter mode without a resolvable
 * chapter has no UI, so it is treated as free practice.
 */
export function parseChapterSelection(raw: string | null | undefined): ChapterSelection | null {
	if (raw === null || raw === undefined || raw === '') return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	return isChapterSelection(parsed) ? { book: parsed.book, chapter: parsed.chapter } : null;
}

/** Inverse of `parseChapterSelection`; `null` serializes as free practice. */
export function serializeChapterSelection(selection: ChapterSelection | null): string {
	return JSON.stringify(
		selection === null
			? { book: null, chapter: null }
			: { book: selection.book, chapter: selection.chapter }
	);
}

export function chapterSelectionsEqual(
	a: ChapterSelection | null,
	b: ChapterSelection | null
): boolean {
	if (a === null || b === null) return a === b;
	return a.book === b.book && a.chapter === b.chapter;
}
