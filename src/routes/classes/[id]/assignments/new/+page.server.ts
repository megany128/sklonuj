import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
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

export const load: PageServerLoad = async ({ parent }) => {
	const { role } = await parent();

	if (role !== 'teacher') {
		return { error: 'Only teachers can create assignments.' };
	}

	return {};
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
			const parsed = new Date(dueDateRaw);
			if (isNaN(parsed.getTime())) {
				return fail(400, { message: 'Invalid due date.' });
			}
			dueDate = parsed.toISOString();
		}

		const supabase = locals.supabase;
		const classId = params.id;

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
				target_questions: targetQuestions,
				due_date: dueDate
			})
			.select('id')
			.single();

		if (error || !data || typeof data.id !== 'string') {
			return fail(500, { message: 'Failed to create assignment. Please try again.' });
		}

		redirect(303, resolve(`/classes/${classId}/assignments/${data.id}`));
	}
};
