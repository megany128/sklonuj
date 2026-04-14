import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);

export const load: PageServerLoad = async ({ parent }) => {
	const { classData, role } = await parent();

	if (role !== 'teacher') {
		redirect(303, resolve(`/classes/${classData.id}`));
	}

	return { classData, role };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

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
			return fail(403, { message: 'Only the class creator can edit this class.' });
		}

		const formData = await request.formData();
		const name = (formData.get('name') ?? '').toString().trim();
		const description = (formData.get('description') ?? '').toString().trim() || null;
		const level = (formData.get('level') ?? '').toString();

		if (name.length === 0 || name.length > 100) {
			return fail(400, {
				message: 'Class name must be between 1 and 100 characters.',
				name,
				description: description ?? '',
				level
			});
		}

		if (description !== null && description.length > 500) {
			return fail(400, {
				message: 'Description must be 500 characters or fewer.',
				name,
				description,
				level
			});
		}

		if (!VALID_LEVELS.has(level)) {
			return fail(400, {
				message: 'Please select a valid level.',
				name,
				description: description ?? '',
				level
			});
		}

		const leaderboardEnabledRaw = formData.get('leaderboard_enabled');
		const leaderboardEnabled = leaderboardEnabledRaw === 'on';

		const strugglingThresholdRaw = formData.get('struggling_threshold');
		const strugglingThreshold =
			strugglingThresholdRaw === null || strugglingThresholdRaw === ''
				? 50
				: Number(strugglingThresholdRaw);
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
				level
			});
		}

		const { error: updateError } = await supabase
			.from('classes')
			.update({
				name,
				description,
				level,
				leaderboard_enabled: leaderboardEnabled,
				struggling_threshold: strugglingThreshold,
				updated_at: new Date().toISOString()
			})
			.eq('id', classId);

		if (updateError) {
			return fail(500, {
				message: 'Failed to update class. Please try again.',
				name,
				description: description ?? '',
				level
			});
		}

		redirect(303, resolve(`/classes/${classId}`));
	}
};
