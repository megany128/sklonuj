import { writable, get } from 'svelte/store';

export const STREAK_STORAGE_KEY = 'sklonuj_streak';

export interface StreakData {
	currentStreak: number;
	longestStreak: number;
	lastPracticeDate: string; // YYYY-MM-DD
}

const DEFAULT_STREAK: StreakData = {
	currentStreak: 0,
	longestStreak: 0,
	lastPracticeDate: ''
};

function isValidStreakData(value: unknown): value is StreakData {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.currentStreak === 'number' &&
		typeof obj.longestStreak === 'number' &&
		typeof obj.lastPracticeDate === 'string'
	);
}

function loadFromStorage(): StreakData {
	if (typeof window === 'undefined') return { ...DEFAULT_STREAK };

	try {
		const raw = localStorage.getItem(STREAK_STORAGE_KEY);
		if (raw === null) return { ...DEFAULT_STREAK };

		const parsed: unknown = JSON.parse(raw);
		if (isValidStreakData(parsed)) return parsed;
		return { ...DEFAULT_STREAK };
	} catch {
		return { ...DEFAULT_STREAK };
	}
}

export const streak = writable<StreakData>(loadFromStorage());

if (typeof window !== 'undefined') {
	streak.subscribe((value) => {
		try {
			localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(value));
		} catch {
			// localStorage may be unavailable or full; silently ignore
		}
	});
}

function getTodayDateString(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function isYesterday(dateStr: string, todayStr: string): boolean {
	const todayParts = todayStr.split('-');
	const today = new Date(Number(todayParts[0]), Number(todayParts[1]) - 1, Number(todayParts[2]));
	today.setDate(today.getDate() - 1);
	const y = today.getFullYear();
	const m = String(today.getMonth() + 1).padStart(2, '0');
	const d = String(today.getDate()).padStart(2, '0');
	return dateStr === `${y}-${m}-${d}`;
}

export function recordPractice(): void {
	const today = getTodayDateString();
	const current = get(streak);

	// Already recorded today — no-op
	if (current.lastPracticeDate === today) return;

	let newCurrentStreak: number;

	if (isYesterday(current.lastPracticeDate, today)) {
		// Consecutive day — increment
		newCurrentStreak = current.currentStreak + 1;
	} else {
		// Gap in practice — reset to 1
		newCurrentStreak = 1;
	}

	const newLongestStreak = Math.max(current.longestStreak, newCurrentStreak);

	streak.set({
		currentStreak: newCurrentStreak,
		longestStreak: newLongestStreak,
		lastPracticeDate: today
	});
}

export function getStreakMessage(currentStreak: number): string {
	if (currentStreak <= 0) return '';
	if (currentStreak <= 2) return 'Keep going!';
	if (currentStreak <= 6) return "You're on a roll!";
	if (currentStreak <= 13) return 'One week strong!';
	if (currentStreak <= 29) return 'Incredible dedication!';
	return 'Unstoppable!';
}
