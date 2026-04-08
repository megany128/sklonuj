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
}

interface ValidatedSession {
	sessionDate: string;
	questionsAttempted: number;
	questionsCorrect: number;
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

	return {
		valid: true,
		data: {
			level,
			caseScores,
			paradigmScores,
			lastSession
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

	return {
		valid: true,
		data: {
			sessionDate,
			questionsAttempted,
			questionsCorrect
		}
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const today = new Date().toISOString().slice(0, 10);
	const { data, error } = await locals.supabase
		.from('practice_sessions')
		.select('questions_attempted, questions_correct')
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

		const { level, caseScores, paradigmScores, lastSession } = progressResult.data;

		const { error: updateError } = await supabase.from('user_progress').upsert(
			{
				user_id: user.id,
				level,
				case_scores: caseScores,
				paradigm_scores: paradigmScores,
				last_session: lastSession,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		if (updateError) {
			return json({ error: 'Failed to update user progress' }, { status: 500 });
		}
	}

	// Sync practice session
	if (body['session'] !== undefined) {
		const sessionResult = validateSession(body['session']);
		if (!sessionResult.valid) {
			return json({ error: sessionResult.reason }, { status: 400 });
		}

		const { sessionDate, questionsAttempted, questionsCorrect } = sessionResult.data;

		const { error: upsertError } = await supabase.from('practice_sessions').upsert(
			{
				user_id: user.id,
				session_date: sessionDate,
				questions_attempted: questionsAttempted,
				questions_correct: questionsCorrect,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,session_date' }
		);

		if (upsertError) {
			return json({ error: 'Failed to upsert practice session' }, { status: 500 });
		}
	}

	return json({ ok: true });
};
