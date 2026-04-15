import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { Resend } from 'resend';
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

interface AssignmentData {
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
}

export const load: PageServerLoad = async ({ locals, params, parent, url }) => {
	const { classData, role } = await parent();

	if (role !== 'teacher') {
		return { assignment: null, hasProgress: false, fromAssignment: null };
	}

	const supabase = locals.supabase;
	const assignmentId = params.assignmentId;

	const { data: assignmentData, error: assignmentError } = await supabase
		.from('assignments')
		.select(
			'id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, include_adjectives, content_level, target_questions, due_date'
		)
		.eq('id', assignmentId)
		.eq('class_id', classData.id)
		.maybeSingle();

	if (assignmentError || !isRecord(assignmentData) || typeof assignmentData.id !== 'string') {
		return { assignment: null, hasProgress: false, fromAssignment: null };
	}

	// If the teacher arrived here via the duplicate flow, the original
	// assignment id is passed as ?from=<id>. Fetch its title so the back link
	// can point back to the source assignment rather than the fresh copy.
	let fromAssignment: { id: string; title: string } | null = null;
	const fromId = url.searchParams.get('from');
	if (fromId && fromId !== assignmentId) {
		const { data: fromData } = await supabase
			.from('assignments')
			.select('id, title')
			.eq('id', fromId)
			.eq('class_id', classData.id)
			.maybeSingle();
		if (
			isRecord(fromData) &&
			typeof fromData.id === 'string' &&
			typeof fromData.title === 'string'
		) {
			fromAssignment = { id: fromData.id, title: fromData.title };
		}
	}

	const assignment: AssignmentData = {
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
		dueDate: typeof assignmentData.due_date === 'string' ? assignmentData.due_date : null
	};

	// Check if any students have started this assignment
	const { data: progressData } = await supabase
		.from('assignment_progress')
		.select('student_id')
		.eq('assignment_id', assignmentId)
		.gt('questions_attempted', 0)
		.limit(1);

	const hasProgress = Array.isArray(progressData) && progressData.length > 0;

	return { assignment, hasProgress, fromAssignment };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
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

		// Form Production cannot drill nominative -> nominative (the answer would
		// be the lemma itself). If the only drill type is form_production and the
		// only selected case is nominative, no questions can be generated.
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
			// datetime-local gives "YYYY-MM-DDTHH:MM" with no timezone info.
			// Append 'Z' to treat it as UTC consistently across all edge locations.
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

		redirect(303, resolve(`/classes/${classId}/assignments/${assignmentId}`));
	}
};
