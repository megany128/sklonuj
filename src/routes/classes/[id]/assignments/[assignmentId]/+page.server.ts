import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

const VALID_CASES = new Set(['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins']);
const VALID_DRILL_TYPES = new Set([
	'form_production',
	'case_identification',
	'sentence_fill_in',
	'multi_step'
]);
const VALID_NUMBER_MODES = new Set(['sg', 'pl', 'both']);
const VALID_CONTENT_MODES = new Set(['nouns', 'pronouns', 'both']);
const VALID_CEFR_LEVELS = new Set(['A1', 'A2', 'B1']);
const CONTENT_LEVEL_KZK_PATTERN = /^kzk[12]_\d{2}$/;

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
	includeAdjectives: boolean;
	contentLevel: string | null;
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
			'id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, include_adjectives, content_level, target_questions, due_date, created_at'
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
		selectedDrillTypes: toStringArray(assignmentData.selected_drill_types).filter((dt) =>
			VALID_DRILL_TYPES.has(dt)
		),
		numberMode:
			typeof assignmentData.number_mode === 'string' ? assignmentData.number_mode : 'both',
		contentMode: (() => {
			const raw =
				typeof assignmentData.content_mode === 'string' ? assignmentData.content_mode : 'both';
			// Normalize legacy values: 'adjectives' and 'all' are no longer valid content modes
			if (raw === 'adjectives' || raw === 'all') return 'both';
			return raw;
		})(),
		includeAdjectives:
			assignmentData.include_adjectives === true ||
			assignmentData.content_mode === 'adjectives' ||
			assignmentData.content_mode === 'all',
		contentLevel:
			typeof assignmentData.content_level === 'string' ? assignmentData.content_level : null,
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
	edit: async ({ request, locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const title = (formData.get('title') ?? '').toString().trim();
		const description = (formData.get('description') ?? '').toString().trim();
		const selectedCases = formData.getAll('selected_cases').map((v) => v.toString());
		const selectedDrillTypes = formData.getAll('selected_drill_types').map((v) => v.toString());
		const numberMode = (formData.get('number_mode') ?? 'both').toString();
		const contentMode = (formData.get('content_mode') ?? 'both').toString();
		const includeAdjectives = formData.get('include_adjectives') === 'true';
		const contentLevelRaw = (formData.get('content_level') ?? '').toString().trim();
		const contentLevel =
			contentLevelRaw &&
			(VALID_CEFR_LEVELS.has(contentLevelRaw) || CONTENT_LEVEL_KZK_PATTERN.test(contentLevelRaw))
				? contentLevelRaw
				: null;
		const targetQuestionsRaw = (formData.get('target_questions') ?? '20').toString();
		const dueDateRaw = (formData.get('due_date') ?? '').toString();

		if (title.length === 0 || title.length > 200) {
			return fail(400, { message: 'Title must be between 1 and 200 characters.' });
		}

		if (description.length > 1000) {
			return fail(400, { message: 'Description must be 1000 characters or fewer.' });
		}

		if (selectedCases.length === 0) {
			return fail(400, { message: 'Please select at least one case.' });
		}

		for (const c of selectedCases) {
			if (!VALID_CASES.has(c)) {
				return fail(400, { message: `Invalid case: ${c}` });
			}
		}

		if (selectedDrillTypes.length === 0) {
			return fail(400, { message: 'Please select at least one drill type.' });
		}

		for (const dt of selectedDrillTypes) {
			if (!VALID_DRILL_TYPES.has(dt)) {
				return fail(400, { message: `Invalid drill type: ${dt}` });
			}
		}

		if (
			selectedDrillTypes.length === 1 &&
			selectedDrillTypes[0] === 'form_production' &&
			selectedCases.length === 1 &&
			selectedCases[0] === 'nom'
		) {
			return fail(400, {
				message:
					"Form Production drills can't be created with only Nominative selected — Form Production needs at least one other case (e.g. Accusative, Genitive)."
			});
		}

		if (!VALID_NUMBER_MODES.has(numberMode)) {
			return fail(400, { message: 'Invalid number mode.' });
		}

		if (!VALID_CONTENT_MODES.has(contentMode)) {
			return fail(400, { message: 'Invalid content mode.' });
		}

		const targetQuestions = parseInt(targetQuestionsRaw, 10);
		if (isNaN(targetQuestions) || targetQuestions < 1 || targetQuestions > 200) {
			return fail(400, { message: 'Target questions must be between 1 and 200.' });
		}

		let dueDate: string | null = null;
		if (dueDateRaw) {
			const utcString = dueDateRaw.endsWith('Z') ? dueDateRaw : dueDateRaw + 'Z';
			const parsed = new Date(utcString);
			if (isNaN(parsed.getTime())) {
				return fail(400, { message: 'Invalid due date.' });
			}
			dueDate = parsed.toISOString();
		}

		const supabase = locals.supabase;
		const classId = params.id;
		const assignmentId = params.assignmentId;

		// Verify teacher ownership
		const { data: classOwner } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classOwner) ||
			typeof classOwner.teacher_id !== 'string' ||
			classOwner.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can edit assignments.' });
		}

		// Fetch old assignment to detect due date changes for notification
		const { data: oldAssignment } = await supabase
			.from('assignments')
			.select('due_date')
			.eq('id', assignmentId)
			.eq('class_id', classId)
			.single();

		const oldDueDate =
			isRecord(oldAssignment) && typeof oldAssignment.due_date === 'string'
				? oldAssignment.due_date
				: null;

		const { error: updateError } = await supabase
			.from('assignments')
			.update({
				title,
				description: description || null,
				selected_cases: selectedCases,
				selected_drill_types: selectedDrillTypes,
				number_mode: numberMode,
				content_mode: contentMode,
				include_adjectives: includeAdjectives,
				content_level: contentLevel,
				target_questions: targetQuestions,
				due_date: dueDate,
				updated_at: new Date().toISOString()
			})
			.eq('id', assignmentId)
			.eq('class_id', classId);

		if (updateError) {
			return fail(500, { message: 'Failed to update assignment. Please try again.' });
		}

		// Handle struggling threshold update on the classes table
		const strugglingThresholdRaw = formData.get('struggling_threshold');
		if (strugglingThresholdRaw !== null) {
			const strugglingThreshold = parseInt(strugglingThresholdRaw.toString(), 10);
			if (!isNaN(strugglingThreshold) && strugglingThreshold >= 0 && strugglingThreshold <= 100) {
				const { error: thresholdError } = await supabase
					.from('classes')
					.update({ struggling_threshold: strugglingThreshold })
					.eq('id', classId);

				if (thresholdError) {
					return fail(500, { message: 'Failed to update struggling threshold.' });
				}
			} else {
				return fail(400, { message: 'Struggling threshold must be an integer between 0 and 100.' });
			}
		}

		const notifyStudents = formData.get('notify_students') === 'on';

		// Fire-and-forget: send email notifications to enrolled students
		if (notifyStudents) {
			const apiKey = privateEnv.RESEND_API_KEY;
			const supabaseUrl = env.PUBLIC_SUPABASE_URL;
			const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
			if (apiKey && supabaseUrl && serviceRoleKey) {
				const adminClient = createClient(supabaseUrl, serviceRoleKey);
				const sendEmails = async () => {
					try {
						const { data: memberships } = await supabase
							.from('class_memberships')
							.select('student_id')
							.eq('class_id', classId);

						if (!Array.isArray(memberships) || memberships.length === 0) return;

						const studentIds: string[] = [];
						for (const m of memberships) {
							if (isRecord(m) && typeof m.student_id === 'string') {
								studentIds.push(m.student_id);
							}
						}
						if (studentIds.length === 0) return;

						const emails: string[] = [];
						const userResults = await Promise.all(
							studentIds.map((id) => adminClient.auth.admin.getUserById(id))
						);
						for (const result of userResults) {
							if (result.data?.user && typeof result.data.user.email === 'string') {
								emails.push(result.data.user.email);
							}
						}
						if (emails.length === 0) return;

						const { data: classInfo } = await supabase
							.from('classes')
							.select('name')
							.eq('id', classId)
							.single();
						const className =
							isRecord(classInfo) && typeof classInfo.name === 'string'
								? classInfo.name
								: 'your class';

						const resend = new Resend(apiKey);
						const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';
						const assignmentLink = `${request.url.split('/classes/')[0]}/classes/${classId}/assignments/${assignmentId}`;

						const dueDateChanged = oldDueDate !== dueDate;
						const dueDateHtml = dueDate
							? `<p><strong>${dueDateChanged ? 'New Due Date' : 'Due'}:</strong> ${new Date(dueDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC</p>`
							: '';
						const descriptionHtml = description ? `<p>${description}</p>` : '';

						for (const email of emails) {
							await resend.emails.send({
								from: fromAddress,
								to: [email],
								subject: `Assignment Updated: ${title} - ${className}`,
								html: `
								<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
									<h2>Assignment Updated: ${title}</h2>
									<p>An assignment has been updated in <strong>${className}</strong>.</p>
									${descriptionHtml}
									${dueDateHtml}
									<p>
										<a href="${assignmentLink}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
											View Assignment
										</a>
									</p>
									<p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
									<p style="color: #6b7280; font-size: 14px;">${assignmentLink}</p>
									<p style="margin-top: 24px; font-size: 12px; color: #666;">
										<a href="${request.url.split('/classes/')[0]}/profile" style="color: #666;">Manage email preferences</a> &middot;
										You're receiving this because you're enrolled in ${className}
									</p>
								</div>
							`
							});
						}
					} catch {
						// Fire-and-forget: silently ignore email errors
					}
				};
				sendEmails();
			}
		}

		return { success: true };
	},

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
				'title, description, selected_cases, selected_drill_types, number_mode, content_mode, include_adjectives, content_level, target_questions'
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
					? toStringArray(original.selected_drill_types).filter((dt) => VALID_DRILL_TYPES.has(dt))
					: [],
				number_mode: typeof original.number_mode === 'string' ? original.number_mode : 'both',
				content_mode: (() => {
					const raw = typeof original.content_mode === 'string' ? original.content_mode : 'both';
					if (raw === 'adjectives' || raw === 'all') return 'both';
					return raw;
				})(),
				include_adjectives:
					original.include_adjectives === true ||
					original.content_mode === 'adjectives' ||
					original.content_mode === 'all',
				content_level: typeof original.content_level === 'string' ? original.content_level : null,
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
