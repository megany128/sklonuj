import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);

function generateClassCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(303, resolve('/auth'));
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const name = (formData.get('name') ?? '').toString().trim();
		const level = (formData.get('level') ?? '').toString();

		if (name.length === 0 || name.length > 100) {
			return fail(400, {
				message: 'Class name must be between 1 and 100 characters.',
				name,
				level
			});
		}

		if (!VALID_LEVELS.has(level)) {
			return fail(400, { message: 'Please select a valid level.', name, level });
		}

		const supabase = locals.supabase;
		const classCode = generateClassCode();

		const { data, error } = await supabase
			.from('classes')
			.insert({
				teacher_id: user.id,
				name,
				class_code: classCode,
				level
			})
			.select('id')
			.single();

		if (error) {
			// If class code collision, retry once
			if (error.code === '23505' && error.message.includes('class_code')) {
				const retryCode = generateClassCode();
				const { data: retryData, error: retryError } = await supabase
					.from('classes')
					.insert({
						teacher_id: user.id,
						name,
						class_code: retryCode,
						level
					})
					.select('id')
					.single();

				if (retryError) {
					return fail(500, { message: 'Failed to create class. Please try again.', name, level });
				}

				if (retryData && typeof retryData.id === 'string') {
					redirect(303, resolve(`/classes/${retryData.id}`));
				}
			}

			return fail(500, { message: 'Failed to create class. Please try again.', name, level });
		}

		if (data && typeof data.id === 'string') {
			redirect(303, resolve(`/classes/${data.id}`));
		}

		return fail(500, { message: 'Unexpected error creating class.', name, level });
	}
};
