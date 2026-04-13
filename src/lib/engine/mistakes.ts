import { writable, get } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Case, Number_, DrillType, Paradigm } from '../types';
import { isCase, isNumber, ALL_PARADIGMS } from '../types';

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

	return true;
}

function loadFromStorage(): MistakeRecord[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isValidMistakeRecord);
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
 * Fetch mistakes from `user_mistakes` and merge with localStorage (union of both).
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

	if (!data) return;

	const remoteMistakes: MistakeRecord[] = [];
	const raw: unknown = data.mistakes;
	if (Array.isArray(raw)) {
		for (const entry of raw) {
			if (isValidMistakeRecord(entry)) {
				remoteMistakes.push(entry);
			}
		}
	}

	if (remoteMistakes.length === 0) return;

	// For logged-in users, Supabase is the source of truth.
	// Replace localStorage entirely so stale local records don't persist.
	mistakeRecords.set(remoteMistakes);
}
