import { writable, get } from 'svelte/store';
import type { Progress, DrillResult, Difficulty, CaseScore, Case } from '../types.ts';
import { ALL_CASES } from '../types.ts';

const STORAGE_KEY = 'sklonuj_progress';

const DEFAULT_PROGRESS: Progress = {
	level: 'A1',
	caseScores: {},
	paradigmScores: {},
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

function isValidScoresRecord(value: unknown): value is Record<string, CaseScore> {
	if (typeof value !== 'object' || value === null) return false;
	const scores = value as Record<string, unknown>;
	for (const key of Object.keys(scores)) {
		if (!isValidCaseScore(scores[key])) return false;
	}
	return true;
}

function isValidProgress(value: unknown): value is Progress {
	if (typeof value !== 'object' || value === null) return false;

	const obj = value as Record<string, unknown>;

	if (obj.level !== 'A1' && obj.level !== 'A2' && obj.level !== 'B1' && obj.level !== 'B2')
		return false;
	if (typeof obj.lastSession !== 'string') return false;
	if (!isValidScoresRecord(obj.caseScores)) return false;

	// paradigmScores is optional for backwards compatibility — default to {} if missing
	if (obj.paradigmScores !== undefined && !isValidScoresRecord(obj.paradigmScores)) return false;

	return true;
}

function loadFromStorage(): Progress {
	if (typeof window === 'undefined')
		return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {} };

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {} };

		const parsed: unknown = JSON.parse(raw);
		if (isValidProgress(parsed)) {
			// Backwards compatibility: default paradigmScores to {} if missing from stored data
			return { ...parsed, paradigmScores: parsed.paradigmScores ?? {} };
		}
		return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {} };
	} catch {
		return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {} };
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
		const existingCase: CaseScore = current.caseScores[caseKey] ?? {
			attempts: 0,
			correct: 0
		};

		const updatedCase: CaseScore = {
			attempts: existingCase.attempts + 1,
			correct: existingCase.correct + (result.correct ? 1 : 0)
		};

		const paradigmKey = `${result.question.word.paradigm}_${result.question.case}_${result.question.number}`;
		const existingParadigm: CaseScore = current.paradigmScores[paradigmKey] ?? {
			attempts: 0,
			correct: 0
		};

		const updatedParadigm: CaseScore = {
			attempts: existingParadigm.attempts + 1,
			correct: existingParadigm.correct + (result.correct ? 1 : 0)
		};

		return {
			...current,
			caseScores: {
				...current.caseScores,
				[caseKey]: updatedCase
			},
			paradigmScores: {
				...current.paradigmScores,
				[paradigmKey]: updatedParadigm
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
	progress.set({ level: 'A1', caseScores: {}, paradigmScores: {}, lastSession: '' });
}

export function getCombinedCaseStrength(case_: Case): { accuracy: number; attempts: number } {
	const current = get(progress);
	const sgKey = `${case_}_sg`;
	const plKey = `${case_}_pl`;
	const sg = current.caseScores[sgKey];
	const pl = current.caseScores[plKey];
	const totalAttempts = (sg?.attempts ?? 0) + (pl?.attempts ?? 0);
	const totalCorrect = (sg?.correct ?? 0) + (pl?.correct ?? 0);
	return {
		accuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
		attempts: totalAttempts
	};
}

export function getAllCaseStrengths(): Record<Case, { accuracy: number; attempts: number }> {
	const result = {} as Record<Case, { accuracy: number; attempts: number }>;
	for (const c of ALL_CASES) {
		result[c] = getCombinedCaseStrength(c);
	}
	return result;
}

export function pickWeightedCase(cases: Case[]): Case {
	const strengths = getAllCaseStrengths();
	const weights = cases.map((c) => {
		const s = strengths[c];
		if (s.attempts === 0) return 3; // Untried cases get highest weight
		return 1 / (s.accuracy + 0.1); // Lower accuracy = higher weight
	});

	const totalWeight = weights.reduce((sum, w) => sum + w, 0);
	let random = Math.random() * totalWeight;

	for (let i = 0; i < cases.length; i++) {
		random -= weights[i];
		if (random <= 0) return cases[i];
	}

	return cases[cases.length - 1];
}
