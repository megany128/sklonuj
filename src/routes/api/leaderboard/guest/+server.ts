// Guest (anonymous) leaderboard sync.
//
// POST  — upsert today's cumulative totals for the guest identified by the
//         `sklonuj_guest_id` cookie into `guest_practice_sessions` (per-field
//         MAX, see migration 037). Rejected for signed-in users: their
//         activity goes through /api/sync and `practice_sessions`.
// DELETE — remove every row for that guest id. Called right after a new
//         account has uploaded its guest sessions, so the same practice is
//         never counted twice. Allowed while signed in (that is the only
//         time it happens); the cookie is cleared in the response.
//
// Both write through the service-role client: the table has RLS on with no
// client policies, mirroring `content_reports`.
import { json } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { GUEST_ID_STORAGE_KEY } from '$lib/engine/guest-id';
import type { RequestHandler } from './$types';

const MAX_REQUEST_BYTES = 4 * 1024;
// Generous ceiling on a single day's questions; anything above is not a
// learner but a script trying to top the board.
const MAX_QUESTIONS_PER_DAY = 5_000;
// The client dates sessions in its local zone with a 5 AM rollover, so allow
// a little drift either side of the server's calendar day — but never a
// backfilled week.
const MAX_DATE_DRIFT_DAYS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= MAX_QUESTIONS_PER_DAY
	);
}

function isDateOnly(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Whole days between `dateOnly` (YYYY-MM-DD) and the server's UTC today; NaN if unparsable. */
function daysFromToday(dateOnly: string): number {
	const then = Date.parse(`${dateOnly}T00:00:00Z`);
	if (Number.isNaN(then)) return Number.NaN;
	const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
	return Math.abs(then - today) / 86_400_000;
}

function serviceClient(): SupabaseClient | null {
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		console.error(
			'guest leaderboard: SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL is not configured'
		);
		return null;
	}
	return createClient(supabaseUrl, serviceRoleKey);
}

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (locals.user) {
		return json({ error: 'Signed-in users sync through /api/sync' }, { status: 403 });
	}
	const guestId = locals.guestId;
	if (guestId === null) {
		return json({ error: 'Missing guest id cookie' }, { status: 400 });
	}

	const origin = request.headers.get('origin');
	if (!origin || origin !== url.origin) {
		return json({ error: 'Forbidden: origin mismatch' }, { status: 403 });
	}
	const contentType = request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, { status: 400 });
	}

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

	const { sessionDate, questionsAttempted, questionsCorrect } = body;
	if (!isDateOnly(sessionDate) || !(daysFromToday(sessionDate) <= MAX_DATE_DRIFT_DAYS)) {
		return json(
			{ error: 'sessionDate must be a YYYY-MM-DD date within two days of today' },
			{
				status: 400
			}
		);
	}
	if (!isCounter(questionsAttempted) || !isCounter(questionsCorrect)) {
		return json(
			{
				error: `questionsAttempted and questionsCorrect must be integers in 0..${MAX_QUESTIONS_PER_DAY}`
			},
			{ status: 400 }
		);
	}
	if (questionsCorrect > questionsAttempted) {
		return json({ error: 'questionsCorrect must not exceed questionsAttempted' }, { status: 400 });
	}

	const supabase = serviceClient();
	if (supabase === null) {
		return json({ error: 'Leaderboard service is not configured' }, { status: 500 });
	}
	const { error } = await supabase.rpc('upsert_guest_practice_session', {
		p_guest_id: guestId,
		p_session_date: sessionDate,
		p_attempted: questionsAttempted,
		p_correct: questionsCorrect
	});
	if (error) {
		console.error('guest leaderboard: upsert failed', error);
		return json({ error: 'Failed to save guest session' }, { status: 500 });
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals, url, cookies }) => {
	const guestId = locals.guestId;
	if (guestId === null) {
		return json({ error: 'Missing guest id cookie' }, { status: 400 });
	}
	const origin = request.headers.get('origin');
	if (!origin || origin !== url.origin) {
		return json({ error: 'Forbidden: origin mismatch' }, { status: 403 });
	}

	const supabase = serviceClient();
	if (supabase === null) {
		return json({ error: 'Leaderboard service is not configured' }, { status: 500 });
	}
	const { error } = await supabase.from('guest_practice_sessions').delete().eq('guest_id', guestId);
	if (error) {
		console.error('guest leaderboard: delete failed', error);
		return json({ error: 'Failed to delete guest sessions' }, { status: 500 });
	}
	cookies.delete(GUEST_ID_STORAGE_KEY, { path: '/' });
	return json({ ok: true });
};
