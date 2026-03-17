import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const today = new Date().toISOString().slice(0, 10);
	const { data } = await locals.supabase
		.from('practice_sessions')
		.select('questions_attempted, questions_correct')
		.eq('user_id', user.id)
		.eq('session_date', today)
		.maybeSingle();

	return json({
		todaySession: data ?? null
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = await request.json();
	const supabase = locals.supabase;

	// Sync user progress
	if (body.progress) {
		const { level, caseScores, paradigmScores, lastSession } = body.progress;
		await supabase
			.from('user_progress')
			.update({
				level,
				case_scores: caseScores,
				paradigm_scores: paradigmScores,
				last_session: lastSession,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', user.id);
	}

	// Sync practice session
	if (body.session) {
		const { sessionDate, questionsAttempted, questionsCorrect } = body.session;
		await supabase.from('practice_sessions').upsert(
			{
				user_id: user.id,
				session_date: sessionDate,
				questions_attempted: questionsAttempted,
				questions_correct: questionsCorrect,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,session_date' }
		);
	}

	return json({ ok: true });
};
