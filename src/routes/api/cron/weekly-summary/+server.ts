/**
 * Weekly practice summary cron endpoint.
 *
 * Invoked hourly by `.github/workflows/cron-weekly-summary.yml`.
 * Finds users whose preferred reminder day + hour (stored in UTC) match
 * the current UTC day + hour, and who haven't received an email in the
 * last 6 days (guard against duplicate sends).
 *
 * Sends a personalised summary via Resend with:
 *   - Total exercises completed this week
 *   - Overall accuracy
 *   - Weakest cases to focus on
 *   - Level-appropriate encouragement
 */
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { buildUnsubscribeUrl } from '$lib/server/email-unsubscribe';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord);
}

interface EligibleUser {
	id: string;
	display_name: string | null;
}

interface ProgressRow {
	user_id: string;
	level: string;
	case_scores: Record<string, { attempts: number; correct: number }>;
}

interface SessionRow {
	user_id: string;
	questions_attempted: number;
	questions_correct: number;
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

const LEVEL_ENCOURAGEMENT: Record<string, string> = {
	A1: "You're building a solid foundation — keep it up and you'll be ready for plural forms and more complex sentences soon!",
	A2: "You're making great progress with plurals and harder vocabulary. Consistent practice at this stage really pays off!",
	B1: "You're tackling advanced patterns now. A few more sessions and even native speakers will be impressed!",
	B2: "You're at an advanced level — regular practice will help you master even the trickiest exceptions."
};

function computeWeeklyStats(sessions: SessionRow[]) {
	let totalAttempts = 0;
	let totalCorrect = 0;
	for (const s of sessions) {
		totalAttempts += s.questions_attempted;
		totalCorrect += s.questions_correct;
	}
	return {
		totalAttempts,
		overallAccuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0
	};
}

function computeWeakestCases(caseScores: Record<string, { attempts: number; correct: number }>) {
	const aggregated: Record<string, { attempts: number; correct: number }> = {};

	for (const [key, score] of Object.entries(caseScores)) {
		const caseName = key.split('_')[0];
		if (!aggregated[caseName]) {
			aggregated[caseName] = { attempts: 0, correct: 0 };
		}
		aggregated[caseName].attempts += score.attempts;
		aggregated[caseName].correct += score.correct;
	}

	return Object.entries(aggregated)
		.filter(([, v]) => v.attempts >= 3)
		.sort(([, a], [, b]) => {
			const accA = a.attempts > 0 ? a.correct / a.attempts : 0;
			const accB = b.attempts > 0 ? b.correct / b.attempts : 0;
			return accA - accB;
		})
		.slice(0, 2)
		.map(([k]) => CASE_LABELS[k] ?? k);
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildEmailHtml(
	name: string,
	weeklyStats: { totalAttempts: number; overallAccuracy: number },
	weakestCases: string[],
	level: string,
	siteOrigin: string,
	unsubscribeUrl: string
): string {
	const encouragement = LEVEL_ENCOURAGEMENT[level] ?? LEVEL_ENCOURAGEMENT['A1'];

	const statsSection =
		weeklyStats.totalAttempts > 0
			? `
				<p style="color:#5a5a5a;font-size:15px;line-height:1.6;">This week you completed <strong style="color:#0c0f00;">${weeklyStats.totalAttempts} exercises</strong> with an accuracy of <strong style="color:#0c0f00;">${weeklyStats.overallAccuracy}%</strong>.</p>
				${weakestCases.length > 0 ? `<p style="margin-top:8px;color:#5a5a5a;font-size:14px;">Suggested focus: <strong style="color:#0c0f00;">${weakestCases.join(', ')}</strong></p>` : ''}
			`
			: `<p style="color:#5a5a5a;font-size:15px;line-height:1.6;">You didn&rsquo;t practice this week &mdash; no worries! Even a quick 5-minute session helps keep your Czech sharp.</p>`;

	return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fbf6f3;font-family:system-ui,-apple-system,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf6f3;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

	<!-- Header -->
	<tr><td style="padding:0 0 24px;text-align:center;">
		<span style="font-size:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0c0f00;">SKLOŇUJ</span>
	</td></tr>

	<!-- Card -->
	<tr><td style="background:#ffffff;border:1px solid #e8e3e0;border-radius:16px;padding:32px;">
		<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0c0f00;">Your weekly summary</p>
		<p style="margin:0 0 16px;color:#5a5a5a;font-size:15px;">Hi ${name},</p>
		${statsSection}
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
		<tr><td style="background:#fbf6f3;border-radius:10px;padding:14px 18px;">
			<p style="margin:0;color:#5a5a5a;font-size:14px;line-height:1.5;">💡 ${encouragement}</p>
		</td></tr>
		</table>
		<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
		<tr><td style="background:#0c0f00;border-radius:10px;">
			<a href="${siteOrigin}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Practice now</a>
		</td></tr>
		</table>
	</td></tr>

	<!-- Footer -->
	<tr><td style="padding:24px 0 0;text-align:center;">
		<p style="margin:0;font-size:12px;color:#949494;line-height:1.5;">
			<a href="${siteOrigin}/profile" style="color:#949494;text-decoration:underline;">Manage preferences</a>
			&nbsp;&middot;&nbsp;
			<a href="${unsubscribeUrl}" style="color:#949494;text-decoration:underline;">Unsubscribe</a>
		</p>
	</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export const POST: RequestHandler = async ({ request, url }) => {
	const siteOrigin = url.origin;
	const authHeader = request.headers.get('authorization');
	const cronSecret = privateEnv.CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		return json({ error: 'Supabase configuration missing' }, { status: 500 });
	}

	const resendApiKey = privateEnv.RESEND_API_KEY;
	if (!resendApiKey) {
		return json({ error: 'Email service is not configured' }, { status: 500 });
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	const resend = new Resend(resendApiKey);
	const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';

	const now = new Date();
	const currentDayUtc = now.getUTCDay(); // 0 = Sunday
	const currentHourUtc = now.getUTCHours();
	const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

	// Find users whose preferred day matches today, whose preferred hour has
	// already passed (or is now), and who haven't been emailed in the last 6
	// days. Using `<=` instead of `=` on the hour gives us a same-day catch-up
	// window: GitHub Actions occasionally drops scheduled runs (free-tier is
	// best-effort), so the next hourly run picks up anyone the missed slot
	// was meant to email. The 6-day guard prevents double-sends within a week.
	const { data: profilesData, error: profilesError } = await adminClient
		.from('profiles')
		.select('id, display_name')
		.eq('email_reminders', true)
		.eq('reminder_day', currentDayUtc)
		.lte('reminder_hour_utc', currentHourUtc)
		.or(`last_weekly_email_at.is.null,last_weekly_email_at.lt.${sixDaysAgo.toISOString()}`);

	if (profilesError) {
		console.error('weekly-summary: failed to query profiles', profilesError);
		return json({ error: 'Failed to query profiles' }, { status: 500 });
	}

	const profiles = toRecordArray(profilesData).filter(
		(p): p is Record<string, unknown> & EligibleUser =>
			typeof p.id === 'string' && (typeof p.display_name === 'string' || p.display_name === null)
	);

	if (profiles.length === 0) {
		console.log(
			`weekly-summary: day=${currentDayUtc} hour=${currentHourUtc} eligible=0 (no users matched filter)`
		);
		return json({ ok: true, eligible: 0, sent: 0, failed: 0 });
	}

	const userIds = profiles.map((p) => p.id);

	// Fetch progress data for all eligible users
	const { data: progressData } = await adminClient
		.from('user_progress')
		.select('user_id, level, case_scores')
		.in('user_id', userIds);

	const progressRows = toRecordArray(progressData).filter(
		(r): r is Record<string, unknown> & ProgressRow =>
			typeof r.user_id === 'string' && typeof r.level === 'string' && isRecord(r.case_scores)
	);

	const progressByUser = new Map(progressRows.map((r) => [r.user_id, r]));

	// Fetch this week's sessions for all eligible users
	const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const weekStartStr = weekStart.toISOString().slice(0, 10);

	const { data: sessionsData } = await adminClient
		.from('practice_sessions')
		.select('user_id, questions_attempted, questions_correct')
		.in('user_id', userIds)
		.gte('session_date', weekStartStr);

	const sessionRows = toRecordArray(sessionsData).filter(
		(r): r is Record<string, unknown> & SessionRow =>
			typeof r.user_id === 'string' &&
			typeof r.questions_attempted === 'number' &&
			typeof r.questions_correct === 'number'
	);

	const sessionsByUser = new Map<string, SessionRow[]>();
	for (const s of sessionRows) {
		const existing = sessionsByUser.get(s.user_id) ?? [];
		existing.push(s);
		sessionsByUser.set(s.user_id, existing);
	}

	// Get email addresses from auth
	const emailByUser = new Map<string, string>();
	let page = 1;
	const perPage = 50;
	const userIdSet = new Set(userIds);
	let found = 0;
	while (found < userIds.length) {
		const { data: listData } = await adminClient.auth.admin.listUsers({ page, perPage });
		if (!listData || !Array.isArray(listData.users) || listData.users.length === 0) break;
		for (const user of listData.users) {
			if (
				isRecord(user) &&
				typeof user.id === 'string' &&
				userIdSet.has(user.id) &&
				typeof user.email === 'string'
			) {
				emailByUser.set(user.id, user.email);
				found++;
			}
		}
		if (listData.users.length < perPage) break;
		page++;
	}

	// Build emails for all eligible users (async for unsubscribe URL generation)
	const emailJobs = await Promise.all(
		profiles.map(async (profile) => {
			const userEmail = emailByUser.get(profile.id);
			if (!userEmail) return null;

			const progress = progressByUser.get(profile.id);
			const level = progress?.level ?? 'A1';
			const caseScores = progress?.case_scores ?? {};
			const sessions = sessionsByUser.get(profile.id) ?? [];

			const weeklyStats = computeWeeklyStats(sessions);
			const weakestCases = computeWeakestCases(caseScores);
			const displayName = escapeHtml(profile.display_name ?? 'there');

			const unsubscribeUrl = cronSecret
				? await buildUnsubscribeUrl(siteOrigin, profile.id, cronSecret)
				: `${siteOrigin}/profile`;

			const html = buildEmailHtml(
				displayName,
				weeklyStats,
				weakestCases,
				level,
				siteOrigin,
				unsubscribeUrl
			);

			return {
				profileId: profile.id,
				email: userEmail,
				unsubscribeUrl,
				subject:
					weeklyStats.totalAttempts > 0
						? `Your weekly Skloňuj summary — ${weeklyStats.overallAccuracy}% accuracy`
						: 'Your weekly Skloňuj reminder — time to practice!',
				html
			};
		})
	);

	const validJobs = emailJobs.filter(
		(
			j
		): j is {
			profileId: string;
			email: string;
			unsubscribeUrl: string;
			subject: string;
			html: string;
		} => j !== null
	);

	// Send all emails in parallel
	const results = await Promise.allSettled(
		validJobs.map(async (job) => {
			const emailRes = await resend.emails.send({
				from: fromAddress,
				to: [job.email],
				subject: job.subject,
				html: job.html,
				headers: {
					'List-Unsubscribe': `<${job.unsubscribeUrl}>`,
					'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
				}
			});
			if (emailRes.error) throw new Error(emailRes.error.message);
			// Update last_weekly_email_at to prevent duplicate sends
			await adminClient
				.from('profiles')
				.update({ last_weekly_email_at: now.toISOString() })
				.eq('id', job.profileId);
		})
	);

	const sent = results.filter((r) => r.status === 'fulfilled').length;
	const failures = results
		.map((r, i) => ({ r, job: validJobs[i] }))
		.filter(({ r }) => r.status === 'rejected')
		.map(({ r, job }) => ({
			profileId: job.profileId,
			email: job.email,
			reason: r.status === 'rejected' ? String((r as PromiseRejectedResult).reason) : 'unknown'
		}));

	console.log(
		`weekly-summary: day=${currentDayUtc} hour=${currentHourUtc} eligible=${profiles.length} sent=${sent} failed=${failures.length}`
	);
	if (failures.length > 0) {
		console.error('weekly-summary: failures', failures);
	}

	return json({ ok: true, eligible: profiles.length, sent, failed: failures.length });
};
