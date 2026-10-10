import { writable, get } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Case, Number_, DrillType, Paradigm } from '../types';
import { isCase, isNumber, ALL_PARADIGMS } from '../types';

/** Which bank a mistake's lemma belongs to (mirrors `DrillQuestion.wordCategory`). */
export type MistakeWordCategory = 'noun' | 'pronoun' | 'adjective';

export interface MistakeRecord {
	/** The lemma of the word (noun or pronoun) */
	lemma: string;
	/** English translation of the word */
	translation: string;
	/** The target grammatical case */
	targetCase: Case;
	/** The target number (singular/plural) */
	targetNumber: Number_;
	/** What the student typed */
	userAnswer: string;
	/** The correct answer */
	correctAnswer: string;
	/** The drill type that produced this mistake */
	drillType: DrillType;
	/** ISO timestamp of when the mistake happened */
	timestamp: string;
	/** The sentence context (for case_identification / sentence_fill_in drills) */
	sentence?: string;
	/** The paradigm the user selected (multi_step only) */
	userParadigm?: Paradigm;
	/** The correct paradigm (multi_step only) */
	correctParadigm?: Paradigm;
	/**
	 * Which bank `lemma` comes from. Absent on records saved before this field
	 * existed, where the bank can't be known (see `isMistakeLemmaInBank`).
	 */
	wordCategory?: MistakeWordCategory;
}

/** The lemmas currently in each bank, for dropping mistakes on removed words. */
export interface BankLemmaSets {
	noun: ReadonlySet<string>;
	adjective: ReadonlySet<string>;
	pronoun: ReadonlySet<string>;
}

const STORAGE_KEY = 'sklonuj_mistakes';
const MAX_MISTAKES = 200;
// Per-case cap so one runaway case can't crowd out the others. With 7 cases
// this still leaves room for the global MAX_MISTAKES ceiling.
const MAX_MISTAKES_PER_CASE = 30;

const VALID_DRILL_TYPES: ReadonlySet<string> = new Set([
	'form_production',
	'case_identification',
	'sentence_fill_in',
	'multi_step'
]);

const VALID_PARADIGMS: ReadonlySet<string> = new Set(ALL_PARADIGMS);

const VALID_WORD_CATEGORIES: ReadonlySet<string> = new Set(['noun', 'pronoun', 'adjective']);

function isMistakeWordCategory(value: unknown): value is MistakeWordCategory {
	return typeof value === 'string' && VALID_WORD_CATEGORIES.has(value);
}

function isValidParadigm(value: unknown): value is Paradigm {
	return typeof value === 'string' && VALID_PARADIGMS.has(value);
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidMistakeRecord(value: unknown): value is MistakeRecord {
	if (!isRecord(value)) return false;
	if (
		typeof value.lemma !== 'string' ||
		typeof value.translation !== 'string' ||
		typeof value.targetCase !== 'string' ||
		!isCase(value.targetCase) ||
		typeof value.targetNumber !== 'string' ||
		!isNumber(value.targetNumber) ||
		typeof value.userAnswer !== 'string' ||
		typeof value.correctAnswer !== 'string' ||
		typeof value.drillType !== 'string' ||
		!VALID_DRILL_TYPES.has(value.drillType) ||
		typeof value.timestamp !== 'string'
	)
		return false;

	// Validate optional paradigm fields
	if (value.userParadigm !== undefined && !isValidParadigm(value.userParadigm)) return false;
	if (value.correctParadigm !== undefined && !isValidParadigm(value.correctParadigm)) return false;
	if (value.wordCategory !== undefined && !isMistakeWordCategory(value.wordCategory)) return false;

	return true;
}

let bankLemmaSets: Promise<BankLemmaSets> | null = null;

/**
 * Lemma sets of the three current banks, built once on first use. The banks
 * are imported on demand: this module is in the layout, and a static import
 * would put the whole word bank on every page.
 */
export function loadBankLemmaSets(): Promise<BankLemmaSets> {
	bankLemmaSets ??= Promise.all([
		import('./drill'),
		import('./adjective-drill'),
		import('./pronoun-drill')
	]).then(([nouns, adjectives, pronouns]) => ({
		noun: new Set(nouns.loadWordBank().map((w) => w.lemma)),
		adjective: new Set(adjectives.loadAdjectiveBank().map((a) => a.lemma)),
		pronoun: new Set(pronouns.loadPronounBank().map((p) => p.lemma))
	}));
	return bankLemmaSets;
}

/**
 * True when the word a mistake was made on still exists. A mistake keeps a
 * copy of the word, so without this a lemma removed from a bank would stay
 * in "Recent mistakes" forever.
 *
 * Multi-step questions are always about a noun. Otherwise the record's
 * `wordCategory` names the bank to check. Records saved before that field
 * existed don't say whether the lemma was a noun, an adjective or a pronoun,
 * so they are kept when any bank has the lemma: guessing "noun" would wipe
 * every older adjective and pronoun mistake.
 */
export function isMistakeLemmaInBank(record: MistakeRecord, banks: BankLemmaSets): boolean {
	if (record.drillType === 'multi_step') return banks.noun.has(record.lemma);
	switch (record.wordCategory) {
		case 'noun':
			return banks.noun.has(record.lemma);
		case 'adjective':
			return banks.adjective.has(record.lemma);
		case 'pronoun':
			return banks.pronoun.has(record.lemma);
		default:
			return (
				banks.noun.has(record.lemma) ||
				banks.adjective.has(record.lemma) ||
				banks.pronoun.has(record.lemma)
			);
	}
}

/**
 * Turn untrusted stored data (localStorage JSON or the `user_mistakes.mistakes`
 * column) into mistake records. Malformed entries are always rejected. With
 * `banks`, mistakes on words that are no longer in the banks are rejected too;
 * without, that check is left to `purgeRemovedWords`, which loads the banks.
 */
export function parseMistakeRecords(raw: unknown, banks?: BankLemmaSets): MistakeRecord[] {
	if (!Array.isArray(raw)) return [];
	const valid = raw.filter(isValidMistakeRecord);
	return banks ? valid.filter((m) => isMistakeLemmaInBank(m, banks)) : valid;
}

function loadFromStorage(): MistakeRecord[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return [];
		const parsed: unknown = JSON.parse(raw);
		return parseMistakeRecords(parsed);
	} catch {
		return [];
	}
}

