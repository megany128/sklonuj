import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return { profile: null, progress: null, sessions: [] };
	}

	const supabase = locals.supabase;

	const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
	const sixMonthsAgoStr = new Date(sixMonthsAgo).toISOString().slice(0, 10);

	// Return streamed promises so the page shell renders immediately
	const profilePromise = supabase
		.from('profiles')
		.select('display_name, created_at')
		.eq('id', user.id)
		.maybeSingle()
		.then((r) => r.data ?? null);

	const progressPromise = supabase
		.from('user_progress')
		.select('level, case_scores, paradigm_scores')
		.eq('user_id', user.id)
		.maybeSingle()
		.then((r) => r.data ?? null);

	const sessionsPromise = supabase
		.from('practice_sessions')
		.select('session_date, questions_attempted, questions_correct')
		.eq('user_id', user.id)
		.gte('session_date', sixMonthsAgoStr)
		.order('session_date', { ascending: true })
		.then(
			(r) =>
				(r.data ?? []) as Array<{
					session_date: string;
					questions_attempted: number;
					questions_correct: number;
				}>
		);

	return {
		profile: profilePromise,
		progress: progressPromise,
		sessions: sessionsPromise
	};
};

export const actions: Actions = {
	updateName: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const raw = formData.get('display_name');
		const name = typeof raw === 'string' ? raw.trim().slice(0, 50) || null : null;

		const { error } = await locals.supabase
			.from('profiles')
			.update({ display_name: name })
			.eq('id', user.id);

		if (error) return fail(500, { message: 'Failed to update name' });

		return { success: true };
	}
};
