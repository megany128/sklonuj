import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the Monday of the current week as a YYYY-MM-DD string. */
function getCurrentWeekMonday(): string {
	const now = new Date();
	const day = now.getDay(); // 0=Sun, 1=Mon, ...
	const diff = day === 0 ? 6 : day - 1; // days since Monday
	const monday = new Date(now);
	monday.setDate(now.getDate() - diff);
	const y = monday.getFullYear();
	const m = String(monday.getMonth() + 1).padStart(2, '0');
	const d = String(monday.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Returns the Sunday ending the current week as an ISO timestamp. */
function getCurrentWeekSundayEnd(): string {
	const now = new Date();
	const day = now.getDay();
	const daysUntilSunday = day === 0 ? 0 : 7 - day;
	const sunday = new Date(now);
	sunday.setDate(now.getDate() + daysUntilSunday);
	sunday.setHours(23, 59, 59, 999);
	return sunday.toISOString();
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

interface UnreadReaction {
	id: string;
	fromUserId: string;
	fromName: string;
	emoji: string;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const classId = url.searchParams.get('classId');
	if (!classId) {
		return json({ error: 'classId query parameter is required' }, { status: 400 });
	}

	const supabase = locals.supabase;

	// Admin (service-role) client for cross-user aggregation reads. The RLS-bound
	// `supabase` client only lets a student see their own class_memberships /
	// assignment_progress / practice_sessions / profiles row, which would
	// collapse the leaderboard to a single row. We still do all authorization
	// checks via the RLS-bound `supabase` client below before touching the
	// admin client for aggregate reads. Matches the pattern in
	// src/routes/classes/[id]/+page.server.ts.
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		// Fail closed: without the service role key the RLS-bound client would
		// silently collapse the leaderboard to a single row (the caller), which
		// is indistinguishable from a legitimately tiny class and hides the
		// misconfiguration. Surface it explicitly instead.
		console.error(
			'/api/leaderboard: SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL is not configured'
		);
		return json({ error: 'Leaderboard service is not configured' }, { status: 500 });
	}
	const aggClient = createClient(supabaseUrl, serviceRoleKey);

	// Check if user is teacher or student of this class
	const { data: classData, error: classError } = await supabase
		.from('classes')
		.select('id, teacher_id, leaderboard_enabled')
		.eq('id', classId)
		.single();

	if (classError || !isRecord(classData) || typeof classData.id !== 'string') {
		return json({ error: 'Class not found' }, { status: 404 });
	}

	const isTeacher = typeof classData.teacher_id === 'string' && classData.teacher_id === user.id;
	const leaderboardEnabled =
		typeof classData.leaderboard_enabled === 'boolean' ? classData.leaderboard_enabled : true;

	if (!isTeacher) {
		// Verify student membership
		const { data: membershipData, error: membershipError } = await supabase
			.from('class_memberships')
			.select('id')
			.eq('class_id', classId)
			.eq('student_id', user.id)
			.maybeSingle();

		if (membershipError || !membershipData) {
			return json({ error: 'You are not a member of this class' }, { status: 403 });
		}

		if (!leaderboardEnabled) {
			return json({ error: 'Leaderboard is disabled for this class' }, { status: 403 });
		}
	}

	// Get all students in the class
	const { data: membershipsData, error: membershipsError } = await aggClient
		.from('class_memberships')
		.select('student_id')
		.eq('class_id', classId);

	if (membershipsError || !Array.isArray(membershipsData)) {
		return json({ error: 'Failed to fetch class members' }, { status: 500 });
	}

	const studentIds: string[] = [];
	for (const m of membershipsData) {
		if (isRecord(m) && typeof m.student_id === 'string') {
			studentIds.push(m.student_id);
		}
	}

	if (studentIds.length === 0) {
		return json({
			leaderboard: [],
			unreadReactions: [],
			leaderboardEnabled
		});
	}

	// Get all assignments for this class
	const { data: assignmentsData, error: assignmentsError } = await supabase
		.from('assignments')
		.select('id')
		.eq('class_id', classId);

	if (assignmentsError || !Array.isArray(assignmentsData)) {
		return json({ error: 'Failed to fetch assignments' }, { status: 500 });
	}

	const assignmentIds: string[] = [];
	for (const a of assignmentsData) {
		if (isRecord(a) && typeof a.id === 'string') {
			assignmentIds.push(a.id);
		}
	}

	// Calculate week boundaries
	const weekMonday = getCurrentWeekMonday();
	const weekSundayEnd = getCurrentWeekSundayEnd();

	// Fetch assignment_progress for all students in the class, updated this week
	// We need to accumulate per-student scores
	const scoreMap = new Map<string, { attempted: number; correct: number }>();

	// Initialize all students with zero scores so they all appear
	for (const sid of studentIds) {
		scoreMap.set(sid, { attempted: 0, correct: 0 });
	}

	if (assignmentIds.length > 0) {
		const { data: progressData, error: progressError } = await aggClient
			.from('assignment_progress')
			.select('student_id, questions_attempted, questions_correct, updated_at')
			.in('assignment_id', assignmentIds)
			.in('student_id', studentIds)
			.gte('updated_at', `${weekMonday}T00:00:00.000Z`)
			.lte('updated_at', weekSundayEnd);

		if (progressError) {
			return json({ error: 'Failed to fetch progress data' }, { status: 500 });
		}

		if (Array.isArray(progressData)) {
			for (const p of progressData) {
				if (
					isRecord(p) &&
					typeof p.student_id === 'string' &&
					typeof p.questions_attempted === 'number' &&
					typeof p.questions_correct === 'number'
				) {
					const existing = scoreMap.get(p.student_id) ?? { attempted: 0, correct: 0 };
					scoreMap.set(p.student_id, {
						attempted: existing.attempted + p.questions_attempted,
						correct: existing.correct + p.questions_correct
					});
				}
			}
		}
	}

	// Also include practice_sessions data for this week (general practice, not assignment-specific)
	const { data: sessionsData, error: sessionsError } = await aggClient
		.from('practice_sessions')
		.select('user_id, questions_attempted, questions_correct')
		.in('user_id', studentIds)
		.gte('session_date', weekMonday)
		.lte('session_date', weekSundayEnd.slice(0, 10));

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

	// Fetch profiles for display names (admin client — students can't read peer profiles under RLS)
	const { data: profilesData } = await aggClient
		.from('profiles')
		.select('id, display_name')
		.in('id', studentIds);

	const nameMap = new Map<string, string>();
	if (Array.isArray(profilesData)) {
		for (const p of profilesData) {
			if (isRecord(p) && typeof p.id === 'string') {
				const displayName =
					typeof p.display_name === 'string' && p.display_name.length > 0
						? p.display_name
						: 'Student';
				nameMap.set(p.id, displayName);
			}
		}
	}

	// Build leaderboard entries
	const entries: LeaderboardEntry[] = [];
	for (const [userId, stats] of scoreMap) {
		const score = stats.correct * 3 + stats.attempted * 0.1;
		const displayName = nameMap.get(userId) ?? 'Student';
		const firstName = displayName.split(' ')[0];
		entries.push({
			rank: 0, // will be set after sorting
			userId,
			displayName,
			firstName,
			score,
			questionsAnswered: stats.attempted,
			correctAnswers: stats.correct
		});
	}

	// Sort by score descending, then by correct answers descending as tiebreaker
	entries.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return b.correctAnswers - a.correctAnswers;
	});

	// Assign ranks (with ties)
	let currentRank = 1;
	for (let i = 0; i < entries.length; i++) {
		if (i > 0 && entries[i].score < entries[i - 1].score) {
			currentRank = i + 1;
		}
		entries[i].rank = currentRank;
	}

	// Fetch unread reactions for the current user in this class
	const unreadReactions: UnreadReaction[] = [];
	const { data: reactionsData, error: reactionsError } = await supabase
		.from('leaderboard_reactions')
		.select('id, from_user_id, emoji')
		.eq('class_id', classId)
		.eq('to_user_id', user.id)
		.eq('read', false)
		.eq('week_start', weekMonday);

	if (!reactionsError && Array.isArray(reactionsData)) {
		for (const r of reactionsData) {
			if (
				isRecord(r) &&
				typeof r.id === 'string' &&
				typeof r.from_user_id === 'string' &&
				typeof r.emoji === 'string'
			) {
				const fromName = nameMap.get(r.from_user_id) ?? 'Someone';
				unreadReactions.push({
					id: r.id,
					fromUserId: r.from_user_id,
					fromName: fromName.split(' ')[0],
					emoji: r.emoji
				});
			}
		}

		// Mark reactions as read
		if (unreadReactions.length > 0) {
			const reactionIds = unreadReactions.map((r) => r.id);
			await supabase.from('leaderboard_reactions').update({ read: true }).in('id', reactionIds);
		}
	}

	// Fetch reactions the current user has already sent today (to disable buttons)
	const today = new Date().toISOString().slice(0, 10);
	const sentToday: string[] = [];
	const { data: sentData } = await supabase
		.from('leaderboard_reactions')
		.select('to_user_id')
		.eq('class_id', classId)
		.eq('from_user_id', user.id)
		.eq('sent_date', today);

	if (Array.isArray(sentData)) {
		for (const s of sentData) {
			if (isRecord(s) && typeof s.to_user_id === 'string') {
				sentToday.push(s.to_user_id);
			}
		}
	}

	// Students only see a windowed view: top 3 + themselves. Teachers see all.
	// The client (LeaderboardBanner.svelte) re-applies the same windowing with a
	// "…" separator; we window here too so the endpoint never leaks the full
	// roster to students who call it directly.
	let leaderboardToReturn = entries;
	if (!isTeacher) {
		const top = entries.slice(0, 3);
		const windowed: LeaderboardEntry[] = [...top];
		const selfEntry = entries.find((e) => e.userId === user.id);
		if (selfEntry && !top.some((e) => e.userId === selfEntry.userId)) {
			windowed.push(selfEntry);
		}
		leaderboardToReturn = windowed;
	}

	return json({
		leaderboard: leaderboardToReturn,
		unreadReactions,
		sentToday,
		leaderboardEnabled
	});
};