function saveToStorage(records: MistakeRecord[]): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
	} catch {
		// localStorage may be unavailable or full
	}
}

export const mistakeRecords = writable<MistakeRecord[]>(loadFromStorage());

if (typeof window !== 'undefined') {
	mistakeRecords.subscribe((value) => {
		saveToStorage(value);
	});
}

/**
 * Drop saved mistakes on words that are no longer in the banks (the store
 * subscription writes the cleaned list back). Does nothing, and loads
 * nothing, when there are no saved mistakes.
 */
export async function purgeRemovedWords(): Promise<void> {
	if (get(mistakeRecords).length === 0) return;
	const banks = await loadBankLemmaSets();
	const current = get(mistakeRecords);
	const kept = current.filter((m) => isMistakeLemmaInBank(m, banks));
	if (kept.length !== current.length) mistakeRecords.set(kept);
}

// Stored mistakes are checked against the banks once per visit, after the
// page is up: the banks load in the background and only if there is
// something to check.
if (typeof window !== 'undefined') void purgeRemovedWords();

export function addMistake(record: Omit<MistakeRecord, 'timestamp'>): void {
	mistakeRecords.update((current) => {
		const newRecord: MistakeRecord = {
			...record,
			timestamp: new Date().toISOString()
		};
		const prepended = [newRecord, ...current];

		// Per-case cap: keep only the most recent MAX_MISTAKES_PER_CASE entries
		// for each case so a runaway case can't crowd out the others. We walk
		// in order (newest → oldest) and drop overflow, preserving recency.
		const perCaseCount = new Map<Case, number>();
		const perCaseFiltered: MistakeRecord[] = [];
		for (const m of prepended) {
			const count = perCaseCount.get(m.targetCase) ?? 0;
			if (count >= MAX_MISTAKES_PER_CASE) continue;
			perCaseCount.set(m.targetCase, count + 1);
			perCaseFiltered.push(m);
		}

		// Global cap as a backstop (e.g. if we ever change MAX_MISTAKES_PER_CASE).
		if (perCaseFiltered.length > MAX_MISTAKES) {
			return perCaseFiltered.slice(0, MAX_MISTAKES);
		}
		return perCaseFiltered;
	});
}

export function getAllMistakes(): MistakeRecord[] {
	return get(mistakeRecords);
}

export function getMistakesByCase(targetCase: Case): MistakeRecord[] {
	return get(mistakeRecords).filter((m) => m.targetCase === targetCase);
}

export function clearMistakes(): void {
	mistakeRecords.set([]);
}

export function getMistakeCount(): number {
	return get(mistakeRecords).length;
}

/**
 * Return unique word+case+number combinations from mistakes,
 * useful for generating review practice questions.
 */
