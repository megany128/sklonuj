import { writable, get } from 'svelte/store';
import type {
	Progress,
	DrillResult,
	MultiStepResult,
	Difficulty,
	CaseScore,
	Case,
	CellSchedule,
	CellState
} from '../types.ts';
import { getAdjectiveGenderKey } from './adjective-drill.ts';
import {
	adjectiveCellKey,
	advanceCell,
	nounCellKey,
	pickSpacedCase,
	pronounCellKey,
	sanitizeCellSchedule
} from './spacing.ts';

export const STORAGE_KEY = 'sklonuj_progress';
export const STORAGE_USER_KEY = 'sklonuj_progress_user';

const DEFAULT_PROGRESS: Progress = {
	level: 'A1',
	caseScores: {},
	paradigmScores: {},
	lemmaScores: {},
	cellSchedule: {},
	lastSession: '',
	longestStreak: 0
};

function emptyProgress(): Progress {
	return {
		...DEFAULT_PROGRESS,
		caseScores: {},
		paradigmScores: {},
		lemmaScores: {},
		cellSchedule: {},
		longestStreak: 0
	};
}

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

	// lemmaScores is optional for backwards compatibility — accept when missing.
	if (rec['lemmaScores'] !== undefined && !isValidScoresRecord(rec['lemmaScores'])) {
		return false;
	}

	// cellSchedule is not validated here on purpose: it is sanitised per entry
	// on load (`sanitizeCellSchedule`), so a single malformed cell can never
	// invalidate — and thereby wipe — the learner's whole progress record.

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
	if (typeof window === 'undefined') return emptyProgress();

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return emptyProgress();

		const parsed: unknown = JSON.parse(raw);
		if (isValidProgress(parsed)) {
			parsed.paradigmScores ??= {};
			parsed.lemmaScores ??= {};
			parsed.cellSchedule = sanitizeCellSchedule(parsed.cellSchedule, Date.now());
			// Backwards compat: older payloads didn't track longestStreak.
			if (typeof parsed.longestStreak !== 'number') {
				parsed.longestStreak = 0;
			}
			return parsed;
		}
		return emptyProgress();
	} catch {
		return emptyProgress();
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

		// Spacing cell: the rule the question exercises (paradigm × case × number).
		// Only production answers move it — case identification never has the
		// learner produce the ending, the same line recordMultiStepResult draws
		// by tying the noun cell to the form step alone.
		const producesForm = result.question.drillType !== 'case_identification';
		const cellKey =
			result.question.wordCategory === 'adjective' && result.question.adjective
				? adjectiveCellKey(
						result.question.adjective.paradigmType,
						getAdjectiveGenderKey(result.question.word),
						result.question.case,
						result.question.number
					)
				: result.question.wordCategory === 'pronoun' && result.question.pronoun
					? pronounCellKey(
							result.question.pronoun.lemma,
							result.question.case,
							result.question.number
						)
					: nounCellKey(
							result.question.word.paradigm,
							result.question.case,
							result.question.number
						);
		const now = Date.now();
		const existingParadigm: CaseScore = current.paradigmScores[paradigmKey] ?? {
			attempts: 0,
			correct: 0
		};

		const updatedParadigm: CaseScore = {
			attempts: existingParadigm.attempts + 1,
			correct: existingParadigm.correct + (result.correct ? 1 : 0)
		};

		// Per-lemma score for noun drills only — drives the noun selector's
		// preference for unseen / weakly-known lemmas. Adjective and pronoun
		// drills have their own pool logic, so don't record there.
		const lemmaScoreUpdates: Record<string, CaseScore> = {};
		if (
			result.question.wordCategory !== 'adjective' &&
			result.question.wordCategory !== 'pronoun'
		) {
			const lemmaKey = `${result.question.word.lemma}_${result.question.case}_${result.question.number}`;
			const existingLemma: CaseScore = current.lemmaScores?.[lemmaKey] ?? {
				attempts: 0,
				correct: 0
			};
			lemmaScoreUpdates[lemmaKey] = {
				attempts: existingLemma.attempts + 1,
				correct: existingLemma.correct + (result.correct ? 1 : 0)
			};
		}

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
			lemmaScores: {
				...(current.lemmaScores ?? {}),
				...lemmaScoreUpdates
			},
			cellSchedule: producesForm
				? {
						...(current.cellSchedule ?? {}),
						[cellKey]: advanceCell(current.cellSchedule?.[cellKey], result.correct, now)
					}
				: (current.cellSchedule ?? {}),
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

		// Spacing cells: the noun cell follows the form step (the only step that
		// exercises the ending), the adjective cell its own step when shown.
		const now = Date.now();
		const cellUpdates: CellSchedule = {};
		const nounKey = nounCellKey(
			result.question.correctParadigm,
			result.question.case,
			result.question.number
		);
		cellUpdates[nounKey] = advanceCell(current.cellSchedule?.[nounKey], result.formCorrect, now);

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
			const adjCellKey = adjectiveCellKey(
				result.question.adjective.paradigmType,
				getAdjectiveGenderKey(result.question.word),
				result.question.case,
				result.question.number
			);
			cellUpdates[adjCellKey] = advanceCell(
				current.cellSchedule?.[adjCellKey],
				result.adjectiveCorrect,
				now
			);
		}

		// Per-lemma score for the noun in the multi-step question, gated on the
		// form-production correctness (the only step that exercises the noun's
		// declension knowledge).
		const lemmaScoreUpdates: Record<string, CaseScore> = {};
		const lemmaKey = `${result.question.word.lemma}_${result.question.case}_${result.question.number}`;
		const existingLemma: CaseScore = current.lemmaScores?.[lemmaKey] ?? {
			attempts: 0,
			correct: 0
		};
		lemmaScoreUpdates[lemmaKey] = {
			attempts: existingLemma.attempts + 1,
			correct: existingLemma.correct + (result.formCorrect ? 1 : 0)
		};

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
			lemmaScores: {
				...(current.lemmaScores ?? {}),
				...lemmaScoreUpdates
			},
			cellSchedule: {
				...(current.cellSchedule ?? {}),
				...cellUpdates
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
	progress.set(emptyProgress());
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

/**
 * Pick a case for the next question, weighted by how due its spacing cells
 * are. `cellKeysForCase` lists the cells the current pool can drill in a case
 * (see `nounCellKeysForCase` & co. in spacing.ts); a case whose cells are due
 * or never seen is favoured, one just practised drops back.
 */
export function pickWeightedCase(
	cases: Case[],
	cellKeysForCase: (case_: Case) => readonly string[] = () => [],
	now: number = Date.now(),
	random: () => number = Math.random
): Case {
	if (cases.length === 0) {
		throw new Error('pickWeightedCase called with empty cases array');
	}
	const schedule: CellSchedule = get(progress).cellSchedule ?? {};
	return pickSpacedCase(cases, cellKeysForCase, schedule, now, random);
}

/** Read-only view of the current spacing state of one cell. */
export function getCellState(cellKey: string): CellState | undefined {
	return get(progress).cellSchedule?.[cellKey];
}
