import { error, fail, redirect } from '@sveltejs/kit';
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

interface MistakeEntry {
	word: string;
	expectedForm: string;
	givenAnswer: string;
	case: string;
	number: string;
	sentence?: string;
	drillType?: string;
	correctParadigm?: string;
	userParadigm?: string;
	correctCase?: string;
	userCase?: string | null;
	paradigmCorrect?: boolean;
	caseCorrect?: boolean | null;
	formCorrect?: boolean;
	prompt?: string;
}

interface StudentProgress {
	studentId: string;
	displayName: string | null;
	questionsAttempted: number;
	questionsCorrect: number;
	completedAt: string | null;
	caseScores: CaseAccuracy[];
	mistakes: MistakeEntry[];
}

function parseMistakes(raw: unknown): MistakeEntry[] {
	if (!Array.isArray(raw)) return [];
	const result: MistakeEntry[] = [];
	for (const m of raw) {
		if (
			isRecord(m) &&
			typeof m.word === 'string' &&
			typeof m.expectedForm === 'string' &&
			typeof m.givenAnswer === 'string' &&
			typeof m.case === 'string' &&
			typeof m.number === 'string'
		) {
			const entry: MistakeEntry = {
				word: m.word,
				expectedForm: m.expectedForm,
				givenAnswer: m.givenAnswer,
				case: m.case,
				number: m.number
			};
			if (typeof m.sentence === 'string') entry.sentence = m.sentence;
			if (typeof m.drillType === 'string') entry.drillType = m.drillType;
			if (typeof m.correctParadigm === 'string') entry.correctParadigm = m.correctParadigm;
			if (typeof m.userParadigm === 'string') entry.userParadigm = m.userParadigm;
			if (typeof m.correctCase === 'string') entry.correctCase = m.correctCase;
			if (typeof m.userCase === 'string') entry.userCase = m.userCase;
			else if (m.userCase === null) entry.userCase = null;
			if (typeof m.paradigmCorrect === 'boolean') entry.paradigmCorrect = m.paradigmCorrect;
			if (typeof m.caseCorrect === 'boolean') entry.caseCorrect = m.caseCorrect;
			else if (m.caseCorrect === null) entry.caseCorrect = null;
			if (typeof m.formCorrect === 'boolean') entry.formCorrect = m.formCorrect;
			if (typeof m.prompt === 'string') entry.prompt = m.prompt;
			result.push(entry);
		}
	}
	return result;
}

function parseCaseScores(caseScoresRaw: unknown, selectedCases: string[]): CaseAccuracy[] {
	// case_scores is stored per number (e.g. "gen_sg", "gen_pl"); aggregate by base case.
	const byBase = new Map<string, { attempts: number; correct: number }>();
	if (isRecord(caseScoresRaw)) {
		for (const key of Object.keys(caseScoresRaw)) {
			const entry = caseScoresRaw[key];
			if (!isScoreEntry(entry)) continue;
			const baseCase = key.split('_')[0] ?? key;
			if (selectedCases.length > 0 && !selectedCases.includes(baseCase)) continue;
			const existing = byBase.get(baseCase) ?? { attempts: 0, correct: 0 };
			existing.attempts += entry.attempts;
			existing.correct += entry.correct;
			byBase.set(baseCase, existing);
		}
	}
	const perCaseScores: CaseAccuracy[] = [];
	for (const [baseCase, data] of byBase) {
		perCaseScores.push({
			case: baseCase,
			attempts: data.attempts,
			correct: data.correct,
			accuracy: data.attempts > 0 ? (data.correct / data.attempts) * 100 : 0
		});
	}
	return perCaseScores;
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
		// Defense-in-depth: explicitly verify the authenticated user owns this
		// class before exposing per-student progress data. The parent layout
		// already sets `role` based on teacher_id, but re-checking here guards
		// against any future parent-layout regressions.
		const user = locals.user;
		if (!user || classData.teacher_id !== user.id) {
			error(403, 'You do not have access to this assignment.');
		}

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

		// Fetch assignment progress (includes per-assignment case_scores)
		const progressMap = new Map<
			string,
			{
				questionsAttempted: number;
				questionsCorrect: number;
				completedAt: string | null;
				caseScores: CaseAccuracy[];
				mistakes: MistakeEntry[];
			}
		>();
		if (studentIds.length > 0) {
			const { data: progressData } = await supabase
				.from('assignment_progress')
				.select(
					'student_id, questions_attempted, questions_correct, completed_at, mistakes, case_scores'
				)
				.eq('assignment_id', assignmentId)
				.in('student_id', studentIds);

			if (Array.isArray(progressData)) {
				for (const p of progressData) {
					if (isRecord(p) && typeof p.student_id === 'string') {
						progressMap.set(p.student_id, {
							questionsAttempted:
								typeof p.questions_attempted === 'number' ? p.questions_attempted : 0,
							questionsCorrect: typeof p.questions_correct === 'number' ? p.questions_correct : 0,
							completedAt: typeof p.completed_at === 'string' ? p.completed_at : null,
							caseScores: parseCaseScores(p.case_scores, assignment.selectedCases),
							mistakes: parseMistakes(p.mistakes)
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
				caseScores: prog?.caseScores ?? [],
				mistakes: prog?.mistakes ?? []
			});
		}
	} else {
		// Student: fetch own progress only
		const user = locals.user;
		if (user) {
			const { data: ownProgress } = await supabase
				.from('assignment_progress')
				.select(
					'student_id, questions_attempted, questions_correct, completed_at, mistakes, case_scores'
				)
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
					caseScores: parseCaseScores(ownProgress.case_scores, assignment.selectedCases),
					mistakes: parseMistakes(ownProgress.mistakes)
				});
			}
		}
	}

	return { assignment, studentProgress, role };
};

