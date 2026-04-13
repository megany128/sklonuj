import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
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
	case_scores: Record<string, { attempted: number; correct: number }> | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isProfileData(v: unknown): v is ProfileData {
	if (!isRecord(v)) return false;
	return (
		(typeof v.display_name === 'string' || v.display_name === null) &&
		typeof v.created_at === 'string'
	);
}

function isProgressData(v: unknown): v is ProgressData {
	if (!isRecord(v)) return false;
	return (
		typeof v.level === 'string' &&
		typeof v.case_scores === 'object' &&
		v.case_scores !== null &&
		typeof v.paradigm_scores === 'object' &&
		v.paradigm_scores !== null
	);
}

function isSessionArray(v: unknown): v is SessionData[] {
	if (!Array.isArray(v)) return false;
	return v.every(
		(item) =>
			isRecord(item) &&
			typeof item.session_date === 'string' &&
			typeof item.questions_attempted === 'number' &&
			typeof item.questions_correct === 'number'
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
			.select('session_date, questions_attempted, questions_correct, case_scores')
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
	const rawSessions = isSessionArray(sessionsResult.data) ? sessionsResult.data : [];
	// Normalize case_scores for rows that predate the column
	const sessions = rawSessions.map((s) => {
		const cs = s.case_scores;
		const normalizedCs: Record<string, { attempted: number; correct: number }> =
			cs !== null ? cs : {};
		return { ...s, case_scores: normalizedCs };
	});

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
	},

	resetProgress: async ({ locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

		if (!supabaseUrl || !serviceRoleKey) {
			return fail(500, { message: 'Server configuration error' });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		// Reset progress first — if this fails, sessions are still intact
		const { error: progressError } = await adminClient
			.from('user_progress')
			.update({
				level: 'A1',
				case_scores: {},
				paradigm_scores: {},
				last_session: ''
			})
			.eq('user_id', user.id);

		if (progressError) return fail(500, { message: 'Failed to reset progress' });

		// Then delete practice sessions
		const { error: sessionsError } = await adminClient
			.from('practice_sessions')
			.delete()
			.eq('user_id', user.id);

		if (sessionsError) return fail(500, { message: 'Failed to delete practice sessions' });

		return { success: true };
	},

	deleteAccount: async ({ locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

		if (!supabaseUrl || !serviceRoleKey) {
			return fail(500, { message: 'Server configuration error' });
		}

		// Use service role client to delete the user from auth
		// All related data (profiles, user_progress, user_settings, practice_sessions)
		// will be cascade-deleted via ON DELETE CASCADE foreign keys
		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { error } = await adminClient.auth.admin.deleteUser(user.id);

		if (error) {
			console.error('Failed to delete user:', error.message);
			return fail(500, { message: 'Failed to delete account' });
		}

		// Sign out and clear auth cookies. signOut() may fail since the user
		// no longer exists, but we call it primarily to clear the local cookies
		// so they don't linger as invalid tokens on subsequent requests.
		const signOutResult = await locals.supabase.auth.signOut();
		if (signOutResult.error) {
			console.warn('signOut after deleteUser failed (expected):', signOutResult.error.message);
		}

		redirect(303, resolve('/'));
	}
};
