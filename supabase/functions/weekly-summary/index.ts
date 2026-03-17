import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CaseScore {
	attempts: number;
	correct: number;
}

interface UserRow {
	user_id: string;
	level: string;
	case_scores: Record<string, CaseScore>;
	last_session: string;
}

interface ProfileRow {
	id: string;
	display_name: string | null;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const CASE_LABELS: Record<string, string> = {
	nom: 'Nominative',
	gen: 'Genitive',
	dat: 'Dative',
	acc: 'Accusative',
	voc: 'Vocative',
	loc: 'Locative',
	ins: 'Instrumental'
};

function computeStats(caseScores: Record<string, CaseScore>) {
	let totalAttempts = 0;
	let totalCorrect = 0;
	const caseAccuracy: Record<string, { accuracy: number; attempts: number }> = {};

	for (const [key, score] of Object.entries(caseScores)) {
		totalAttempts += score.attempts;
		totalCorrect += score.correct;

		const caseName = key.split('_')[0];
		if (!caseAccuracy[caseName]) {
			caseAccuracy[caseName] = { accuracy: 0, attempts: 0 };
		}
		caseAccuracy[caseName].attempts += score.attempts;
		caseAccuracy[caseName].accuracy += score.correct;
	}

	for (const key of Object.keys(caseAccuracy)) {
		const entry = caseAccuracy[key];
		entry.accuracy = entry.attempts > 0 ? entry.accuracy / entry.attempts : 0;
	}

	const weakest = Object.entries(caseAccuracy)
		.filter(([, v]) => v.attempts >= 3)
		.sort(([, a], [, b]) => a.accuracy - b.accuracy)
		.slice(0, 2)
		.map(([k]) => CASE_LABELS[k] ?? k);

	return {
		totalAttempts,
		overallAccuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
		weakest
	};
}

function buildEmailHtml(
	name: string,
	stats: { totalAttempts: number; overallAccuracy: number; weakest: string[] }
): string {
	const focusSection =
		stats.weakest.length > 0
			? `<p style="margin-top:12px;">Suggested focus: <strong>${stats.weakest.join(', ')}</strong></p>`
			: '';

	return `
		<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
			<h2 style="color:#333;">Your weekly Sklonuj summary</h2>
			<p>Hi ${name},</p>
			<p>This week you completed <strong>${stats.totalAttempts} exercises</strong> with an accuracy of <strong>${stats.overallAccuracy}%</strong>.</p>
			${focusSection}
			<p style="margin-top:24px;color:#666;font-size:14px;">Keep practicing!</p>
		</div>
	`;
}

Deno.serve(async () => {
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const supabase = createClient(supabaseUrl, serviceRoleKey);

	// Get users who opted in to email reminders
	const { data: profiles } = await supabase
		.from('profiles')
		.select('id, display_name')
		.eq('email_reminders', true);

	if (!profiles || profiles.length === 0) {
		return new Response(JSON.stringify({ sent: 0 }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const userIds = (profiles as ProfileRow[]).map((p) => p.id);

	const { data: progressRows } = await supabase
		.from('user_progress')
		.select('user_id, level, case_scores, last_session')
		.in('user_id', userIds);

	let sent = 0;

	for (const profile of profiles as ProfileRow[]) {
		const progressRow = (progressRows as UserRow[] | null)?.find((r) => r.user_id === profile.id);
		if (!progressRow) continue;

		const stats = computeStats(progressRow.case_scores);
		if (stats.totalAttempts === 0) continue;

		const displayName = escapeHtml(profile.display_name ?? 'there');
		const html = buildEmailHtml(displayName, stats);

		// Get user email from auth
		const {
			data: { user }
		} = await supabase.auth.admin.getUserById(profile.id);
		if (!user?.email) continue;

		// Send via Supabase's built-in email or Resend
		// Using the auth.admin.inviteUserByEmail is not suitable here.
		// This requires a Resend API key configured as RESEND_API_KEY env var.
		const resendKey = Deno.env.get('RESEND_API_KEY');
		if (!resendKey) continue;

		const emailRes = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${resendKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: 'Sklonuj <noreply@sklonuj.com>',
				to: [user.email],
				subject: `Your weekly Sklonuj summary - ${stats.overallAccuracy}% accuracy`,
				html
			})
		});

		if (emailRes.ok) sent++;
	}

	return new Response(JSON.stringify({ sent }), {
		headers: { 'Content-Type': 'application/json' }
	});
});
