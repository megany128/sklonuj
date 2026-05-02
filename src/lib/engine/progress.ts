import { writable, get } from 'svelte/store';
import type {
	Progress,
	DrillResult,
	MultiStepResult,
	Difficulty,
	CaseScore,
	Case
} from '../types.ts';
import { getAdjectiveGenderKey } from './adjective-drill.ts';

export const STORAGE_KEY = 'sklonuj_progress';
export const STORAGE_USER_KEY = 'sklonuj_progress_user';

const DEFAULT_PROGRESS: Progress = {
	level: 'A1',
	caseScores: {},
	paradigmScores: {},
	lastSession: '',
	longestStreak: 0
};

export function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidCaseScore(value: unknown): value is CaseScore {
	if (!isRecordLike(value)) return false;
	return typeof value['attempts'] === 'number' && typeof value['correct'] === 'number';
}

export function isValidScoresRecord(value: unknown): value is Record<string, CaseScore> {
	if (!isRecordLike(value)) return false;
	for (const [, v] of Object.entries(value)) {
		if (!isValidCaseScore(v)) return false;
	}
	return true;
}

export function isValidProgress(value: unknown): value is Progress {
	if (!isRecordLike(value)) return false;
	const rec = value;

	if (
		rec['level'] !== 'A1' &&
		rec['level'] !== 'A2' &&
		rec['level'] !== 'B1' &&
		rec['level'] !== 'B2'
	)
		return false;
	if (typeof rec['lastSession'] !== 'string') return false;
	if (!isValidScoresRecord(rec['caseScores'])) return false;

	// paradigmScores is optional for backwards compatibility — accept when missing.
	if (rec['paradigmScores'] !== undefined && !isValidScoresRecord(rec['paradigmScores'])) {
		return false;
	}

	// longestStreak is optional for backwards compatibility (older payloads
	// didn't have it). When present it must be a non-negative number.
	const longestStreak = rec['longestStreak'];
	if (
		longestStreak !== undefined &&
		(typeof longestStreak !== 'number' || !Number.isFinite(longestStreak) || longestStreak < 0)
	) {
		return false;
	}

	return true;
}

function loadFromStorage(): Progress {
	if (typeof window === 'undefined')
		return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {}, longestStreak: 0 };

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {} };

		const parsed: unknown = JSON.parse(raw);
		if (isValidProgress(parsed)) {
			parsed.paradigmScores ??= {};
			// Backwards compat: older payloads didn't track longestStreak.
			if (typeof parsed.longestStreak !== 'number') {
				parsed.longestStreak = 0;
			}
			return parsed;
		}
		return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {}, longestStreak: 0 };
	} catch {
		return { ...DEFAULT_PROGRESS, caseScores: {}, paradigmScores: {}, longestStreak: 0 };
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

		const paradigmKey =
			result.question.wordCategory === 'adjective' && result.question.adjective
				? `adj_${result.question.adjective.lemma}_${getAdjectiveGenderKey(result.question.word)}_${result.question.case}_${result.question.number}`
				: result.question.wordCategory === 'pronoun' && result.question.pronoun
					? `pronoun_${result.question.pronoun.lemma}_${result.question.case}_${result.question.number}`
					: `${result.question.word.paradigm}_${result.question.case}_${result.question.number}`;
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

export function recordMultiStepResult(result: MultiStepResult): void {
	progress.update((current) => {
		const updates: Record<string, CaseScore> = {};

		// Record paradigm identification accuracy
		const paradigmIdKey = `paradigm_id_${result.question.correctParadigm}`;
		const existingParadigmId: CaseScore = current.paradigmScores[paradigmIdKey] ?? {
			attempts: 0,
			correct: 0
		};
		updates[paradigmIdKey] = {
			attempts: existingParadigmId.attempts + 1,
			correct: existingParadigmId.correct + (result.paradigmCorrect ? 1 : 0)
		};

		// Record case identification accuracy (if step was shown)
		const caseScoreUpdates: Record<string, CaseScore> = {};
		if (result.caseCorrect !== null) {
			const caseKey = `${result.question.case}_${result.question.number}`;
			const existingCase: CaseScore = current.caseScores[caseKey] ?? {
				attempts: 0,
				correct: 0
			};
			caseScoreUpdates[caseKey] = {
				attempts: existingCase.attempts + 1,
				correct: existingCase.correct + (result.caseCorrect ? 1 : 0)
			};
		}

		// Record form production accuracy
		const paradigmKey = `${result.question.correctParadigm}_${result.question.case}_${result.question.number}`;
		const existingParadigm: CaseScore = current.paradigmScores[paradigmKey] ?? {
			attempts: 0,
			correct: 0
		};
		updates[paradigmKey] = {
			attempts: existingParadigm.attempts + 1,
			correct: existingParadigm.correct + (result.formCorrect ? 1 : 0)
		};

		// Record adjective form accuracy (if adjective step was present)
		if (
			result.question.adjective &&
			result.adjectiveCorrect !== null &&
			result.adjectiveCorrect !== undefined
		) {
			const adjKey = `adj_${result.question.adjective.lemma}_${getAdjectiveGenderKey(result.question.word)}_${result.question.case}_${result.question.number}`;
			const existingAdj: CaseScore = current.paradigmScores[adjKey] ?? {
				attempts: 0,
				correct: 0
			};
			updates[adjKey] = {
				attempts: existingAdj.attempts + 1,
				correct: existingAdj.correct + (result.adjectiveCorrect ? 1 : 0)
			};
		}

		return {
			...current,
			caseScores: {
				...current.caseScores,
				...caseScoreUpdates
			},
			paradigmScores: {
				...current.paradigmScores,
				...updates
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
	progress.set({
		level: 'A1',
		caseScores: {},
		paradigmScores: {},
		lastSession: '',
		longestStreak: 0
	});
}

/**
 * Update the all-time longest correct-in-a-row answer streak.
 * No-op if the supplied value is less than or equal to the current best.
 */
export function updateLongestStreak(streak: number): void {
	if (!Number.isFinite(streak) || streak <= 0) return;
	progress.update((current) => {
		if (streak <= current.longestStreak) return current;
		return { ...current, longestStreak: streak };
	});
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
	return {
		nom: getCombinedCaseStrength('nom'),
		gen: getCombinedCaseStrength('gen'),
		dat: getCombinedCaseStrength('dat'),
		acc: getCombinedCaseStrength('acc'),
		voc: getCombinedCaseStrength('voc'),
		loc: getCombinedCaseStrength('loc'),
		ins: getCombinedCaseStrength('ins')
	};
}

export function pickWeightedCase(cases: Case[]): Case {
	if (cases.length === 0) {
		throw new Error('pickWeightedCase called with empty cases array');
	}

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
