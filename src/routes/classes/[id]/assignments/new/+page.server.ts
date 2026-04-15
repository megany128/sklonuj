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

interface OtherClass {
	id: string;
	name: string;
	studentCount: number;
}

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { role } = await parent();

	if (role !== 'teacher') {
		return { error: 'Only teachers can create assignments.', otherClasses: [] };
	}

	const user = locals.user;
	if (!user) return { otherClasses: [] };

	const supabase = locals.supabase;
	const currentClassId = params.id;

	// Fetch teacher's other active (non-archived) classes
	const { data: teacherClasses } = await supabase
		.from('classes')
		.select('id, name')
		.eq('teacher_id', user.id)
		.eq('archived', false)
		.neq('id', currentClassId)
		.order('name');

	const otherClasses: OtherClass[] = [];
	if (Array.isArray(teacherClasses)) {
		const classIds: string[] = [];
		for (const row of teacherClasses) {
			if (isRecord(row) && typeof row.id === 'string' && typeof row.name === 'string') {
				classIds.push(row.id);
			}
		}

		// Fetch student counts for these classes
		const studentCountMap = new Map<string, number>();
		if (classIds.length > 0) {
			const { data: membershipData } = await supabase
				.from('class_memberships')
				.select('class_id')
				.in('class_id', classIds);

			if (Array.isArray(membershipData)) {
				for (const m of membershipData) {
					if (isRecord(m) && typeof m.class_id === 'string') {
						studentCountMap.set(m.class_id, (studentCountMap.get(m.class_id) ?? 0) + 1);
					}
				}
			}
		}

		for (const row of teacherClasses) {
			if (isRecord(row) && typeof row.id === 'string' && typeof row.name === 'string') {
				otherClasses.push({
					id: row.id,
					name: row.name,
					studentCount: studentCountMap.get(row.id) ?? 0
				});
			}
		}
	}

	return { otherClasses };
};

interface FormValues {
	title: string;
	description: string;
	selectedCases: string[];
	selectedDrillTypes: string[];
	numberMode: string;
	contentMode: string;
	includeAdjectives: boolean;
	contentLevel: string;
	targetQuestions: string;
	dueDate: string;
}

