import { writable, get } from 'svelte/store';
import type { Progress, DrillResult, Difficulty, CaseScore } from '../types.ts';

const STORAGE_KEY = 'sklonuj_progress';

const DEFAULT_PROGRESS: Progress = {
	level: 'A1',
	caseScores: {},
	lastSession: ''
};

function isValidCaseScore(value: unknown): value is CaseScore {
	return (
		typeof value === 'object' &&
		value !== null &&
		'attempts' in value &&
		'correct' in value &&
		typeof (value as CaseScore).attempts === 'number' &&
		typeof (value as CaseScore).correct === 'number'
	);
}

function isValidProgress(value: unknown): value is Progress {
	if (typeof value !== 'object' || value === null) return false;

	const obj = value as Record<string, unknown>;

	if (obj.level !== 'A1' && obj.level !== 'A2' && obj.level !== 'B1') return false;
	if (typeof obj.lastSession !== 'string') return false;
	if (typeof obj.caseScores !== 'object' || obj.caseScores === null) return false;

	const scores = obj.caseScores as Record<string, unknown>;
	for (const key of Object.keys(scores)) {
		if (!isValidCaseScore(scores[key])) return false;
	}

	return true;
}

function loadFromStorage(): Progress {
	if (typeof window === 'undefined') return { ...DEFAULT_PROGRESS, caseScores: {} };

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return { ...DEFAULT_PROGRESS, caseScores: {} };

		const parsed: unknown = JSON.parse(raw);
		if (isValidProgress(parsed)) {
			return parsed;
		}
		return { ...DEFAULT_PROGRESS, caseScores: {} };
	} catch {
		return { ...DEFAULT_PROGRESS, caseScores: {} };
	}
}

export const progress = writable<Progress>(loadFromStorage());

if (typeof window !== 'undefined') {
	progress.subscribe((value) => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		} catch {
			// localStorage may be unavailable or full; silently ignore
		}
	});
}

export function recordResult(result: DrillResult): void {
	progress.update((current) => {
		const caseKey = `${result.question.case}_${result.question.number}`;
		const existing: CaseScore = current.caseScores[caseKey] ?? { attempts: 0, correct: 0 };

		const updated: CaseScore = {
			attempts: existing.attempts + 1,
			correct: existing.correct + (result.correct ? 1 : 0)
		};

		return {
			...current,
			caseScores: {
				...current.caseScores,
				[caseKey]: updated
			},
			lastSession: new Date().toISOString().slice(0, 10)
		};
	});
}

export function getAccuracy(caseKey: string): number {
	const current = get(progress);
	const score: CaseScore | undefined = current.caseScores[caseKey];
	if (!score || score.attempts === 0) return 0;
	return score.correct / score.attempts;
}

export function setLevel(level: Difficulty): void {
	progress.update((current) => ({
		...current,
		level
	}));
}

export function resetProgress(): void {
	progress.set({ level: 'A1', caseScores: {}, lastSession: '' });
}
