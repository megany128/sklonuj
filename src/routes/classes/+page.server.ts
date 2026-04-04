import type { PageServerLoad } from './$types';

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

function toStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((item): item is string => typeof item === 'string');
}

export const load: PageServerLoad = async ({ locals }) => {
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

	// For teacher classes, fetch student counts and assignment counts
	const teacherClassesWithCounts: Array<
		ClassRow & { studentCount: number; assignmentCount: number }
	> = [];
	if (teacherClasses.length > 0) {
		const classIds = teacherClasses.map((c) => c.id);
		const [{ data: countData }, { data: assignmentCountData }] = await Promise.all([
			supabase.from('class_memberships').select('class_id').in('class_id', classIds),
			supabase.from('assignments').select('id, class_id').in('class_id', classIds)
		]);

		const studentCountMap = new Map<string, number>();
		if (Array.isArray(countData)) {
			for (const row of countData) {
				if (isRecord(row) && typeof row.class_id === 'string') {
					studentCountMap.set(row.class_id, (studentCountMap.get(row.class_id) ?? 0) + 1);
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

		for (const cls of teacherClasses) {
			teacherClassesWithCounts.push({
				...cls,
				studentCount: studentCountMap.get(cls.id) ?? 0,
				assignmentCount: assignmentCountMap.get(cls.id) ?? 0
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

	// Fetch archived classes for teachers
	const archivedClasses: ClassRow[] = [];
	if (teacherClasses.length > 0) {
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
	}

	return {
		teacherClasses: teacherClassesWithCounts,
		archivedClasses,
		studentClasses,
		studentAssignments,
		studentProgress: studentProgressList
	};
};
