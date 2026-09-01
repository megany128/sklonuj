import type { LayoutServerLoad } from './$types';

interface SavedProgress {
	level: string;
	case_scores: Record<string, { attempts: number; correct: number }>;
	paradigm_scores: Record<string, { attempts: number; correct: number }>;
	lemma_scores: Record<string, { attempts: number; correct: number }>;
	last_session: string;
	longest_answer_streak: number;
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
	// lemma_scores is optional for backwards compatibility (column added later).
	const lemmaScores = isScoresRecord(data.lemma_scores) ? data.lemma_scores : {};
	const rawLongest = data.longest_answer_streak;
	const longestAnswerStreak = typeof rawLongest === 'number' ? rawLongest : 0;
	return {
		level: data.level,
		case_scores: data.case_scores,
		paradigm_scores: data.paradigm_scores,
		lemma_scores: lemmaScores,
		last_session: data.last_session,
		longest_answer_streak: longestAnswerStreak
	};
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;

	let savedProgress: SavedProgress | null = null;
	let displayName: string | null = null;

	if (user) {
		const supabase = locals.supabase;

		const progressPromise = supabase
			.from('user_progress')
			.select(
				'level, case_scores, paradigm_scores, lemma_scores, last_session, longest_answer_streak'
			)
			.eq('user_id', user.id)
			.maybeSingle();

		const profilePromise = supabase
			.from('profiles')
			.select('display_name')
			.eq('id', user.id)
			.maybeSingle();

		const [progressResult, profileResult] = await Promise.all([progressPromise, profilePromise]);

		if (!progressResult.error && progressResult.data) {
			savedProgress = parseSavedProgress(progressResult.data);
		}

		if (
			!profileResult.error &&
			profileResult.data &&
			isRecord(profileResult.data) &&
			typeof profileResult.data.display_name === 'string'
		) {
			displayName = profileResult.data.display_name;
		}
	}

	return {
		user: user
			? {
					id: user.id,
					email: user.email,
					display_name: displayName,
					user_metadata: {
						avatar_url:
							typeof user.user_metadata?.avatar_url === 'string' &&
							user.user_metadata.avatar_url.startsWith('http')
								? user.user_metadata.avatar_url
								: undefined
					}
				}
			: null,
		savedProgress
	};
};
