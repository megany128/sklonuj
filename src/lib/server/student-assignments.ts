// Student-side assignment reads, shared by the JSON API routes
// (/api/student-assignments, GET /api/assignment-progress) and the home page
// server load (which awaits the assignment list so SSR renders the panel at
// its final size, and streams the ?assignment=<id> config).
//
// All queries run through the user-scoped client, so RLS (migration 005) is
// the authorization boundary: students see assignments for classes they are
// members of and only their own assignment_progress rows; teachers see the
// assignments and progress of their own classes.
import type { SupabaseClient } from '@supabase/supabase-js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string');
}

/** Progress fields that `assignment_progress` rows contribute to both shapes below. */
interface ProgressSummary {
	attempted: number;
	correct: number;
	completedAt: string | null;
}

const EMPTY_PROGRESS: ProgressSummary = { attempted: 0, correct: 0, completedAt: null };

function parseProgressRow(row: unknown): ProgressSummary {
	if (!isRecord(row)) return EMPTY_PROGRESS;
	return {
		attempted: typeof row.questions_attempted === 'number' ? row.questions_attempted : 0,
		correct: typeof row.questions_correct === 'number' ? row.questions_correct : 0,
		completedAt: typeof row.completed_at === 'string' ? row.completed_at : null
	};
}

/**
 * A to-many embed comes back as an array (RLS + the student_id filter make it
 * at most one row here); a to-one embed comes back as an object or null.
 */
function firstEmbedded(value: unknown): unknown {
	if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
	return value;
}

export interface StudentAssignment {
	id: string;
	classId: string;
	className: string;
	title: string;
	description: string | null;
	selectedCases: string[];
	selectedDrillTypes: string[];
	numberMode: string;
	contentMode: string;
	includeAdjectives: boolean;
	contentLevel: string | null;
	targetQuestions: number;
	dueDate: string | null;
	attempted: number;
	correct: number;
	completedAt: string | null;
}

export class StudentAssignmentsError extends Error {}

/**
 * Every assignment in a class the user is a student of, with the user's own
 * progress folded in. One PostgREST request: assignments joined to classes
 * (name + the caller's membership row, `!inner` so non-member classes drop
 * out even for a user who also teaches) and to the caller's progress rows.
 *
 * Sorted incomplete-first, then by due date ascending with nulls last;
 * ties keep creation order. Throws `StudentAssignmentsError` on query failure.
 */
export async function loadStudentAssignments(
	supabase: SupabaseClient,
	userId: string
): Promise<StudentAssignment[]> {
	const { data, error } = await supabase
		.from('assignments')
		.select(
			'id, class_id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, content_level, target_questions, due_date, include_adjectives, classes!inner(name, class_memberships!inner(student_id)), assignment_progress(questions_attempted, questions_correct, completed_at)'
		)
		.eq('classes.class_memberships.student_id', userId)
		.eq('assignment_progress.student_id', userId)
		.order('created_at', { ascending: true });

	if (error) {
		throw new StudentAssignmentsError('Failed to fetch assignments');
	}
	if (!Array.isArray(data)) return [];

	const assignments: StudentAssignment[] = [];

	for (const a of data) {
		if (!isRecord(a) || typeof a.id !== 'string' || typeof a.class_id !== 'string') continue;

		const cls = firstEmbedded(a.classes);
		const className = isRecord(cls) && typeof cls.name === 'string' ? cls.name : 'Unknown Class';
		const progress = parseProgressRow(firstEmbedded(a.assignment_progress));

		assignments.push({
			id: a.id,
			classId: a.class_id,
			className,
			title: typeof a.title === 'string' ? a.title : '',
			description: typeof a.description === 'string' ? a.description : null,
			selectedCases: toStringArray(a.selected_cases),
			selectedDrillTypes: toStringArray(a.selected_drill_types),
			numberMode: typeof a.number_mode === 'string' ? a.number_mode : 'both',
			contentMode: typeof a.content_mode === 'string' ? a.content_mode : 'both',
			includeAdjectives: a.include_adjectives === true,
			contentLevel: typeof a.content_level === 'string' ? a.content_level : null,
			targetQuestions: typeof a.target_questions === 'number' ? a.target_questions : 0,
			dueDate: typeof a.due_date === 'string' ? a.due_date : null,
			attempted: progress.attempted,
			correct: progress.correct,
			completedAt: progress.completedAt
		});
	}

	// Sort: incomplete first (by due date ascending, nulls last), then completed
	assignments.sort((a, b) => {
		const aComplete = a.completedAt !== null;
		const bComplete = b.completedAt !== null;
		if (aComplete !== bComplete) return aComplete ? 1 : -1;

		// Both same completion status — sort by due date ascending, nulls last
		if (a.dueDate === null && b.dueDate === null) return 0;
		if (a.dueDate === null) return 1;
		if (b.dueDate === null) return -1;
		return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
	});

	return assignments;
}