function failWithFormData(status: 400 | 403 | 500, message: string, values: FormValues) {
	return fail(status, {
		message,
		title: values.title,
		description: values.description,
		selectedCases: values.selectedCases,
		selectedDrillTypes: values.selectedDrillTypes,
		numberMode: values.numberMode,
		contentMode: values.contentMode,
		includeAdjectives: values.includeAdjectives,
		contentLevel: values.contentLevel,
		targetQuestions: values.targetQuestions,
		dueDate: values.dueDate
	});
}

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
		const contentLevel = (formData.get('content_level') ?? '').toString().trim();
		const targetQuestionsRaw = (formData.get('target_questions') ?? '20').toString();
		const dueDateRaw = (formData.get('due_date') ?? '').toString();

		const formValues: FormValues = {
			title,
			description,
			selectedCases,
			selectedDrillTypes,
			numberMode,
			contentMode,
			includeAdjectives,
			contentLevel,
			targetQuestions: targetQuestionsRaw,
			dueDate: dueDateRaw
		};

		if (title.length === 0 || title.length > 200) {
			return failWithFormData(400, 'Title must be between 1 and 200 characters.', formValues);
		}

		if (description.length > 1000) {
			return failWithFormData(400, 'Description must be 1000 characters or fewer.', formValues);
		}

		if (selectedCases.length === 0) {
			return failWithFormData(400, 'Please select at least one case.', formValues);
		}

		for (const c of selectedCases) {
			if (!VALID_CASES.has(c)) {
				return failWithFormData(400, `Invalid case: ${c}`, formValues);
			}
		}

		if (selectedDrillTypes.length === 0) {
			return failWithFormData(400, 'Please select at least one drill type.', formValues);
		}

		for (const dt of selectedDrillTypes) {
			if (!VALID_DRILL_TYPES.has(dt)) {
				return failWithFormData(400, `Invalid drill type: ${dt}`, formValues);
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
			return failWithFormData(
				400,
				"Form Production drills can't be created with only Nominative selected — Form Production needs at least one other case (e.g. Accusative, Genitive).",
				formValues
			);
		}

		if (!VALID_NUMBER_MODES.has(numberMode)) {
			return failWithFormData(400, 'Invalid number mode.', formValues);
		}

		if (!VALID_CONTENT_MODES.has(contentMode)) {
			return failWithFormData(400, 'Invalid content mode.', formValues);
		}

		if (
			contentLevel !== '' &&
			!VALID_CEFR_LEVELS.has(contentLevel) &&
			!CONTENT_LEVEL_KZK_PATTERN.test(contentLevel)
		) {
			return failWithFormData(400, 'Invalid content level.', formValues);
		}

		const targetQuestions = parseInt(targetQuestionsRaw, 10);
		if (isNaN(targetQuestions) || targetQuestions < 1 || targetQuestions > 200) {
			return failWithFormData(400, 'Target questions must be between 1 and 200.', formValues);
		}

		let dueDate: string | null = null;
		if (dueDateRaw) {
			// datetime-local gives "YYYY-MM-DDTHH:MM" with no timezone info.
			// Append 'Z' to treat it as UTC consistently across all edge locations.
			const utcString = dueDateRaw.endsWith('Z') ? dueDateRaw : dueDateRaw + 'Z';
			const parsed = new Date(utcString);
			if (isNaN(parsed.getTime())) {
				return failWithFormData(400, 'Invalid due date.', formValues);
			}
			dueDate = parsed.toISOString();
		}

		const supabase = locals.supabase;
		const classId = params.id;

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
			return failWithFormData(403, 'Only the teacher can create assignments.', formValues);
		}

		const { data, error } = await supabase
			.from('assignments')
			.insert({
				class_id: classId,
				title,
				description: description || null,
				selected_cases: selectedCases,
				selected_drill_types: selectedDrillTypes,
				number_mode: numberMode,
				content_mode: contentMode,
				include_adjectives: includeAdjectives,
				content_level: contentLevel || null,
				target_questions: targetQuestions,
				due_date: dueDate
			})
			.select('id')
			.single();

		if (error || !data || typeof data.id !== 'string') {
			return failWithFormData(500, 'Failed to create assignment. Please try again.', formValues);
		}

		// Handle additional classes (multi-class creation)
		const additionalClassesRaw = (formData.get('additional_classes') ?? '').toString().trim();
		const additionalClassIds = additionalClassesRaw
			? additionalClassesRaw.split(',').filter((id) => id.length > 0)
			: [];

		// All class IDs that need email notifications (primary + additional)
		const allClassIds = [classId, ...additionalClassIds];
		// Map of classId -> assignmentId for email links
		const classAssignmentMap = new Map<string, string>();
		classAssignmentMap.set(classId, data.id);

		if (additionalClassIds.length > 0) {
			// Verify user is teacher of each additional class
			const { data: verifiedClasses } = await supabase
				.from('classes')
				.select('id')
				.eq('teacher_id', user.id)
				.eq('archived', false)
				.in('id', additionalClassIds);

			const verifiedIds = new Set<string>();
			if (Array.isArray(verifiedClasses)) {
				for (const row of verifiedClasses) {
					if (isRecord(row) && typeof row.id === 'string') {
						verifiedIds.add(row.id);
					}
				}
			}

			// Create assignment for each verified additional class
			for (const additionalId of additionalClassIds) {
				if (!verifiedIds.has(additionalId)) continue;

				const { data: additionalData } = await supabase
					.from('assignments')
					.insert({
						class_id: additionalId,
						title,
						description: description || null,
						selected_cases: selectedCases,
						selected_drill_types: selectedDrillTypes,
						number_mode: numberMode,
						content_mode: contentMode,
						include_adjectives: includeAdjectives,
						content_level: contentLevel || null,
						target_questions: targetQuestions,
						due_date: dueDate
					})
					.select('id')
					.single();

				if (additionalData && isRecord(additionalData) && typeof additionalData.id === 'string') {
					classAssignmentMap.set(additionalId, additionalData.id);
				}
			}
		}

		// Fire-and-forget: send email notifications to students in all classes
		const apiKey = privateEnv.RESEND_API_KEY;
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
		if (apiKey && supabaseUrl && serviceRoleKey) {
			const adminClient = createClient(supabaseUrl, serviceRoleKey);
			const sendEmails = async () => {
				try {
					const resend = new Resend(apiKey);
					const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';
					const descriptionHtml = description ? `<p>${description}</p>` : '';
					const dueDateHtml = dueDate
						? `<p><strong>Due:</strong> ${new Date(dueDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC</p>`
						: '';
					const baseUrl = request.url.split('/classes/')[0];

					for (const cId of allClassIds) {
						const assignmentId = classAssignmentMap.get(cId);
						if (!assignmentId) continue;

						// Get student IDs from class memberships
						const { data: memberships } = await supabase
							.from('class_memberships')
							.select('student_id')
							.eq('class_id', cId);

						if (!Array.isArray(memberships) || memberships.length === 0) continue;

						const studentIds: string[] = [];
						for (const m of memberships) {
							if (isRecord(m) && typeof m.student_id === 'string') {
								studentIds.push(m.student_id);
							}
						}
						if (studentIds.length === 0) continue;

						// Get student emails
						const emails: string[] = [];
						const userResults = await Promise.all(
							studentIds.map((id) => adminClient.auth.admin.getUserById(id))
						);
						for (const result of userResults) {
							if (result.data?.user && typeof result.data.user.email === 'string') {
								emails.push(result.data.user.email);
							}
						}
						if (emails.length === 0) continue;

						// Get class name
						const { data: classInfo } = await supabase
							.from('classes')
							.select('name')
							.eq('id', cId)
							.single();
						const className =
							isRecord(classInfo) && typeof classInfo.name === 'string'
								? classInfo.name
								: 'your class';

						const assignmentLink = `${baseUrl}/classes/${cId}/assignments/${assignmentId}`;

						for (const email of emails) {
							await resend.emails.send({
								from: fromAddress,
								to: [email],
								subject: `New Assignment: ${title} - ${className}`,
								html: `
									<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
										<h2>New Assignment: ${title}</h2>
										<p>A new assignment has been posted in <strong>${className}</strong>.</p>
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
											<a href="${baseUrl}/profile" style="color: #666;">Manage email preferences</a> &middot;
											You're receiving this because you're enrolled in ${className}
										</p>
									</div>
								`
							});
						}
					}
				} catch {
					// Fire-and-forget: silently ignore email errors
				}
			};
			sendEmails();
		}

		redirect(303, resolve(`/classes/${classId}/assignments/${data.id}`));
	}
};
