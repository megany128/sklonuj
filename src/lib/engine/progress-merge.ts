import type { Progress, CaseScore, Difficulty } from '../types';

const STORAGE_KEY = 'sklonuj_progress';

export function loadProgressFromLocalStorage(): Progress | null {
	if (typeof window === 'undefined') return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const obj = parsed as Record<string, unknown>;
		if (obj.level !== 'A1' && obj.level !== 'A2' && obj.level !== 'B1') return null;
		return parsed as Progress;
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
			// Take the higher value — local and remote are mirrors once synced,
			// so summing would double-count. Use max to handle the case where
			// one side has newer progress the other hasn't seen yet.
			merged[key] = {
				attempts: Math.max(l.attempts, r.attempts),
				correct: Math.max(l.correct, r.correct)
			};
		} else {
			merged[key] = { ...l };
		}
	}

	return merged;
}

const LEVEL_ORDER: Difficulty[] = ['A1', 'A2', 'B1'];

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
