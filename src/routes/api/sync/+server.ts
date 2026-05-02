import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type Level = 'A1' | 'A2' | 'B1' | 'B2';
const VALID_LEVELS: ReadonlySet<string> = new Set<string>(['A1', 'A2', 'B1', 'B2']);
const MAX_REQUEST_BYTES = 100 * 1024; // 100KB

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidLevel(value: unknown): value is Level {
	return typeof value === 'string' && VALID_LEVELS.has(value);
}

function isValidCaseScore(value: unknown): value is { attempts: number; correct: number } {
	if (!isRecord(value)) return false;
	const attempts = value['attempts'];
	const correct = value['correct'];
	return (
		typeof attempts === 'number' &&
		typeof correct === 'number' &&
		Number.isFinite(attempts) &&
		Number.isFinite(correct) &&
		attempts >= 0 &&
		correct >= 0 &&
		attempts <= 1_000_000 &&
		correct <= 1_000_000 &&
		correct <= attempts
	);
}

function isValidSessionCaseScore(value: unknown): value is { attempted: number; correct: number } {
	if (!isRecord(value)) return false;
	const attempted = value['attempted'];
	const correct = value['correct'];
	return (
		typeof attempted === 'number' &&
		typeof correct === 'number' &&
		Number.isFinite(attempted) &&
		Number.isFinite(correct) &&
		attempted >= 0 &&
		correct >= 0 &&
		attempted <= 1_000_000 &&
		correct <= 1_000_000 &&
		correct <= attempted
	);
}

function isValidSessionCaseScoresRecord(
	value: unknown
): value is Record<string, { attempted: number; correct: number }> {
	if (!isRecord(value)) return false;
	for (const key of Object.keys(value)) {
		if (!isValidSessionCaseScore(value[key])) return false;
	}
	return true;
}

function isValidScoresRecord(
	value: unknown
): value is Record<string, { attempts: number; correct: number }> {
	if (!isRecord(value)) return false;
	for (const key of Object.keys(value)) {
		if (!isValidCaseScore(value[key])) return false;
	}
	return true;
}

function isValidIsoDateString(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	if (value === '') return true; // empty string is allowed (default)
	const d = new Date(value);
	return !isNaN(d.getTime());
}

function isValidDateOnly(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value).getTime());
}

interface ValidatedProgress {
	level: Level;
	caseScores: Record<string, { attempts: number; correct: number }>;
	paradigmScores: Record<string, { attempts: number; correct: number }>;
	lastSession: string;
	longestStreak: number;
}

interface ValidatedSession {
	sessionDate: string;
	questionsAttempted: number;
	questionsCorrect: number;
	caseScores: Record<string, { attempted: number; correct: number }>;
}

function validateProgress(
	value: unknown
): { valid: true; data: ValidatedProgress } | { valid: false; reason: string } {
	if (!isRecord(value)) return { valid: false, reason: 'progress must be an object' };

	const level = value['level'];
	if (!isValidLevel(level))
		return { valid: false, reason: 'progress.level must be one of A1, A2, B1, B2' };

	const caseScores = value['caseScores'];
	if (!isValidScoresRecord(caseScores))
		return {
			valid: false,
			reason: 'progress.caseScores must be a record of { attempts: number, correct: number }'
		};

	const rawParadigmScores = value['paradigmScores'];
	if (rawParadigmScores !== undefined && !isValidScoresRecord(rawParadigmScores))
		return {
			valid: false,
			reason: 'progress.paradigmScores must be a record of { attempts: number, correct: number }'
		};

	const lastSession = value['lastSession'];
	if (!isValidIsoDateString(lastSession))
		return { valid: false, reason: 'progress.lastSession must be a valid ISO date string' };

	const paradigmScores = isValidScoresRecord(rawParadigmScores) ? rawParadigmScores : {};

	// longestStreak is optional for backwards compatibility; default to 0.
	const rawLongestStreak = value['longestStreak'];
	let longestStreak = 0;
	if (rawLongestStreak !== undefined) {
		if (
			typeof rawLongestStreak !== 'number' ||
			!Number.isFinite(rawLongestStreak) ||
			rawLongestStreak < 0 ||
			rawLongestStreak > 1_000_000
		) {
			return {
				valid: false,
				reason: 'progress.longestStreak must be a non-negative number <= 1,000,000'
			};
		}
		longestStreak = rawLongestStreak;
	}

	return {
		valid: true,
		data: {
			level,
			caseScores,
			paradigmScores,
			lastSession,
			longestStreak
		}
	};
}

