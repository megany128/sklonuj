import { fail, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

interface ClassRow {
	id: string;
	name: string;
	class_code: string;
	level: string;
	archived: boolean;
	created_at: string;
}

interface MembershipRow {
	class_id: string;
	joined_at: string;
	classes: ClassRow;
}

interface AssignmentRow {
	id: string;
	classId: string;
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

interface AssignmentProgressRow {
	assignmentId: string;
	questionsAttempted: number;
	questionsCorrect: number;
	completedAt: string | null;
}

interface ScoreEntry {
	attempts: number;
	correct: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isClassRow(v: unknown): v is ClassRow {
	if (!isRecord(v)) return false;
	return (
		typeof v.id === 'string' &&
		typeof v.name === 'string' &&
		typeof v.class_code === 'string' &&
		typeof v.level === 'string' &&
		typeof v.archived === 'boolean' &&
		typeof v.created_at === 'string'
	);
}

function isMembershipRow(v: unknown): v is MembershipRow {
	if (!isRecord(v)) return false;
	return typeof v.class_id === 'string' && typeof v.joined_at === 'string' && isClassRow(v.classes);
}

function isScoreEntry(v: unknown): v is ScoreEntry {
	return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
}

function toStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((item): item is string => typeof item === 'string');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) {
		return {
			teacherClasses: [],
			studentClasses: [],
			studentAssignments: [],
			studentProgress: []
		};
	}

	const supabase = locals.supabase;

	const [teacherResult, studentResult] = await Promise.all([
		supabase
			.from('classes')
			.select('id, name, class_code, level, archived, created_at')
			.eq('teacher_id', user.id)
			.eq('archived', false)
			.order('created_at', { ascending: false }),
		supabase
			.from('class_memberships')
			.select('class_id, joined_at, classes(id, name, class_code, level, archived, created_at)')
			.eq('student_id', user.id)
	]);

	const teacherClasses: ClassRow[] = [];
	if (!teacherResult.error && Array.isArray(teacherResult.data)) {
		for (const row of teacherResult.data) {
			if (isClassRow(row)) {
				teacherClasses.push(row);
			}
		}
	}

	// For teacher classes, fetch student counts, assignment counts, and accuracy stats
	const teacherClassesWithCounts: Array<
		ClassRow & {
			studentCount: number;
			assignmentCount: number;
			avgAccuracy: number | null;
			studentsBelowThreshold: number;
		}
	> = [];
	if (teacherClasses.length > 0) {
		const classIds = teacherClasses.map((c) => c.id);
		const [{ data: countData }, { data: assignmentCountData }] = await Promise.all([
			supabase.from('class_memberships').select('class_id, student_id').in('class_id', classIds),
			supabase.from('assignments').select('id, class_id').in('class_id', classIds)
		]);

		// Build a map of class_id -> student_id[] and count students per class
		const studentCountMap = new Map<string, number>();
		const classStudentMap = new Map<string, string[]>();
		if (Array.isArray(countData)) {
			for (const row of countData) {
				if (
					isRecord(row) &&
					typeof row.class_id === 'string' &&
					typeof row.student_id === 'string'
				) {
					studentCountMap.set(row.class_id, (studentCountMap.get(row.class_id) ?? 0) + 1);
					const existing = classStudentMap.get(row.class_id) ?? [];
					existing.push(row.student_id);
					classStudentMap.set(row.class_id, existing);
				}
			}
		}

		const assignmentCountMap = new Map<string, number>();
		if (Array.isArray(assignmentCountData)) {
			for (const row of assignmentCountData) {
				if (isRecord(row) && typeof row.class_id === 'string') {
					assignmentCountMap.set(row.class_id, (assignmentCountMap.get(row.class_id) ?? 0) + 1);
				}
			}
		}

		// Collect all unique student IDs across all teacher classes
		const allStudentIds = new Set<string>();
		for (const [, ids] of classStudentMap) {
			for (const id of ids) {
				allStudentIds.add(id);
			}
		}

		// Fetch user_progress for all students using admin client (RLS prevents teacher from reading)
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
		const adminClient =
			supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

		// Map of student_id -> overall accuracy (0-100) or null
		const studentAccuracyMap = new Map<string, number | null>();
		if (adminClient && allStudentIds.size > 0) {
			const { data: userProgressData } = await adminClient
				.from('user_progress')
				.select('user_id, case_scores')
				.in('user_id', Array.from(allStudentIds));

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
						studentAccuracyMap.set(
							up.user_id,
							totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : null
						);
					}
				}
			}
		}

		for (const cls of teacherClasses) {
			const classStudents = classStudentMap.get(cls.id) ?? [];
			let accuracySum = 0;
			let accuracyCount = 0;
			let belowThreshold = 0;

			for (const sid of classStudents) {
				const accuracy = studentAccuracyMap.get(sid);
				if (accuracy !== undefined && accuracy !== null) {
					accuracySum += accuracy;
					accuracyCount++;
					if (accuracy < 50) {
						belowThreshold++;
					}
				}
			}

			teacherClassesWithCounts.push({
				...cls,
				studentCount: studentCountMap.get(cls.id) ?? 0,
				assignmentCount: assignmentCountMap.get(cls.id) ?? 0,
				avgAccuracy: accuracyCount > 0 ? Math.round(accuracySum / accuracyCount) : null,
				studentsBelowThreshold: belowThreshold
			});
		}
	}

	const studentClasses: Array<{ classId: string; joinedAt: string; classInfo: ClassRow }> = [];
	if (!studentResult.error && Array.isArray(studentResult.data)) {
		for (const row of studentResult.data) {
			if (isMembershipRow(row) && !row.classes.archived) {
				studentClasses.push({
					classId: row.class_id,
					joinedAt: row.joined_at,
					classInfo: row.classes
				});
			}
		}
	}

	// For student classes, fetch assignments and progress
	const studentAssignments: AssignmentRow[] = [];
	const studentProgressList: AssignmentProgressRow[] = [];

	if (studentClasses.length > 0) {
		const studentClassIds = studentClasses.map((c) => c.classId);

		const { data: assignmentData } = await supabase
			.from('assignments')
			.select(
				'id, class_id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, target_questions, due_date, created_at'
			)
			.in('class_id', studentClassIds)
			.order('created_at', { ascending: false });

		if (Array.isArray(assignmentData)) {
			for (const a of assignmentData) {
				if (isRecord(a) && typeof a.id === 'string' && typeof a.title === 'string') {
					studentAssignments.push({
						id: a.id,
						classId: typeof a.class_id === 'string' ? a.class_id : '',
						title: a.title,
						description: typeof a.description === 'string' ? a.description : null,
						selectedCases: toStringArray(a.selected_cases),
						selectedDrillTypes: toStringArray(a.selected_drill_types),
						numberMode: typeof a.number_mode === 'string' ? a.number_mode : 'both',
						contentMode: typeof a.content_mode === 'string' ? a.content_mode : 'both',
						targetQuestions: typeof a.target_questions === 'number' ? a.target_questions : 20,
						dueDate: typeof a.due_date === 'string' ? a.due_date : null,
						createdAt: typeof a.created_at === 'string' ? a.created_at : ''
					});
				}
			}
		}

		// Fetch student's own progress for these assignments
		if (studentAssignments.length > 0) {
			const assignmentIds = studentAssignments.map((a) => a.id);
			const { data: progressData } = await supabase
				.from('assignment_progress')
				.select('assignment_id, questions_attempted, questions_correct, completed_at')
				.eq('student_id', user.id)
				.in('assignment_id', assignmentIds);

			if (Array.isArray(progressData)) {
				for (const p of progressData) {
					if (isRecord(p) && typeof p.assignment_id === 'string') {
						studentProgressList.push({
							assignmentId: p.assignment_id,
							questionsAttempted:
								typeof p.questions_attempted === 'number' ? p.questions_attempted : 0,
							questionsCorrect: typeof p.questions_correct === 'number' ? p.questions_correct : 0,
							completedAt: typeof p.completed_at === 'string' ? p.completed_at : null
						});
					}
				}
			}
		}
	}

	// Fetch archived classes for teachers (always check, even if no active classes)
	const archivedClasses: ClassRow[] = [];
	const { data: archivedData } = await supabase
		.from('classes')
		.select('id, name, class_code, level, archived, created_at')
		.eq('teacher_id', user.id)
		.eq('archived', true)
		.order('created_at', { ascending: false });

	if (Array.isArray(archivedData)) {
		for (const row of archivedData) {
			if (isClassRow(row)) {
				archivedClasses.push(row);
			}
		}
	}

	// For multi-class students, compute assignment summary per class
	const studentClassSummaryList: Array<{
		classId: string;
		pendingCount: number;
		overdueCount: number;
		nextDueDate: string | null;
	}> = [];
	if (studentClasses.length > 0) {
		const now = new Date();
		for (const sc of studentClasses) {
			const classAssignments = studentAssignments.filter((a) => a.classId === sc.classId);
			let pendingCount = 0;
			let overdueCount = 0;
			let nextDueDate: string | null = null;

			for (const a of classAssignments) {
				const prog = studentProgressList.find((p) => p.assignmentId === a.id);
				if (prog?.completedAt) continue;

				pendingCount++;
				if (a.dueDate) {
					const due = new Date(a.dueDate);
					if (due < now) {
						overdueCount++;
					}
					if (!nextDueDate || due < new Date(nextDueDate)) {
						nextDueDate = a.dueDate;
					}
				}
			}
			studentClassSummaryList.push({
				classId: sc.classId,
				pendingCount,
				overdueCount,
				nextDueDate
			});
		}
	}

	// Auto-redirect students enrolled in exactly one class straight to that class page
	if (
		teacherClassesWithCounts.length === 0 &&
		archivedClasses.length === 0 &&
		studentClasses.length === 1
	) {
		// Skip redirect when special query params are present (e.g. ?joined welcome modal)
		const hasSpecialParams = url.searchParams.has('joined');
		if (!hasSpecialParams) {
			redirect(302, `/classes/${studentClasses[0].classId}`);
		}
	}

	return {
		teacherClasses: teacherClassesWithCounts,
		archivedClasses,
		studentClasses,
		studentAssignments,
		studentProgress: studentProgressList,
		studentClassSummaries: studentClassSummaryList
	};
};

export const actions: Actions = {
	saveName: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const raw = formData.get('display_name');
		const name = typeof raw === 'string' ? raw.trim().slice(0, 50) : '';

		if (name.length === 0) {
			return fail(400, { message: 'Please enter a name.' });
		}

		// Upsert (rather than update) so this still works if the profile row is missing
		// for any reason — e.g. the auth.handle_new_user trigger didn't fire.
		const { error } = await locals.supabase
			.from('profiles')
			.upsert({ id: user.id, display_name: name }, { onConflict: 'id' });

		if (error) return fail(500, { message: 'Failed to save name.' });

		return { nameSuccess: true };
	}
};
