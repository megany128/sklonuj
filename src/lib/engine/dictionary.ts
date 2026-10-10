import type { CaseForms } from '../types';
import { stripDiacritics } from '../utils/diacritics';

/**
 * The lookup dictionary: ~18k nouns with full tables, for looking up words the
 * drill bank doesn't have. It is several megabytes, and nothing asked in
 * practice needs it (every drilled word is in the word bank), so it is loaded
 * on demand: the first lookup that misses the bank, or the first search.
 * Callers read `getDictionary()` and call `loadDictionary()` when they need it,
 * handling a rejection (offline, a dropped connection) as "not available yet".
 */

export interface DictionaryEntry {
	lemma: string;
	translation: string;
	sg: CaseForms;
	pl: CaseForms;
	paradigmHint: string;
}

export interface Dictionary {
	entries: readonly DictionaryEntry[];
	/** Exact match on the lowercased lemma. */
	find(lemma: string): DictionaryEntry | null;
	/** Match ignoring diacritics, for a query typed without them. */
	findStripped(lemma: string): DictionaryEntry | null;
}

function toCaseForms(raw: unknown): CaseForms | null {
	if (!Array.isArray(raw) || raw.length < 7) return null;
	return [
		String(raw[0]),
		String(raw[1]),
		String(raw[2]),
		String(raw[3]),
		String(raw[4]),
		String(raw[5]),
		String(raw[6])
	];
}

/** Each raw row is `[lemma, translation, sg[7], pl[7], paradigmHint?]`. */
export function buildDictionary(rows: readonly (readonly unknown[])[]): Dictionary {
	const entries: DictionaryEntry[] = [];
	const byLemma = new Map<string, DictionaryEntry>();
	const byStripped = new Map<string, DictionaryEntry>();
	for (const raw of rows) {
		const sg = toCaseForms(raw[2]);
		const pl = toCaseForms(raw[3]);
		if (!sg || !pl) continue;
		const entry: DictionaryEntry = {
			lemma: String(raw[0]),
			translation: String(raw[1]),
			sg,
			pl,
			paradigmHint: raw[4] != null ? String(raw[4]) : ''
		};
		entries.push(entry);
		// First entry wins, as the dictionary lists the commoner sense first.
		const key = entry.lemma.toLowerCase();
		if (!byLemma.has(key)) byLemma.set(key, entry);
		const stripped = stripDiacritics(key);
		if (!byStripped.has(stripped)) byStripped.set(stripped, entry);
	}
	return {
		entries,
		find: (lemma) => byLemma.get(lemma.toLowerCase()) ?? null,
		findStripped: (lemma) => byStripped.get(stripDiacritics(lemma.toLowerCase())) ?? null
	};
}

let loaded: Dictionary | null = null;
let loading: Promise<Dictionary> | null = null;

/** The dictionary if it has been loaded, else null. Never triggers a load. */
export function getDictionary(): Dictionary | null {
	return loaded;
}

/**
 * Load the dictionary (once) and return it. A failed download rejects and is
 * forgotten, so the next call tries again rather than failing for the rest of
 * the visit.
 */
export function loadDictionary(): Promise<Dictionary> {
	loading ??= import('../data/dictionary.json').then(
		(module) => {
			loaded = buildDictionary(module.default);
			return loaded;
		},
		(error: unknown) => {
			loading = null;
			throw error;
		}
	);
	return loading;
}
