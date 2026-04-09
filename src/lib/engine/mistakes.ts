import { writable, get } from 'svelte/store';
import type { Case, Number_, DrillType } from '../types';
import { isCase, isNumber } from '../types';

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

function isValidMistakeRecord(value: unknown): value is MistakeRecord {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.lemma === 'string' &&
		typeof obj.translation === 'string' &&
		typeof obj.targetCase === 'string' &&
		isCase(obj.targetCase) &&
		typeof obj.targetNumber === 'string' &&
		isNumber(obj.targetNumber) &&
		typeof obj.userAnswer === 'string' &&
		typeof obj.correctAnswer === 'string' &&
		typeof obj.drillType === 'string' &&
		VALID_DRILL_TYPES.has(obj.drillType) &&
		typeof obj.timestamp === 'string'
	);
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
