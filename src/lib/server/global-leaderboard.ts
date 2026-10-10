// Global weekly leaderboard computation, shared by the /api/leaderboard/global
// endpoint (client refreshes) and the home page server load (streamed into
// the initial render so the banner fills in without waiting for hydration).
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { generateAlias } from '$lib/engine/leaderboard-alias';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toDateString(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the Monday of the current week as a YYYY-MM-DD string. */
function getCurrentWeekMonday(): string {
	const now = new Date();
	const day = now.getDay();
	const diff = day === 0 ? 6 : day - 1;
	const monday = new Date(now);
	monday.setDate(now.getDate() - diff);
	return toDateString(monday);
}

/** Returns the Sunday ending the current week as a YYYY-MM-DD string. */
function getCurrentWeekSundayEnd(): string {
	const now = new Date();
	const day = now.getDay();
	const daysUntilSunday = day === 0 ? 0 : 7 - day;
	const sunday = new Date(now);
	sunday.setDate(now.getDate() + daysUntilSunday);
	return toDateString(sunday);
}

export interface GlobalLeaderboardEntry {
	rank: number;
	userId: string;
	displayName: string;
	firstName: string;
	score: number;
	questionsAnswered: number;
	correctAnswers: number;
}

export interface GlobalLeaderboardResult {
	leaderboard: GlobalLeaderboardEntry[];
	totalUsers: number;
	showOnLeaderboard: boolean;
}

export class GlobalLeaderboardError extends Error {}

/** One participant's weekly totals, as `global_leaderboard_week` returns them. */
export interface WeeklyTotalsRow {
	userId: string;
	attempted: number;
	correct: number;
}

/** The part of the result that depends on the week's scores. */
export type LeaderboardWindow = Pick<GlobalLeaderboardResult, 'leaderboard' | 'totalUsers'>;

/** PostgREST / Postgres codes for "this function does not exist". */
const MISSING_FUNCTION_CODES: ReadonlySet<string> = new Set(['PGRST202', '42883']);

function isMissingFunctionError(error: unknown): boolean {
	return (
		isRecord(error) && typeof error.code === 'string' && MISSING_FUNCTION_CODES.has(error.code)
	);
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function toEntry(
	userId: string,
	rank: number,
	score: number,
	questionsAnswered: number,
	correctAnswers: number
): GlobalLeaderboardEntry {
	// Names are not stored: every id maps to the same generated alias.
	const displayName = generateAlias(userId);
	return {
		rank,
		userId,
		displayName,
		firstName: displayName,
		score,
		questionsAnswered,
		correctAnswers
	};
}

/** Reads the rows of `global_leaderboard_week`, skipping any that are malformed. */
export function parseWeeklyTotalsRows(data: readonly unknown[]): WeeklyTotalsRow[] {
	const rows: WeeklyTotalsRow[] = [];
	for (const row of data) {
		if (
			isRecord(row) &&
			typeof row.user_id === 'string' &&
			typeof row.questions_attempted === 'number' &&
			typeof row.questions_correct === 'number'
		) {
			rows.push({
				userId: row.user_id,
				attempted: row.questions_attempted,
				correct: row.questions_correct
			});
		}
	}
	return rows;
}

/**
 * Scores, ranks and windows every participant of the week in JS. This is the
 * path used while `global_leaderboard_window` (migration 040) is not installed;
 * that function applies the same rules in SQL, so keep the two in step.
 *
 * `includeViewer` adds the viewer at 0 points when they have no row yet.
 */
export function rankAndWindowWeeklyTotals(
	rows: readonly WeeklyTotalsRow[],
	viewerId: string | null,
	includeViewer: boolean
): LeaderboardWindow {
	const scoreMap = new Map<string, { attempted: number; correct: number }>();
	for (const row of rows) {
		scoreMap.set(row.userId, { attempted: row.attempted, correct: row.correct });
	}

	// Always include the viewer (even at 0 points) so they can see their rank —
	// unless they've opted out, in which case the banner shows the toggle strip.
	if (viewerId !== null && includeViewer && !scoreMap.has(viewerId)) {
		scoreMap.set(viewerId, { attempted: 0, correct: 0 });
	}

	const entries: GlobalLeaderboardEntry[] = [];
	for (const [userId, stats] of scoreMap) {
		const score = stats.correct * 5 + (stats.attempted - stats.correct);
		entries.push(toEntry(userId, 0, score, stats.attempted, stats.correct));
	}

	// Sort by score descending, correctAnswers as tiebreaker. Rows equal on
	// both are ordered by id, as in the SQL, so the order never depends on the
	// order the rows arrived in.
	entries.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
		return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
	});

	// Assign ranks with ties
	let currentRank = 1;
	for (let i = 0; i < entries.length; i++) {
		if (i > 0 && entries[i].score < entries[i - 1].score) {
			currentRank = i + 1;
		}
		entries[i].rank = currentRank;
	}

	// Window: top 3 + one above self + self + one below
	const selfIdx = viewerId !== null ? entries.findIndex((e) => e.userId === viewerId) : -1;
	const seen = new Set<string>();
	const windowed: GlobalLeaderboardEntry[] = [];

	const addEntry = (entry: GlobalLeaderboardEntry) => {
		if (!seen.has(entry.userId)) {
			seen.add(entry.userId);
			windowed.push(entry);
		}
	};

	for (let i = 0; i < Math.min(3, entries.length); i++) {
		addEntry(entries[i]);
	}

	if (selfIdx >= 0) {
		if (selfIdx >= 1) addEntry(entries[selfIdx - 1]);
		addEntry(entries[selfIdx]);
		if (selfIdx < entries.length - 1) addEntry(entries[selfIdx + 1]);
	}

	windowed.sort((a, b) => a.rank - b.rank);

	// Fill single-rank gaps
	const filled: GlobalLeaderboardEntry[] = [];
	for (let i = 0; i < windowed.length; i++) {
		filled.push(windowed[i]);
		if (i < windowed.length - 1) {
			const gap = windowed[i + 1].rank - windowed[i].rank;
			if (gap === 2) {
				const missingRank = windowed[i].rank + 1;
				const missing = entries.find((e) => e.rank === missingRank);
				if (missing && !seen.has(missing.userId)) {
					seen.add(missing.userId);
					filled.push(missing);
				}
			}
		}
	}

	return { leaderboard: filled, totalUsers: entries.length };
}

