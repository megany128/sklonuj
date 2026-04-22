import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

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

/** Returns the Monday of the current week as a YYYY-MM-DD string. */
function getCurrentWeekMonday(): string {
	const now = new Date();
	const day = now.getDay();
	const diff = day === 0 ? 6 : day - 1;
	const monday = new Date(now);
	monday.setDate(now.getDate() - diff);
	const y = monday.getFullYear();
	const m = String(monday.getMonth() + 1).padStart(2, '0');
	const d = String(monday.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Returns the Sunday ending the current week as a date string. */
function getCurrentWeekSundayEnd(): string {
	const now = new Date();
	const day = now.getDay();
	const daysUntilSunday = day === 0 ? 0 : 7 - day;
	const sunday = new Date(now);
	sunday.setDate(now.getDate() + daysUntilSunday);
	return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
}

interface LeaderboardEntry {
	rank: number;
	userId: string;
	displayName: string;
	firstName: string;
	score: number;
	questionsAnswered: number;
	correctAnswers: number;
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		console.error(
			'/api/leaderboard/global: SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL is not configured'
		);
		return json({ error: 'Leaderboard service is not configured' }, { status: 500 });
	}
	const aggClient = createClient(supabaseUrl, serviceRoleKey);

	// Check current user's visibility preference (anon users default to true)
	let showOnLeaderboard = true;
	if (user) {
		const { data: myProfileData } = await aggClient
			.from('profiles')
			.select('show_on_leaderboard')
			.eq('id', user.id)
			.single();

		showOnLeaderboard =
			isRecord(myProfileData) && typeof myProfileData.show_on_leaderboard === 'boolean'
				? myProfileData.show_on_leaderboard
				: true;
	}

	// Get all users who opted in
	const { data: profilesData, error: profilesError } = await aggClient
		.from('profiles')
		.select('id, display_name, show_on_leaderboard')
		.eq('show_on_leaderboard', true);

	if (profilesError || !Array.isArray(profilesData)) {
		return json({ error: 'Failed to fetch profiles' }, { status: 500 });
	}

	const nameMap = new Map<string, string>();
	const optedInIds: string[] = [];
	for (const p of profilesData) {
		if (isRecord(p) && typeof p.id === 'string') {
			nameMap.set(p.id, generateAlias(p.id));
			optedInIds.push(p.id);
		}
	}

	if (optedInIds.length === 0) {
		return json({ leaderboard: [], totalUsers: 0, showOnLeaderboard });
	}

	// Get practice sessions for the current week
	const weekMonday = getCurrentWeekMonday();
	const weekSundayEnd = getCurrentWeekSundayEnd();

	const scoreMap = new Map<string, { attempted: number; correct: number }>();
	for (const id of optedInIds) {
		scoreMap.set(id, { attempted: 0, correct: 0 });
	}

	const { data: sessionsData, error: sessionsError } = await aggClient
		.from('practice_sessions')
		.select('user_id, questions_attempted, questions_correct')
		.in('user_id', optedInIds)
		.gte('session_date', weekMonday)
		.lte('session_date', weekSundayEnd);

	if (!sessionsError && Array.isArray(sessionsData)) {
		for (const s of sessionsData) {
			if (
				isRecord(s) &&
				typeof s.user_id === 'string' &&
				typeof s.questions_attempted === 'number' &&
				typeof s.questions_correct === 'number'
			) {
				const existing = scoreMap.get(s.user_id) ?? { attempted: 0, correct: 0 };
				scoreMap.set(s.user_id, {
					attempted: existing.attempted + s.questions_attempted,
					correct: existing.correct + s.questions_correct
				});
			}
		}
	}

	// Build entries
	const entries: LeaderboardEntry[] = [];
	for (const [userId, stats] of scoreMap) {
		const score = stats.correct * 5 + (stats.attempted - stats.correct);
		if (score === 0 && (!user || userId !== user.id)) continue; // Always include self if logged in
		const displayName = nameMap.get(userId) ?? generateAlias(userId);
		const firstName = displayName;
		entries.push({
			rank: 0,
			userId,
			displayName,
			firstName,
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
	const windowed: LeaderboardEntry[] = [];

	const addEntry = (entry: LeaderboardEntry) => {
		if (!seen.has(entry.userId)) {
			seen.add(entry.userId);
			windowed.push(entry);
		}
	};

	// Top 3
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
	const filled: LeaderboardEntry[] = [];
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

	return json({
		leaderboard: filled,
		totalUsers: entries.length,
		showOnLeaderboard
	});
};
