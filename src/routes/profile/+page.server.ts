import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface ProfileData {
	display_name: string | null;
	created_at: string;
}

interface ScoreEntry {
	attempts: number;
	correct: number;
}

interface ProgressData {
	level: string;
	case_scores: Record<string, ScoreEntry>;
	paradigm_scores: Record<string, ScoreEntry>;
}

interface SessionData {
	session_date: string;
	questions_attempted: number;
	questions_correct: number;
}

function isProfileData(v: unknown): v is ProfileData {
	if (typeof v !== 'object' || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		(typeof obj.display_name === 'string' || obj.display_name === null) &&
		typeof obj.created_at === 'string'
	);
}

function isProgressData(v: unknown): v is ProgressData {
	if (typeof v !== 'object' || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.level === 'string' &&
		typeof obj.case_scores === 'object' &&
		obj.case_scores !== null &&
		typeof obj.paradigm_scores === 'object' &&
		obj.paradigm_scores !== null
	);
}

function isSessionArray(v: unknown): v is SessionData[] {
	if (!Array.isArray(v)) return false;
	return v.every(
		(item) =>
			typeof item === 'object' &&
			item !== null &&
			typeof (item as Record<string, unknown>).session_date === 'string' &&
			typeof (item as Record<string, unknown>).questions_attempted === 'number' &&
			typeof (item as Record<string, unknown>).questions_correct === 'number'
	);
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return { profile: null, progress: null, sessions: [], loadError: null };
	}

	const supabase = locals.supabase;

	const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
	const sixMonthsAgoStr = new Date(sixMonthsAgo).toISOString().slice(0, 10);

	const [profileResult, progressResult, sessionsResult] = await Promise.all([
		supabase.from('profiles').select('display_name, created_at').eq('id', user.id).maybeSingle(),
		supabase
			.from('user_progress')
			.select('level, case_scores, paradigm_scores')
			.eq('user_id', user.id)
			.maybeSingle(),
		supabase
			.from('practice_sessions')
			.select('session_date, questions_attempted, questions_correct')
			.eq('user_id', user.id)
			.gte('session_date', sixMonthsAgoStr)
			.order('session_date', { ascending: true })
	]);

	const errors: string[] = [];

	if (profileResult.error) {
		errors.push(`Profile: ${profileResult.error.message}`);
	}
	if (progressResult.error) {
		errors.push(`Progress: ${progressResult.error.message}`);
	}
	if (sessionsResult.error) {
		errors.push(`Sessions: ${sessionsResult.error.message}`);
	}

	const profile = isProfileData(profileResult.data) ? profileResult.data : null;
	const progress = isProgressData(progressResult.data) ? progressResult.data : null;
	const sessions = isSessionArray(sessionsResult.data) ? sessionsResult.data : [];

	return {
		profile,
		progress,
		sessions,
		loadError: errors.length > 0 ? errors.join('; ') : null
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
