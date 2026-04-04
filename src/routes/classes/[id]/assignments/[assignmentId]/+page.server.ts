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

interface AssignmentDetail {
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
}

interface CaseAccuracy {
	case: string;
	attempts: number;
	correct: number;
	accuracy: number;
}

interface ScoreEntry {
	attempts: number;
	correct: number;
}

function isScoreEntry(v: unknown): v is ScoreEntry {
	return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
}

interface StudentProgress {
	studentId: string;
	displayName: string | null;
	questionsAttempted: number;
	questionsCorrect: number;
	completedAt: string | null;
	caseScores: CaseAccuracy[];
}

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { classData, role } = await parent();
	const supabase = locals.supabase;
	const assignmentId = params.assignmentId;

	const { data: assignmentData, error: assignmentError } = await supabase
		.from('assignments')
		.select(
			'id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, target_questions, due_date, created_at'
		)
		.eq('id', assignmentId)
		.eq('class_id', classData.id)
		.maybeSingle();

	if (assignmentError || !isRecord(assignmentData) || typeof assignmentData.id !== 'string') {
		return { assignment: null, studentProgress: [], role };
	}

	const assignment: AssignmentDetail = {
		id: assignmentData.id,
		title: typeof assignmentData.title === 'string' ? assignmentData.title : '',
		description: typeof assignmentData.description === 'string' ? assignmentData.description : null,
		selectedCases: toStringArray(assignmentData.selected_cases),
		selectedDrillTypes: toStringArray(assignmentData.selected_drill_types),
		numberMode:
			typeof assignmentData.number_mode === 'string' ? assignmentData.number_mode : 'both',
		contentMode:
			typeof assignmentData.content_mode === 'string' ? assignmentData.content_mode : 'both',
		targetQuestions:
			typeof assignmentData.target_questions === 'number' ? assignmentData.target_questions : 20,
		dueDate: typeof assignmentData.due_date === 'string' ? assignmentData.due_date : null,
		createdAt: typeof assignmentData.created_at === 'string' ? assignmentData.created_at : ''
	};

	// Fetch per-student progress
	const studentProgress: StudentProgress[] = [];

	if (role === 'teacher') {
		// Fetch all students in the class
		const { data: memberships } = await supabase
			.from('class_memberships')
			.select('student_id')
			.eq('class_id', classData.id);

		const studentIds: string[] = [];
		if (Array.isArray(memberships)) {
			for (const m of memberships) {
				if (isRecord(m) && typeof m.student_id === 'string') {
					studentIds.push(m.student_id);
				}
			}
		}

		// Fetch display names using admin client (RLS prevents teacher from reading student profiles)
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
		const adminClient =
			supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

		const profileMap = new Map<string, string | null>();
		if (studentIds.length > 0) {
			const client = adminClient ?? supabase;
			const { data: profiles } = await client
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

		// Fetch case_scores for students (using admin client for RLS bypass)
		const studentCaseScoresMap = new Map<string, CaseAccuracy[]>();
		if (adminClient && studentIds.length > 0) {
			const { data: userProgressData } = await adminClient
				.from('user_progress')
				.select('user_id, case_scores')
				.in('user_id', studentIds);

			if (Array.isArray(userProgressData)) {
				for (const up of userProgressData) {
					if (isRecord(up) && typeof up.user_id === 'string') {
						const caseScoresRaw = up.case_scores;
						const perCaseScores: CaseAccuracy[] = [];
						if (isRecord(caseScoresRaw)) {
							for (const key of Object.keys(caseScoresRaw)) {
								// Only include cases relevant to this assignment
								if (
									assignment.selectedCases.length > 0 &&
									!assignment.selectedCases.includes(key)
								) {
									continue;
								}
								const entry = caseScoresRaw[key];
								if (isScoreEntry(entry)) {
									perCaseScores.push({
										case: key,
										attempts: entry.attempts,
										correct: entry.correct,
										accuracy: entry.attempts > 0 ? (entry.correct / entry.attempts) * 100 : 0
									});
								}
							}
						}
						studentCaseScoresMap.set(up.user_id, perCaseScores);
					}
				}
			}
		}

		// Fetch assignment progress
		const progressMap = new Map<
			string,
			{ questionsAttempted: number; questionsCorrect: number; completedAt: string | null }
		>();
		if (studentIds.length > 0) {
			const { data: progressData } = await supabase
				.from('assignment_progress')
				.select('student_id, questions_attempted, questions_correct, completed_at')
				.eq('assignment_id', assignmentId)
				.in('student_id', studentIds);

			if (Array.isArray(progressData)) {
				for (const p of progressData) {
					if (isRecord(p) && typeof p.student_id === 'string') {
						progressMap.set(p.student_id, {
							questionsAttempted:
								typeof p.questions_attempted === 'number' ? p.questions_attempted : 0,
							questionsCorrect: typeof p.questions_correct === 'number' ? p.questions_correct : 0,
							completedAt: typeof p.completed_at === 'string' ? p.completed_at : null
						});
					}
				}
			}
		}

		for (const sid of studentIds) {
			const prog = progressMap.get(sid);
			studentProgress.push({
				studentId: sid,
				displayName: profileMap.get(sid) ?? null,
				questionsAttempted: prog?.questionsAttempted ?? 0,
				questionsCorrect: prog?.questionsCorrect ?? 0,
				completedAt: prog?.completedAt ?? null,
				caseScores: studentCaseScoresMap.get(sid) ?? []
			});
		}
	} else {
		// Student: fetch own progress only
		const user = locals.user;
		if (user) {
			const { data: ownProgress } = await supabase
				.from('assignment_progress')
				.select('student_id, questions_attempted, questions_correct, completed_at')
				.eq('assignment_id', assignmentId)
				.eq('student_id', user.id)
				.maybeSingle();

			if (isRecord(ownProgress) && typeof ownProgress.student_id === 'string') {
				studentProgress.push({
					studentId: ownProgress.student_id,
					displayName: null,
					questionsAttempted:
						typeof ownProgress.questions_attempted === 'number'
							? ownProgress.questions_attempted
							: 0,
					questionsCorrect:
						typeof ownProgress.questions_correct === 'number' ? ownProgress.questions_correct : 0,
					completedAt:
						typeof ownProgress.completed_at === 'string' ? ownProgress.completed_at : null,
					caseScores: []
				});
			}
		}
	}

	return { assignment, studentProgress, role };
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;
		const assignmentId = params.assignmentId;

		// Verify user is the teacher of this class
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
			return fail(403, { message: 'Only the teacher can delete assignments.' });
		}

		// Delete assignment progress first (foreign key constraint)
		await supabase.from('assignment_progress').delete().eq('assignment_id', assignmentId);

		// Delete the assignment
		const { error: deleteError } = await supabase
			.from('assignments')
			.delete()
			.eq('id', assignmentId)
			.eq('class_id', classId);

		if (deleteError) {
			return fail(500, { message: 'Failed to delete assignment.' });
		}

		redirect(303, resolve(`/classes/${classId}`));
	}
};