export const actions: Actions = {
	duplicate: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;
		const assignmentId = params.assignmentId;

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
			return fail(403, { message: 'Only the teacher can duplicate assignments.' });
		}

		// Fetch the original assignment
		const { data: original, error: fetchError } = await supabase
			.from('assignments')
			.select(
				'title, description, selected_cases, selected_drill_types, number_mode, content_mode, target_questions'
			)
			.eq('id', assignmentId)
			.eq('class_id', classId)
			.single();

		if (fetchError || !isRecord(original) || typeof original.title !== 'string') {
			return fail(404, { message: 'Assignment not found.' });
		}

		const { data: newAssignment, error: insertError } = await supabase
			.from('assignments')
			.insert({
				class_id: classId,
				title: `Copy of ${original.title}`,
				description: typeof original.description === 'string' ? original.description : null,
				selected_cases: Array.isArray(original.selected_cases) ? original.selected_cases : [],
				selected_drill_types: Array.isArray(original.selected_drill_types)
					? original.selected_drill_types
					: [],
				number_mode: typeof original.number_mode === 'string' ? original.number_mode : 'both',
				content_mode: typeof original.content_mode === 'string' ? original.content_mode : 'both',
				target_questions:
					typeof original.target_questions === 'number' ? original.target_questions : 20,
				due_date: null
			})
			.select('id')
			.single();

		if (insertError || !newAssignment || typeof newAssignment.id !== 'string') {
			return fail(500, { message: 'Failed to duplicate assignment.' });
		}

		// Pass ?from=<originalId> so the edit page's back link returns to the
		// original assignment the teacher duplicated from rather than the new copy.
		redirect(
			303,
			`${resolve(`/classes/${classId}/assignments/${newAssignment.id}/edit`)}?from=${assignmentId}`
		);
	},

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

		// assignment_progress rows cascade via the ON DELETE CASCADE FK (migration 005)
		const { error: deleteError } = await supabase
			.from('assignments')
			.delete()
			.eq('id', assignmentId)
			.eq('class_id', classId);

		if (deleteError) {
			return fail(500, { message: 'Failed to delete assignment.' });
		}

		redirect(303, resolve(`/classes/${classId}`));
	},

	retry: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;
		const assignmentId = params.assignmentId;

		// Verify student is a member of this class
		const { data: membership } = await supabase
			.from('class_memberships')
			.select('id')
			.eq('class_id', classId)
			.eq('student_id', user.id)
			.maybeSingle();

		if (!membership) {
			return fail(403, { message: 'You are not a member of this class.' });
		}

		// Reset assignment progress
		const { error: resetError } = await supabase
			.from('assignment_progress')
			.update({
				questions_attempted: 0,
				questions_correct: 0,
				completed_at: null,
				mistakes: [],
				case_scores: {},
				updated_at: new Date().toISOString()
			})
			.eq('assignment_id', assignmentId)
			.eq('student_id', user.id);

		if (resetError) {
			return fail(500, { message: 'Failed to reset assignment progress.' });
		}

		redirect(303, `${resolve('/')}?assignment=${assignmentId}`);
	}
};
