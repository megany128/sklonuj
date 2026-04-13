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
	let pendingAssignmentCount = 0;
	let displayName: string | null = null;

	if (user) {
		const supabase = locals.supabase;

		const progressPromise = supabase
			.from('user_progress')
			.select('level, case_scores, paradigm_scores, last_session')
			.eq('user_id', user.id)
			.maybeSingle();

		const profilePromise = supabase
			.from('user_profiles')
			.select('display_name')
			.eq('id', user.id)
			.maybeSingle();

		// Count pending (incomplete) assignments for this student
		const pendingPromise = (async () => {
			const { data: memberships } = await supabase
				.from('class_memberships')
				.select('class_id')
				.eq('student_id', user.id);

			if (!Array.isArray(memberships) || memberships.length === 0) return 0;

			const classIds: string[] = [];
			for (const m of memberships) {
				if (isRecord(m) && typeof m.class_id === 'string') {
					classIds.push(m.class_id);
				}
			}
			if (classIds.length === 0) return 0;

			const { data: assignments } = await supabase
				.from('assignments')
				.select('id')
				.in('class_id', classIds);

			if (!Array.isArray(assignments) || assignments.length === 0) return 0;

			const assignmentIds: string[] = [];
			for (const a of assignments) {
				if (isRecord(a) && typeof a.id === 'string') {
					assignmentIds.push(a.id);
				}
			}
			if (assignmentIds.length === 0) return 0;

			const { data: completedProgress } = await supabase
				.from('assignment_progress')
				.select('assignment_id')
				.eq('student_id', user.id)
				.in('assignment_id', assignmentIds)
				.not('completed_at', 'is', null);

			const completedIds = new Set<string>();
			if (Array.isArray(completedProgress)) {
				for (const p of completedProgress) {
					if (isRecord(p) && typeof p.assignment_id === 'string') {
						completedIds.add(p.assignment_id);
					}
				}
			}

			return assignmentIds.filter((id) => !completedIds.has(id)).length;
		})();

		const [progressResult, pending, profileResult] = await Promise.all([
			progressPromise,
			pendingPromise,
			profilePromise
		]);

		if (!progressResult.error && progressResult.data) {
			savedProgress = parseSavedProgress(progressResult.data);
		}

		pendingAssignmentCount = pending;

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
					user_metadata: { avatar_url: user.user_metadata?.avatar_url }
				}
			: null,
		savedProgress,
		pendingAssignmentCount
	};
};
