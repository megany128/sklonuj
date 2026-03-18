import type { Progress, CaseScore, Difficulty } from '../types';
import { STORAGE_KEY, isValidProgress } from './progress';

export function loadProgressFromLocalStorage(): Progress | null {
	if (typeof window === 'undefined') return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isValidProgress(parsed)) return null;
		parsed.paradigmScores ??= {};
		return parsed;
	} catch {
		return null;
	}
}

function mergeScores(
	local: Record<string, CaseScore>,
	remote: Record<string, CaseScore>
): Record<string, CaseScore> {
	const merged: Record<string, CaseScore> = { ...remote };

	for (const key of Object.keys(local)) {
		const l = local[key];
		const r = merged[key];
		if (r) {
			// Take the maximum of each field independently so that data from
			// neither side is silently discarded. This prevents data loss when
			// a user practices on two devices.
			const attempts = Math.max(l.attempts, r.attempts);
			merged[key] = {
				attempts,
				correct: Math.min(Math.max(l.correct, r.correct), attempts)
			};
		} else {
			merged[key] = { ...l };
		}
	}

	return merged;
}

const LEVEL_ORDER: Difficulty[] = ['A1', 'A2', 'B1', 'B2'];

function higherLevel(a: Difficulty, b: Difficulty): Difficulty {
	return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;
}

function laterSession(a: string, b: string): string {
	if (!a) return b;
	if (!b) return a;
	return a > b ? a : b;
}

export function mergeProgress(local: Progress, remote: Progress): Progress {
	return {
		level: higherLevel(local.level, remote.level),
		caseScores: mergeScores(local.caseScores, remote.caseScores),
		paradigmScores: mergeScores(local.paradigmScores ?? {}, remote.paradigmScores ?? {}),
		lastSession: laterSession(local.lastSession, remote.lastSession)
	};
}
