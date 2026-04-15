import { writable, get } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';

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
	const obj: Record<string, unknown> = Object.fromEntries(Object.entries(value));
	return (
		typeof obj['currentStreak'] === 'number' &&
		typeof obj['longestStreak'] === 'number' &&
		typeof obj['lastPracticeDate'] === 'string'
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

/**
 * Record today's practice. If a Supabase client is provided, also update the
 * streak columns on the remote `user_progress` table.
 */
export function recordPractice(supabase?: SupabaseClient): void {
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

	// Fire-and-forget remote update
	if (supabase) {
		supabase.auth.getUser().then(({ data: userData }) => {
			const userId = userData?.user?.id;
			if (!userId) return;
			supabase
				.from('user_progress')
				.update({
					current_streak: newCurrentStreak,
					longest_streak: newLongestStreak,
					last_practice_date: today
				})
				.eq('user_id', userId)
				.then(({ error }) => {
					if (error) console.error('Failed to sync streak to Supabase:', error);
				});
		});
	}
}

export function getStreakMessage(currentStreak: number): string {
	if (currentStreak <= 0) return '';
	if (currentStreak <= 2) return 'Keep going!';
	if (currentStreak <= 6) return "You're on a roll!";
	if (currentStreak <= 13) return 'One week strong!';
	if (currentStreak <= 20) return 'Two weeks strong!';
	if (currentStreak <= 29) return 'Three weeks deep!';
	if (currentStreak <= 99) return 'A month and counting!';
	return 'Unstoppable!';
}

/**
 * Push the current localStorage streak values to `user_progress`.
 */
export async function syncStreakToSupabase(supabase: SupabaseClient): Promise<void> {
	const current = get(streak);
	if (current.currentStreak === 0 && current.longestStreak === 0 && !current.lastPracticeDate) {
		return;
	}

	const { data: userData } = await supabase.auth.getUser();
	const userId = userData?.user?.id;
	if (!userId) return;

	const { error } = await supabase.from('user_progress').upsert(
		{
			user_id: userId,
			current_streak: current.currentStreak,
			longest_streak: current.longestStreak,
			last_practice_date: current.lastPracticeDate || null
		},
		{ onConflict: 'user_id' }
	);

	if (error) {
		console.error('Failed to sync streak to Supabase:', error);
	}
}

/**
 * Load streak data from `user_progress` and merge with localStorage
 * (use MAX for streak values, latest date for last_practice_date).
 */
export async function loadStreakFromSupabase(supabase: SupabaseClient): Promise<void> {
	const { data, error } = await supabase
		.from('user_progress')
		.select('current_streak, longest_streak, last_practice_date')
		.maybeSingle();

	if (error) {
		console.error('Failed to load streak from Supabase:', error);
		return;
	}

	if (!data) return;

	interface StreakRow {
		current_streak: number | null;
		longest_streak: number | null;
		last_practice_date: string | null;
	}

	function isStreakRow(value: unknown): value is StreakRow {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
		const obj: Record<string, unknown> = Object.fromEntries(Object.entries(value));
		const currentStreakOk =
			obj['current_streak'] === null || typeof obj['current_streak'] === 'number';
		const longestStreakOk =
			obj['longest_streak'] === null || typeof obj['longest_streak'] === 'number';
		const lastPracticeDateOk =
			obj['last_practice_date'] === null || typeof obj['last_practice_date'] === 'string';
		return currentStreakOk && longestStreakOk && lastPracticeDateOk;
	}

	if (!isStreakRow(data)) {
		console.warn('Unexpected shape for user_progress streak row; skipping remote merge.');
		return;
	}

	const remoteCurrentStreak = data.current_streak ?? 0;
	const remoteLongestStreak = data.longest_streak ?? 0;
	const remoteLastPracticeDate = data.last_practice_date ?? '';

	// For logged-in users, Supabase is the source of truth.
	// Replace localStorage entirely so stale local data from another account
	// doesn't leak across users on the same device.
	streak.set({
		currentStreak: remoteCurrentStreak,
		longestStreak: remoteLongestStreak,
		lastPracticeDate: remoteLastPracticeDate
	});
}
