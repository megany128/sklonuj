import type { LayoutServerLoad } from './$types';

interface SavedProgress {
	level: string;
	case_scores: Record<string, { attempts: number; correct: number }>;
	paradigm_scores: Record<string, { attempts: number; correct: number }>;
	last_session: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScoresRecord(
	value: unknown
): value is Record<string, { attempts: number; correct: number }> {
	if (!isRecord(value)) return false;
	for (const v of Object.values(value)) {
		if (!isRecord(v) || typeof v.attempts !== 'number' || typeof v.correct !== 'number') {
			return false;
		}
	}
	return true;
}

function parseSavedProgress(data: unknown): SavedProgress | null {
	if (!isRecord(data)) return null;
	if (typeof data.level !== 'string') return null;
	if (typeof data.last_session !== 'string') return null;
	if (!isScoresRecord(data.case_scores)) return null;
	if (!isScoresRecord(data.paradigm_scores)) return null;
	return {
		level: data.level,
		case_scores: data.case_scores,
		paradigm_scores: data.paradigm_scores,
		last_session: data.last_session
	};
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;

	let savedProgress: SavedProgress | null = null;

	if (user) {
		const { data, error } = await locals.supabase
			.from('user_progress')
			.select('level, case_scores, paradigm_scores, last_session')
			.eq('user_id', user.id)
			.maybeSingle();

		if (!error && data) {
			savedProgress = parseSavedProgress(data);
		}
	}

	return {
		user: user
			? {
					id: user.id,
					email: user.email,
					user_metadata: { avatar_url: user.user_metadata?.avatar_url }
				}
			: null,
		savedProgress
	};
};
