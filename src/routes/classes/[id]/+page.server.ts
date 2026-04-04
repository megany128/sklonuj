import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((item): item is string => typeof item === 'string');
}

interface ScoreEntry {
	attempts: number;
	correct: number;
}

function isScoreEntry(v: unknown): v is ScoreEntry {
	return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
}

interface AssignmentStatus {
	assignmentId: string;
	assignmentTitle: string;
	attempted: number;
	target: number;
	correct: number;
	completed: boolean;
}

interface StudentRow {
	studentId: string;
	displayName: string | null;
	email: string | null;
	joinedAt: string;
	overallAccuracy: number | null;
	totalAttempts: number;
	assignmentStatuses: AssignmentStatus[];
}

interface AssignmentRow {
	id: string;
	title: string;
	description: string | null;
	selectedCases: string[];
	selectedDrillTypes: string[];
	numberMode: string;
	contentMode: string;
	targetQuestions: number;
	dueDate: string | null;
	createdAt: string;
	completedCount: number;
	totalStudents: number;
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classData, role } = await parent();
	const supabase = locals.supabase;

	// Create admin client for fetching emails and cross-user data
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	const adminClient =
		supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

	// Fetch student roster
	const { data: memberships } = await supabase
		.from('class_memberships')
		.select('student_id, joined_at')
		.eq('class_id', classData.id)
		.order('joined_at', { ascending: true });

	const studentIds: string[] = [];
	if (Array.isArray(memberships)) {
		for (const m of memberships) {
			if (isRecord(m) && typeof m.student_id === 'string') {
				studentIds.push(m.student_id);
			}
		}
	}

	// Fetch display names from profiles using admin client (RLS prevents teacher from reading student profiles)
	const profileMap = new Map<string, string | null>();
	if (adminClient && studentIds.length > 0) {
		const { data: profiles } = await adminClient
			.from('profiles')
			.select('id, display_name')
			.in('id', studentIds);

		if (Array.isArray(profiles)) {
			for (const p of profiles) {
				if (isRecord(p) && typeof p.id === 'string') {
					profileMap.set(p.id, typeof p.display_name === 'string' ? p.display_name : null);
				}
			}
		}
	}

	// Fetch emails for all students via admin auth API in a single batch call
	const emailMap = new Map<string, string | null>();
	if (adminClient && studentIds.length > 0) {
		const studentIdSet = new Set(studentIds);
		// Fetch users in pages of 50 until we have all student emails
		let page = 1;
		const perPage = 50;
		let fetched = 0;
		while (fetched < studentIds.length) {
			const { data: listData } = await adminClient.auth.admin.listUsers({
				page,
				perPage
			});
			if (!listData || !Array.isArray(listData.users) || listData.users.length === 0) {
				break;
			}
			for (const user of listData.users) {
				if (isRecord(user) && typeof user.id === 'string' && studentIdSet.has(user.id)) {
					emailMap.set(user.id, typeof user.email === 'string' ? user.email : null);
					fetched++;
				}
			}
			// If this page had fewer results than perPage, we've reached the end
			if (listData.users.length < perPage) {
				break;
			}
			page++;
		}
	}

	// Fetch assignments
	const { data: assignmentData } = await supabase
		.from('assignments')
		.select(
			'id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, target_questions, due_date, created_at'
		)
		.eq('class_id', classData.id)
		.order('created_at', { ascending: false });

	const assignmentIds: string[] = [];
	const assignmentTitleMap = new Map<string, string>();
	const assignmentTargetMap = new Map<string, number>();
	if (Array.isArray(assignmentData)) {
		for (const a of assignmentData) {
			if (isRecord(a) && typeof a.id === 'string' && typeof a.title === 'string') {
				assignmentIds.push(a.id);
				assignmentTitleMap.set(a.id, a.title);
				assignmentTargetMap.set(
					a.id,
					typeof a.target_questions === 'number' ? a.target_questions : 20
				);
			}
		}
	}

	// Fetch assignment progress for all students in this class
	const progressByStudentAssignment = new Map<string, Map<string, AssignmentStatus>>();
	if (assignmentIds.length > 0) {
		const { data: progressData } = await supabase
			.from('assignment_progress')
			.select('assignment_id, student_id, questions_attempted, questions_correct, completed_at')
			.in('assignment_id', assignmentIds);

		if (Array.isArray(progressData)) {
			for (const p of progressData) {
				if (
					isRecord(p) &&
					typeof p.assignment_id === 'string' &&
					typeof p.student_id === 'string'
				) {
					let studentMap = progressByStudentAssignment.get(p.student_id);
					if (!studentMap) {
						studentMap = new Map<string, AssignmentStatus>();
						progressByStudentAssignment.set(p.student_id, studentMap);
					}
					studentMap.set(p.assignment_id, {
						assignmentId: p.assignment_id,
						assignmentTitle: assignmentTitleMap.get(p.assignment_id) ?? 'Unknown',
						attempted: typeof p.questions_attempted === 'number' ? p.questions_attempted : 0,
						target: assignmentTargetMap.get(p.assignment_id) ?? 20,
						correct: typeof p.questions_correct === 'number' ? p.questions_correct : 0,
						completed: p.completed_at !== null && p.completed_at !== undefined
					});
				}
			}
		}
	}

	// Fetch user_progress (case_scores) for each student using admin client
	// (RLS prevents teacher from reading other users' progress)
	const userProgressMap = new Map<
		string,
		{ overallAccuracy: number | null; totalAttempts: number }
	>();
	if (adminClient && studentIds.length > 0) {
		const { data: userProgressData } = await adminClient
			.from('user_progress')
			.select('user_id, case_scores')
			.in('user_id', studentIds);

		if (Array.isArray(userProgressData)) {
			for (const up of userProgressData) {
				if (isRecord(up) && typeof up.user_id === 'string') {
					const caseScores = up.case_scores;
					let totalAttempts = 0;
					let totalCorrect = 0;
					if (isRecord(caseScores)) {
						for (const key of Object.keys(caseScores)) {
							const entry = caseScores[key];
							if (isScoreEntry(entry)) {
								totalAttempts += entry.attempts;
								totalCorrect += entry.correct;
							}
						}
					}
					userProgressMap.set(up.user_id, {
						overallAccuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : null,
						totalAttempts
					});
				}
			}
		}
	}

	// Build student rows
	const students: StudentRow[] = [];
	if (Array.isArray(memberships)) {
		for (const m of memberships) {
			if (isRecord(m) && typeof m.student_id === 'string' && typeof m.joined_at === 'string') {
				const sid = m.student_id;
				const progress = userProgressMap.get(sid);
				const studentAssignmentMap = progressByStudentAssignment.get(sid);

				// Build assignment statuses for all assignments (including ones not started)
				const assignmentStatuses: AssignmentStatus[] = [];
				for (const aId of assignmentIds) {
					const existing = studentAssignmentMap?.get(aId);
					if (existing) {
						assignmentStatuses.push(existing);
					} else {
						assignmentStatuses.push({
							assignmentId: aId,
							assignmentTitle: assignmentTitleMap.get(aId) ?? 'Unknown',
							attempted: 0,
							target: assignmentTargetMap.get(aId) ?? 20,
							correct: 0,
							completed: false
						});
					}
				}

				students.push({
					studentId: sid,
					displayName: profileMap.get(sid) ?? null,
					email: emailMap.get(sid) ?? null,
					joinedAt: m.joined_at,
					overallAccuracy: progress?.overallAccuracy ?? null,
					totalAttempts: progress?.totalAttempts ?? 0,
					assignmentStatuses
				});
			}
		}
	}

	// Build assignments list with completion counts
	const completionMap = new Map<string, number>();
	for (const [, studentMap] of progressByStudentAssignment) {
		for (const [aId, status] of studentMap) {
			if (status.completed) {
				completionMap.set(aId, (completionMap.get(aId) ?? 0) + 1);
			}
		}
	}

	const totalStudents = students.length;
	const assignments: AssignmentRow[] = [];
	if (Array.isArray(assignmentData)) {
		for (const a of assignmentData) {
			if (isRecord(a) && typeof a.id === 'string' && typeof a.title === 'string') {
				assignments.push({
					id: a.id,
					title: a.title,
					description: typeof a.description === 'string' ? a.description : null,
					selectedCases: toStringArray(a.selected_cases),
					selectedDrillTypes: toStringArray(a.selected_drill_types),
					numberMode: typeof a.number_mode === 'string' ? a.number_mode : 'both',
					contentMode: typeof a.content_mode === 'string' ? a.content_mode : 'both',
					targetQuestions: typeof a.target_questions === 'number' ? a.target_questions : 20,
					dueDate: typeof a.due_date === 'string' ? a.due_date : null,
					createdAt: typeof a.created_at === 'string' ? a.created_at : '',
					completedCount: completionMap.get(a.id) ?? 0,
					totalStudents
				});
			}
		}
	}

	// Build leaderboard: ranked by accuracy (min 5 attempts to qualify), then by total attempts
	interface LeaderboardEntry {
		studentId: string;
		displayName: string | null;
		accuracy: number | null;
		totalAttempts: number;
		rank: number;
	}

	const leaderboard: LeaderboardEntry[] = students
		.map((s) => ({
			studentId: s.studentId,
			displayName: s.displayName,
			accuracy: s.overallAccuracy,
			totalAttempts: s.totalAttempts,
			rank: 0
		}))
		.sort((a, b) => {
			// Students with data rank higher than those without
			if (a.accuracy !== null && b.accuracy === null) return -1;
			if (a.accuracy === null && b.accuracy !== null) return 1;
			if (a.accuracy !== null && b.accuracy !== null) {
				if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
			}
			return b.totalAttempts - a.totalAttempts;
		});

	for (let i = 0; i < leaderboard.length; i++) {
		leaderboard[i].rank = i + 1;
	}

	return { students, assignments, role, leaderboard };
};

export const actions: Actions = {
	archive: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can archive this class.' });
		}

		const { error: archiveError } = await supabase
			.from('classes')
			.update({ archived: true })
			.eq('id', classId);

		if (archiveError) {
			return fail(500, { message: 'Failed to archive class.' });
		}

		redirect(303, resolve('/classes'));
	},

	unarchive: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can unarchive this class.' });
		}

		const { error: unarchiveError } = await supabase
			.from('classes')
			.update({ archived: false })
			.eq('id', classId);

		if (unarchiveError) {
			return fail(500, { message: 'Failed to unarchive class.' });
		}

		return { success: true, action: 'unarchived' };
	},

	removeStudent: async ({ request, locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const studentId = (formData.get('studentId') ?? '').toString();

		if (!studentId) {
			return fail(400, { message: 'Student ID is required.' });
		}

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can remove students.' });
		}

		const { error: removeError } = await supabase
			.from('class_memberships')
			.delete()
			.eq('class_id', classId)
			.eq('student_id', studentId);

		if (removeError) {
			return fail(500, { message: 'Failed to remove student.' });
		}

		return { success: true, action: 'removed' };
	}
};