function validateSession(
	value: unknown
): { valid: true; data: ValidatedSession } | { valid: false; reason: string } {
	if (!isRecord(value)) return { valid: false, reason: 'session must be an object' };

	const sessionDate = value['sessionDate'];
	if (!isValidDateOnly(sessionDate))
		return { valid: false, reason: 'session.sessionDate must be a YYYY-MM-DD date string' };

	const questionsAttempted = value['questionsAttempted'];
	if (
		typeof questionsAttempted !== 'number' ||
		!Number.isFinite(questionsAttempted) ||
		questionsAttempted < 0 ||
		questionsAttempted > 1_000_000
	)
		return {
			valid: false,
			reason: 'session.questionsAttempted must be a non-negative number <= 1,000,000'
		};

	const questionsCorrect = value['questionsCorrect'];
	if (
		typeof questionsCorrect !== 'number' ||
		!Number.isFinite(questionsCorrect) ||
		questionsCorrect < 0 ||
		questionsCorrect > 1_000_000 ||
		questionsCorrect > questionsAttempted
	)
		return {
			valid: false,
			reason:
				'session.questionsCorrect must be a non-negative number <= 1,000,000 and <= questionsAttempted'
		};

	const rawCaseScores = value['caseScores'];
	const caseScores: Record<string, { attempted: number; correct: number }> =
		isValidSessionCaseScoresRecord(rawCaseScores) ? rawCaseScores : {};

	return {
		valid: true,
		data: {
			sessionDate,
			questionsAttempted,
			questionsCorrect,
			caseScores
		}
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	// Use the same local-date logic as the client: before 5 AM UTC, treat
	// the previous calendar day as "today" so late-night sessions match.
	const now = new Date();
	const todayDate = new Date(now);
	if (todayDate.getUTCHours() < 5) {
		todayDate.setUTCDate(todayDate.getUTCDate() - 1);
	}
	const today = todayDate.toISOString().slice(0, 10);
	const { data, error } = await locals.supabase
		.from('practice_sessions')
		.select('questions_attempted, questions_correct, case_scores')
		.eq('user_id', user.id)
		.eq('session_date', today)
		.maybeSingle();

	if (error) {
		return json({ error: 'Failed to fetch today session' }, { status: 500 });
	}

	return json({
		todaySession: data ?? null
	});
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	// Origin validation (CSRF protection)
	const origin = request.headers.get('origin');
	if (!origin || origin !== url.origin) {
		return json({ error: 'Forbidden: origin mismatch' }, { status: 403 });
	}

	// Content-Type check
	const contentType = request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, { status: 400 });
	}

	// Request size limit (checked after reading body; Content-Length header is untrusted)
	const rawText = await request.text();
	if (rawText.length > MAX_REQUEST_BYTES) {
		return json({ error: 'Request body too large' }, { status: 413 });
	}

	let body: unknown;
	try {
		body = JSON.parse(rawText);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	if (!isRecord(body)) {
		return json({ error: 'Request body must be a JSON object' }, { status: 400 });
	}

	const supabase = locals.supabase;

	// Sync user progress
	if (body['progress'] !== undefined) {
		const progressResult = validateProgress(body['progress']);
		if (!progressResult.valid) {
			return json({ error: progressResult.reason }, { status: 400 });
		}

		const { level, caseScores, paradigmScores, lastSession, longestStreak } = progressResult.data;

		// Read existing longest_answer_streak so a stale client payload can't
		// shrink the all-time maximum. We take MAX(existing, incoming).
		const { data: existingProgress } = await supabase
			.from('user_progress')
			.select('longest_answer_streak')
			.eq('user_id', user.id)
			.maybeSingle();

		let mergedLongestStreak = longestStreak;
		if (existingProgress) {
			const existingValue = existingProgress.longest_answer_streak;
			if (typeof existingValue === 'number' && existingValue > mergedLongestStreak) {
				mergedLongestStreak = existingValue;
			}
		}

		const { error: updateError } = await supabase.from('user_progress').upsert(
			{
				user_id: user.id,
				level,
				case_scores: caseScores,
				paradigm_scores: paradigmScores,
				last_session: lastSession,
				longest_answer_streak: mergedLongestStreak,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		if (updateError) {
			return json({ error: 'Failed to update user progress' }, { status: 500 });
		}
	}

	const userId = user.id;

	// Upsert a single practice session, merging with any existing row by taking
	// the per-field MAX so concurrent tabs (or stale-then-fresh requests)
	// can't shrink today's totals.
	async function upsertSession(session: ValidatedSession): Promise<string | null> {
		const { sessionDate, questionsAttempted, questionsCorrect, caseScores } = session;

		const { data: existing } = await supabase
			.from('practice_sessions')
			.select('questions_attempted, questions_correct, case_scores')
			.eq('user_id', userId)
			.eq('session_date', sessionDate)
			.maybeSingle();

		let mergedAttempted = questionsAttempted;
		let mergedCorrect = questionsCorrect;
		let mergedCaseScores = caseScores;

		if (existing) {
			mergedAttempted = Math.max(questionsAttempted, existing.questions_attempted ?? 0);
			mergedCorrect = Math.max(questionsCorrect, existing.questions_correct ?? 0);

			const existingCaseScores: Record<string, { attempted: number; correct: number }> =
				isValidSessionCaseScoresRecord(existing.case_scores) ? existing.case_scores : {};
			const merged: Record<string, { attempted: number; correct: number }> = {
				...existingCaseScores
			};
			for (const [key, val] of Object.entries(caseScores)) {
				const prev = merged[key] ?? { attempted: 0, correct: 0 };
				merged[key] = {
					attempted: Math.max(val.attempted, prev.attempted),
					correct: Math.max(val.correct, prev.correct)
				};
			}
			mergedCaseScores = merged;
		}

		const { error: upsertError } = await supabase.from('practice_sessions').upsert(
			{
				user_id: userId,
				session_date: sessionDate,
				questions_attempted: mergedAttempted,
				questions_correct: mergedCorrect,
				case_scores: mergedCaseScores,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,session_date' }
		);

		if (upsertError) return 'Failed to upsert practice session';
		return null;
	}

	// Sync a single practice session
	if (body['session'] !== undefined) {
		const sessionResult = validateSession(body['session']);
		if (!sessionResult.valid) {
			return json({ error: sessionResult.reason }, { status: 400 });
		}
		const failure = await upsertSession(sessionResult.data);
		if (failure) {
			return json({ error: failure }, { status: 500 });
		}
	}

	// Sync a batch of guest sessions captured before sign-up
	if (body['sessions'] !== undefined) {
		const rawSessions = body['sessions'];
		if (!Array.isArray(rawSessions)) {
			return json({ error: 'sessions must be an array' }, { status: 400 });
		}
		// Cap batch size to keep request bounded and reject obviously bogus input.
		if (rawSessions.length > 1000) {
			return json({ error: 'sessions array too large (max 1000)' }, { status: 400 });
		}
		const validatedSessions: ValidatedSession[] = [];
		for (let i = 0; i < rawSessions.length; i++) {
			const sessionResult = validateSession(rawSessions[i]);
			if (!sessionResult.valid) {
				return json({ error: `sessions[${i}]: ${sessionResult.reason}` }, { status: 400 });
			}
			validatedSessions.push(sessionResult.data);
		}
		for (const s of validatedSessions) {
			const failure = await upsertSession(s);
			if (failure) {
				return json({ error: failure }, { status: 500 });
			}
		}
	}

	return json({ ok: true });
};
