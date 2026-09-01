// Global weekly leaderboard computation, shared by the /api/leaderboard/global
// endpoint (client refreshes) and the home page server load (streamed into
// the initial render so the banner fills in without waiting for hydration).
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ADJECTIVES = [
	'Happy',
	'Brave',
	'Clever',
	'Swift',
	'Calm',
	'Bold',
	'Bright',
	'Keen',
	'Wise',
	'Merry',
	'Witty',
	'Gentle',
	'Lively',
	'Plucky',
	'Steady',
	'Nimble'
];
const ANIMALS = [
	'Otter',
	'Fox',
	'Bear',
	'Owl',
	'Hare',
	'Wolf',
	'Deer',
	'Hawk',
	'Lynx',
	'Seal',
	'Crane',
	'Raven',
	'Finch',
	'Badger',
	'Robin',
	'Falcon'
];

/** Deterministic alias from a UUID — same ID always produces the same name. */
function generateAlias(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = (hash * 31 + userId.charCodeAt(i)) | 0;
	}
	const adjIdx = ((hash >>> 0) % ADJECTIVES.length) | 0;
	const aniIdx = ((hash >>> 4) % ANIMALS.length) | 0;
	return `${ADJECTIVES[adjIdx]} ${ANIMALS[aniIdx]}`;
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

/**
 * Computes the windowed global weekly leaderboard for `user` (or an anonymous
 * viewer when null). Throws `GlobalLeaderboardError` on misconfiguration or
 * query failure — callers decide whether that is a 500 or a soft `null`.
 */
export async function computeGlobalLeaderboard(
	user: { id: string } | null
): Promise<GlobalLeaderboardResult> {
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

	// The aggregate (one RPC: join + week filter + sum in Postgres) and the
	// viewer's own opt-in flag are independent — run them concurrently.
	const [aggregateResult, myProfileResult] = await Promise.all([
		aggClient.rpc('global_leaderboard_week', { week_start: weekMonday, week_end: weekSunday }),
		user
			? aggClient.from('profiles').select('show_on_leaderboard').eq('id', user.id).maybeSingle()
			: Promise.resolve(null)
	]);

	if (aggregateResult.error || !Array.isArray(aggregateResult.data)) {
		console.error('global leaderboard: aggregate query failed', aggregateResult.error);
		throw new GlobalLeaderboardError('Failed to fetch leaderboard');
	}

	// Anonymous viewers default to true; a signed-in user without a profile row
	// (should not happen — the signup trigger creates one) is treated as opted in.
	const showOnLeaderboard =
		myProfileResult !== null &&
		isRecord(myProfileResult.data) &&
		typeof myProfileResult.data.show_on_leaderboard === 'boolean'
			? myProfileResult.data.show_on_leaderboard
			: true;

	const scoreMap = new Map<string, { attempted: number; correct: number }>();
	for (const row of aggregateResult.data) {
		if (
			isRecord(row) &&
			typeof row.user_id === 'string' &&
			typeof row.questions_attempted === 'number' &&
			typeof row.questions_correct === 'number'
		) {
			scoreMap.set(row.user_id, {
				attempted: row.questions_attempted,
				correct: row.questions_correct
			});
		}
	}

	// Always include the viewer (even at 0 points) so they can see their rank —
	// unless they've opted out, in which case the banner shows the toggle strip.
	if (user && showOnLeaderboard && !scoreMap.has(user.id)) {
		scoreMap.set(user.id, { attempted: 0, correct: 0 });
	}

	const entries: GlobalLeaderboardEntry[] = [];
	for (const [userId, stats] of scoreMap) {
		const score = stats.correct * 5 + (stats.attempted - stats.correct);
		const displayName = generateAlias(userId);
		entries.push({
			rank: 0,
			userId,
			displayName,
			firstName: displayName,
			score,
			questionsAnswered: stats.attempted,
			correctAnswers: stats.correct
		});
	}

	// Sort by score descending, correctAnswers as tiebreaker
	entries.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return b.correctAnswers - a.correctAnswers;
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
	const selfIdx = user ? entries.findIndex((e) => e.userId === user.id) : -1;
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

	return {
		leaderboard: filled,
		totalUsers: entries.length,
		showOnLeaderboard
	};
}