/**
 * Maps the rows of `global_leaderboard_window` (already scored, ranked and
 * windowed in SQL) to the leaderboard result. Returns `null` when the payload
 * is not what the function returns, so the caller reports a failure instead of
 * showing a partial board. No rows means nobody is on the board this week.
 */
export function mapLeaderboardWindowRows(data: unknown): LeaderboardWindow | null {
	if (!Array.isArray(data)) return null;
	const positioned: Array<{ position: number; entry: GlobalLeaderboardEntry }> = [];
	let totalUsers = 0;
	for (const row of data) {
		if (
			!isRecord(row) ||
			typeof row.user_id !== 'string' ||
			!isCount(row.questions_attempted) ||
			!isCount(row.questions_correct) ||
			!isCount(row.score) ||
			!isCount(row.rank) ||
			!isCount(row.board_position) ||
			!isCount(row.total_users)
		) {
			return null;
		}
		totalUsers = row.total_users;
		positioned.push({
			position: row.board_position,
			entry: toEntry(
				row.user_id,
				row.rank,
				row.score,
				row.questions_attempted,
				row.questions_correct
			)
		});
	}
	// The function already orders its rows; sorting again keeps the result
	// right even if the transport ever stops preserving that order.
	positioned.sort((a, b) => a.position - b.position);
	return { leaderboard: positioned.map((p) => p.entry), totalUsers };
}

/**
 * Computes the windowed global weekly leaderboard for the viewer: a signed-in
 * `user`, else the anonymous visitor identified by `guestId` (the validated
 * `sklonuj_guest_id` cookie — see `$lib/engine/guest-id`), else nobody.
 * Guests are scored from `guest_practice_sessions`, unioned into the same
 * RPC as signed-in users (migration 037); they have no opt-out toggle.
 *
 * Ranking and windowing happen in Postgres (`global_leaderboard_window`,
 * migration 040), so only the handful of rows the banner shows come back.
 * Where that function is not installed yet, the older `global_leaderboard_week`
 * is fetched and ranked here instead, with the same result.
 *
 * Throws `GlobalLeaderboardError` on misconfiguration or query failure —
 * callers decide whether that is a 500 or a soft `null`.
 */
export async function computeGlobalLeaderboard(
	user: { id: string } | null,
	guestId: string | null = null
): Promise<GlobalLeaderboardResult> {
	const viewerId = user ? user.id : guestId;
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		console.error(
			'global leaderboard: SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL is not configured'
		);
		throw new GlobalLeaderboardError('Leaderboard service is not configured');
	}
	const aggClient = createClient(supabaseUrl, serviceRoleKey);

	const weekMonday = getCurrentWeekMonday();
	const weekSunday = getCurrentWeekSundayEnd();

	// The board and the viewer's own opt-in flag are independent — run them
	// concurrently.
	const [windowResult, myProfileResult] = await Promise.all([
		aggClient.rpc('global_leaderboard_window', {
			week_start: weekMonday,
			week_end: weekSunday,
			viewer_id: viewerId
		}),
		user
			? aggClient.from('profiles').select('show_on_leaderboard').eq('id', user.id).maybeSingle()
			: Promise.resolve(null)
	]);

	// Anonymous viewers default to true; a signed-in user without a profile row
	// (should not happen — the signup trigger creates one) is treated as opted in.
	const showOnLeaderboard =
		myProfileResult !== null &&
		isRecord(myProfileResult.data) &&
		typeof myProfileResult.data.show_on_leaderboard === 'boolean'
			? myProfileResult.data.show_on_leaderboard
			: true;

	if (!windowResult.error) {
		const board = mapLeaderboardWindowRows(windowResult.data);
		if (board === null) {
			console.error('global leaderboard: unexpected window payload', windowResult.data);
			throw new GlobalLeaderboardError('Failed to fetch leaderboard');
		}
		return { ...board, showOnLeaderboard };
	}

	if (!isMissingFunctionError(windowResult.error)) {
		console.error('global leaderboard: window query failed', windowResult.error);
		throw new GlobalLeaderboardError('Failed to fetch leaderboard');
	}

	// Migration 040 has not been run on this database: fetch every
	// participant's totals and rank them here.
	const aggregateResult = await aggClient.rpc('global_leaderboard_week', {
		week_start: weekMonday,
		week_end: weekSunday
	});

	if (aggregateResult.error || !Array.isArray(aggregateResult.data)) {
		console.error('global leaderboard: aggregate query failed', aggregateResult.error);
		throw new GlobalLeaderboardError('Failed to fetch leaderboard');
	}

	return {
		...rankAndWindowWeeklyTotals(
			parseWeeklyTotalsRows(aggregateResult.data),
			viewerId,
			showOnLeaderboard
		),
		showOnLeaderboard
	};
}
