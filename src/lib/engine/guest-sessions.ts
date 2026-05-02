import { getTodayDateStr } from '../utils/dates';

export const STORAGE_KEY = 'sklonuj_guest_sessions';

export interface GuestSession {
	sessionDate: string;
	questionsAttempted: number;
	questionsCorrect: number;
	caseScores: Record<string, { attempted: number; correct: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSessionCaseScore(value: unknown): value is { attempted: number; correct: number } {
	if (!isRecord(value)) return false;
	const attempted = value['attempted'];
	const correct = value['correct'];
	return (
		typeof attempted === 'number' &&
		typeof correct === 'number' &&
		Number.isFinite(attempted) &&
		Number.isFinite(correct) &&
		attempted >= 0 &&
		correct >= 0 &&
		correct <= attempted
	);
}

function isValidCaseScoresRecord(
	value: unknown
): value is Record<string, { attempted: number; correct: number }> {
	if (!isRecord(value)) return false;
	for (const v of Object.values(value)) {
		if (!isValidSessionCaseScore(v)) return false;
	}
	return true;
}

function isValidGuestSession(value: unknown): value is GuestSession {
	if (!isRecord(value)) return false;
	if (typeof value['sessionDate'] !== 'string') return false;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value['sessionDate'])) return false;
	if (typeof value['questionsAttempted'] !== 'number' || value['questionsAttempted'] < 0)
		return false;
	if (
		typeof value['questionsCorrect'] !== 'number' ||
		value['questionsCorrect'] < 0 ||
		value['questionsCorrect'] > value['questionsAttempted']
	)
		return false;
	if (!isValidCaseScoresRecord(value['caseScores'])) return false;
	return true;
}

function loadFromStorage(): Record<string, GuestSession> {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
		const result: Record<string, GuestSession> = {};
		for (const [date, value] of Object.entries(parsed)) {
			if (isValidGuestSession(value) && value.sessionDate === date) {
				result[date] = value;
			}
		}
		return result;
	} catch {
		return {};
	}
}

function saveToStorage(sessions: Record<string, GuestSession>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
	} catch {
		// localStorage may be unavailable or full
	}
}

/**
 * Increment today's guest session counters. Mirrors the per-day shape of
 * `practice_sessions` so the same data can be uploaded after sign-up.
 */
export function recordGuestSessionActivity(correct: boolean, caseKey?: string): void {
	if (typeof window === 'undefined') return;
	const today = getTodayDateStr();
	const sessions = loadFromStorage();
	const existing: GuestSession = sessions[today] ?? {
		sessionDate: today,
		questionsAttempted: 0,
		questionsCorrect: 0,
		caseScores: {}
	};

	const updatedCaseScores: Record<string, { attempted: number; correct: number }> = {
		...existing.caseScores
	};
	if (caseKey) {
		const prev = updatedCaseScores[caseKey] ?? { attempted: 0, correct: 0 };
		updatedCaseScores[caseKey] = {
			attempted: prev.attempted + 1,
			correct: prev.correct + (correct ? 1 : 0)
		};
	}

	sessions[today] = {
		sessionDate: today,
		questionsAttempted: existing.questionsAttempted + 1,
		questionsCorrect: existing.questionsCorrect + (correct ? 1 : 0),
		caseScores: updatedCaseScores
	};

	saveToStorage(sessions);
}

/** Return all guest sessions sorted by date ascending. */
export function getGuestSessions(): GuestSession[] {
	const sessions = loadFromStorage();
	return Object.values(sessions).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
}

/** Remove all guest session data from localStorage. */
export function clearGuestSessions(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// localStorage may be unavailable
	}
}
