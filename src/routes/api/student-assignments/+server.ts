import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string');
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const supabase = locals.supabase;

	// Find all classes the user is a student in
	const { data: memberships, error: membershipsError } = await supabase
		.from('class_memberships')
		.select('class_id')
		.eq('student_id', user.id);

	if (membershipsError) {
		return json({ error: 'Failed to fetch memberships' }, { status: 500 });
	}

	if (!Array.isArray(memberships) || memberships.length === 0) {
		return json({ assignments: [] });
	}

	const classIds: string[] = [];
	for (const m of memberships) {
		if (isRecord(m) && typeof m.class_id === 'string') {
			classIds.push(m.class_id);
		}
	}

	if (classIds.length === 0) {
		return json({ assignments: [] });
	}

	// Fetch class names
	const { data: classesData, error: classesError } = await supabase
		.from('classes')
		.select('id, name')
		.in('id', classIds);

	if (classesError) {
		return json({ error: 'Failed to fetch classes' }, { status: 500 });
	}

	const classNameMap = new Map<string, string>();
	if (Array.isArray(classesData)) {
		for (const c of classesData) {
			if (isRecord(c) && typeof c.id === 'string' && typeof c.name === 'string') {
				classNameMap.set(c.id, c.name);
			}
		}
	}

	// Fetch all assignments for those classes
	const { data: assignmentsData, error: assignmentsError } = await supabase
		.from('assignments')
		.select(
			'id, class_id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, content_level, target_questions, due_date'
		)
		.in('class_id', classIds);

	if (assignmentsError) {
		return json({ error: 'Failed to fetch assignments' }, { status: 500 });
	}

	if (!Array.isArray(assignmentsData) || assignmentsData.length === 0) {
		return json({ assignments: [] });
	}

	// Fetch user's progress for all assignments
	const assignmentIds: string[] = [];
	for (const a of assignmentsData) {
		if (isRecord(a) && typeof a.id === 'string') {
			assignmentIds.push(a.id);
		}
	}

	const { data: progressData } = await supabase
		.from('assignment_progress')
		.select('assignment_id, questions_attempted, questions_correct, completed_at')
		.eq('student_id', user.id)
		.in('assignment_id', assignmentIds);

	const progressMap = new Map<
		string,
		{ attempted: number; correct: number; completedAt: string | null }
	>();
	if (Array.isArray(progressData)) {
		for (const p of progressData) {
			if (isRecord(p) && typeof p.assignment_id === 'string') {
				progressMap.set(p.assignment_id, {
					attempted: typeof p.questions_attempted === 'number' ? p.questions_attempted : 0,
					correct: typeof p.questions_correct === 'number' ? p.questions_correct : 0,
					completedAt: typeof p.completed_at === 'string' ? p.completed_at : null
				});
			}
		}
	}

	// Build response
	interface AssignmentResponse {
		id: string;
		classId: string;
		className: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		contentLevel: string | null;
		targetQuestions: number;
		dueDate: string | null;
		attempted: number;
		correct: number;
		completedAt: string | null;
	}

	const assignments: AssignmentResponse[] = [];

	for (const a of assignmentsData) {
		if (!isRecord(a) || typeof a.id !== 'string' || typeof a.class_id !== 'string') continue;

		const progress = progressMap.get(a.id) ?? { attempted: 0, correct: 0, completedAt: null };
		const className = classNameMap.get(a.class_id) ?? 'Unknown Class';

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

	return json({ assignments });
};
