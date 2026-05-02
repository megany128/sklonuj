import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

import type { SupabaseClient } from '@supabase/supabase-js';

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);

async function generateClassCode(
	supabase: SupabaseClient
): Promise<{ code: string } | { error: string }> {
	const { data, error } = await supabase.rpc('generate_class_code');
	if (error) {
		return { error: error.message };
	}
	if (typeof data !== 'string' || data.length === 0) {
		return { error: 'Invalid class code returned from database.' };
	}
	return { code: data };
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
		const description = (formData.get('description') ?? '').toString().trim() || null;
		const level = (formData.get('level') ?? '').toString();

		const strugglingThresholdRaw = formData.get('struggling_threshold');
		const strugglingThreshold =
			strugglingThresholdRaw === null || strugglingThresholdRaw === ''
				? 50
				: Number(strugglingThresholdRaw);

		if (name.length === 0 || name.length > 100) {
			return fail(400, {
				message: 'Class name must be between 1 and 100 characters.',
				name,
				description: description ?? '',
				level,
				strugglingThreshold: Number.isFinite(strugglingThreshold) ? strugglingThreshold : 50
			});
		}

		if (description !== null && description.length > 500) {
			return fail(400, {
				message: 'Description must be 500 characters or fewer.',
				name,
				description,
				level,
				strugglingThreshold: Number.isFinite(strugglingThreshold) ? strugglingThreshold : 50
			});
		}

		if (!VALID_LEVELS.has(level)) {
			return fail(400, {
				message: 'Please select a valid level.',
				name,
				description: description ?? '',
				level,
				strugglingThreshold: Number.isFinite(strugglingThreshold) ? strugglingThreshold : 50
			});
		}

		if (
			!Number.isFinite(strugglingThreshold) ||
			!Number.isInteger(strugglingThreshold) ||
			strugglingThreshold < 0 ||
			strugglingThreshold > 100
		) {
			return fail(400, {
				message: 'Struggling threshold must be a whole number between 0 and 100.',
				name,
				description: description ?? '',
				level,
				strugglingThreshold: 50
			});
		}

		const supabase = locals.supabase;

		// Detect whether this is the user's first class. If so, auto-disable the
		// weekly practice summary email after the insert succeeds — those summaries
		// are aimed at learners, and creating a class implies the user is a teacher.
		const userId = user.id;
		const { count: existingClassCount, error: existingClassError } = await supabase
			.from('classes')
			.select('id', { count: 'exact', head: true })
			.eq('teacher_id', userId);
		const isFirstClass = existingClassError === null && (existingClassCount ?? 0) === 0;

		async function disableWeeklySummaryEmail(): Promise<void> {
			if (!isFirstClass) return;
			const { error: updateError } = await supabase
				.from('profiles')
				.update({ email_reminders: false })
				.eq('id', userId);
			if (updateError) {
				console.error('Failed to auto-disable weekly summary for new teacher:', updateError);
			}
		}

		const initialCode = await generateClassCode(supabase);
		if ('error' in initialCode) {
			return fail(500, { message: 'Failed to create class. Please try again.', name, level });
		}

		const { data, error } = await supabase
			.from('classes')
			.insert({
				teacher_id: user.id,
				name,
				description,
				class_code: initialCode.code,
				level,
				struggling_threshold: strugglingThreshold
			})
			.select('id')
			.single();

		if (error) {
			// Defensive retry in the unlikely event of a class_code collision.
			if (error.code === '23505' && error.message.includes('class_code')) {
				const retryCode = await generateClassCode(supabase);
				if ('error' in retryCode) {
					return fail(500, { message: 'Failed to create class. Please try again.', name, level });
				}

				const { data: retryData, error: retryError } = await supabase
					.from('classes')
					.insert({
						teacher_id: user.id,
						name,
						description,
						class_code: retryCode.code,
						level,
						struggling_threshold: strugglingThreshold
					})
					.select('id')
					.single();

				if (retryError) {
					return fail(500, { message: 'Failed to create class. Please try again.', name, level });
				}

				if (retryData && typeof retryData.id === 'string') {
					await disableWeeklySummaryEmail();
					redirect(303, resolve(`/classes/${retryData.id}?tour=1`));
				}
			}

			return fail(500, { message: 'Failed to create class. Please try again.', name, level });
		}

		if (data && typeof data.id === 'string') {
			await disableWeeklySummaryEmail();
			redirect(303, resolve(`/classes/${data.id}?tour=1`));
		}

		return fail(500, { message: 'Unexpected error creating class.', name, level });
	}
};