export function getUniqueMistakeKeys(): Array<{
	lemma: string;
	targetCase: Case;
	targetNumber: Number_;
}> {
	const seen = new Set<string>();
	const results: Array<{ lemma: string; targetCase: Case; targetNumber: Number_ }> = [];
	for (const m of get(mistakeRecords)) {
		const key = `${m.lemma}_${m.targetCase}_${m.targetNumber}`;
		if (!seen.has(key)) {
			seen.add(key);
			results.push({
				lemma: m.lemma,
				targetCase: m.targetCase,
				targetNumber: m.targetNumber
			});
		}
	}
	return results;
}

/**
 * Upsert localStorage mistakes to the remote `user_mistakes` table.
 */
export async function syncMistakesToSupabase(supabase: SupabaseClient): Promise<void> {
	const local = get(mistakeRecords);
	if (local.length === 0) return;

	const { data: userData } = await supabase.auth.getUser();
	const userId = userData?.user?.id;
	if (!userId) return;

	// Strip sentence from form_production records before syncing
	const cleaned: MistakeRecord[] = local.map((m) => {
		if (m.drillType === 'form_production' && m.sentence) {
			return { ...m, sentence: undefined };
		}
		return m;
	});

	const { error } = await supabase.from('user_mistakes').upsert(
		{
			user_id: userId,
			mistakes: cleaned,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id' }
	);

	if (error) {
		console.error('Failed to sync mistakes to Supabase:', error);
	}
}

/**
 * Fetch mistakes from `user_mistakes` and merge with localStorage (union of
 * both, deduped by lemma+case+number+timestamp). Pushes the merged result
 * back to Supabase if it diverges from the remote, so a guest's pre-login
 * mistakes aren't silently dropped on first sign-in.
 */
export async function loadMistakesFromSupabase(supabase: SupabaseClient): Promise<void> {
	const { data: userData } = await supabase.auth.getUser();
	const userId = userData?.user?.id;
	if (!userId) return;

	const { data, error } = await supabase
		.from('user_mistakes')
		.select('mistakes')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		console.error('Failed to load mistakes from Supabase:', error);
		return;
	}

	// Mistakes on removed words are dropped here, as they are when reading
	// localStorage. The remote row itself is left alone.
	const remoteRaw: unknown = data ? data.mistakes : null;
	const remoteValid = parseMistakeRecords(remoteRaw);
	const remoteMistakes =
		remoteValid.length > 0
			? parseMistakeRecords(remoteValid, await loadBankLemmaSets())
			: remoteValid;

	// The local list is checked against the banks by `purgeRemovedWords`, and
	// everything added since comes from a live question.
	const localMistakes = get(mistakeRecords);

	// Union local + remote, dedupe on (lemma, targetCase, targetNumber, timestamp).
	const seen = new Set<string>();
	const union: MistakeRecord[] = [];
	for (const m of [...localMistakes, ...remoteMistakes]) {
		const key = `${m.lemma}|${m.targetCase}|${m.targetNumber}|${m.timestamp}`;
		if (seen.has(key)) continue;
		seen.add(key);
		union.push(m);
	}

	// Newest first.
	union.sort((a, b) => (a.timestamp > b.timestamp ? -1 : a.timestamp < b.timestamp ? 1 : 0));

	// Apply the same per-case + global cap as addMistake to keep the local
	// store bounded and avoid blowing past `MAX_MISTAKES`.
	const perCaseCount = new Map<Case, number>();
	const capped: MistakeRecord[] = [];
	for (const m of union) {
		const count = perCaseCount.get(m.targetCase) ?? 0;
		if (count >= MAX_MISTAKES_PER_CASE) continue;
		perCaseCount.set(m.targetCase, count + 1);
		capped.push(m);
		if (capped.length >= MAX_MISTAKES) break;
	}

	mistakeRecords.set(capped);

	// If the merged result diverges from what's in Supabase, push it back so
	// the union persists across devices. Identity is on the same dedupe key.
	const remoteKeySet = new Set(
		remoteMistakes.map((m) => `${m.lemma}|${m.targetCase}|${m.targetNumber}|${m.timestamp}`)
	);
	const cappedKeySet = new Set(
		capped.map((m) => `${m.lemma}|${m.targetCase}|${m.targetNumber}|${m.timestamp}`)
	);
	let diverged = remoteKeySet.size !== cappedKeySet.size;
	if (!diverged) {
		for (const k of cappedKeySet) {
			if (!remoteKeySet.has(k)) {
				diverged = true;
				break;
			}
		}
	}
	if (diverged) {
		await syncMistakesToSupabase(supabase);
	}
}