/** The JSON body of GET /api/assignment-progress?assignmentId=… */
export interface AssignmentConfig {
	title: string;
	classId: string;
	selectedCases: string[];
	selectedDrillTypes: string[];
	numberMode: string;
	contentMode: string;
	includeAdjectives: boolean;
	contentLevel: string | null;
	targetQuestions: number;
	attempted: number;
	correct: number;
	completedAt: string | null;
	mistakes: unknown[];
}

export type AssignmentConfigResult =
	| { ok: true; config: AssignmentConfig }
	| { ok: false; status: 403 | 404 | 500; error: string };

/**
 * One assignment's drill configuration plus the caller's progress on it, for
 * the practice page's assignment mode. The caller must be the class teacher
 * or a member of the class; anything else is reported with the HTTP status
 * the API route responds with.
 *
 * Two round trips: the assignment with its class embedded, then the
 * membership check (skipped for the teacher) and the progress read together.
 */
export async function loadAssignmentConfig(
	supabase: SupabaseClient,
	userId: string,
	assignmentId: string
): Promise<AssignmentConfigResult> {
	const { data: assignmentData, error: assignmentError } = await supabase
		.from('assignments')
		.select(
			'id, class_id, title, selected_cases, selected_drill_types, number_mode, content_mode, content_level, target_questions, include_adjectives, classes(id, teacher_id)'
		)
		.eq('id', assignmentId)
		.single();

	if (assignmentError || !isRecord(assignmentData) || typeof assignmentData.id !== 'string') {
		return { ok: false, status: 404, error: 'Assignment not found' };
	}

	const classId = assignmentData.class_id;
	if (typeof classId !== 'string') {
		return { ok: false, status: 500, error: 'Assignment has invalid class reference' };
	}

	// Verify user is a member of the class or the teacher
	const classData = firstEmbedded(assignmentData.classes);
	if (!isRecord(classData) || typeof classData.id !== 'string') {
		return { ok: false, status: 404, error: 'Class not found' };
	}

	const isTeacher = classData.teacher_id === userId;

	const [membershipResult, progressResult] = await Promise.all([
		isTeacher
			? Promise.resolve(null)
			: supabase
					.from('class_memberships')
					.select('id')
					.eq('class_id', classId)
					.eq('student_id', userId)
					.maybeSingle(),
		supabase
			.from('assignment_progress')
			.select('questions_attempted, questions_correct, completed_at, mistakes')
			.eq('assignment_id', assignmentId)
			.eq('student_id', userId)
			.maybeSingle()
	]);

	if (
		!isTeacher &&
		(membershipResult === null || membershipResult.error || !membershipResult.data)
	) {
		return { ok: false, status: 403, error: 'You are not a member of this class' };
	}

	const progressData: unknown = progressResult.data;
	const progress = parseProgressRow(progressData);
	const mistakes: unknown[] =
		isRecord(progressData) && Array.isArray(progressData.mistakes) ? progressData.mistakes : [];

	return {
		ok: true,
		config: {
			title: typeof assignmentData.title === 'string' ? assignmentData.title : '',
			classId,
			selectedCases: toStringArray(assignmentData.selected_cases),
			selectedDrillTypes: toStringArray(assignmentData.selected_drill_types),
			numberMode:
				typeof assignmentData.number_mode === 'string' ? assignmentData.number_mode : 'both',
			contentMode:
				typeof assignmentData.content_mode === 'string' ? assignmentData.content_mode : 'both',
			includeAdjectives: assignmentData.include_adjectives === true,
			contentLevel:
				typeof assignmentData.content_level === 'string' ? assignmentData.content_level : null,
			targetQuestions:
				typeof assignmentData.target_questions === 'number' ? assignmentData.target_questions : 0,
			attempted: progress.attempted,
			correct: progress.correct,
			completedAt: progress.completedAt,
			mistakes
		}
	};
}
