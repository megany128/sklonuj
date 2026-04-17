// POST /api/report — receives a content report from the three-dot menu on a
// drill card. Validates, inserts into `content_reports` (migration 023; RLS
// enabled with no client policies — inserts go via the service-role client
// which bypasses RLS, mirroring the pattern used by other server-only
// endpoints in this repo). Then fire-and-forgets a Discord webhook if
// DISCORD_REPORT_WEBHOOK_URL is configured.
//
// Webhook setup (only needed when (re)configuring notifications):
//   1. Discord channel → Edit Channel → Integrations → Webhooks → New Webhook
//      → Copy Webhook URL.
//   2. Set DISCORD_REPORT_WEBHOOK_URL in Cloudflare Pages env vars (Production
//      and Preview, encrypted) and in local .env. Redeploy Pages — env var
//      changes only apply to new deployments.
//   3. Unset = DB insert still works, no Discord ping.
// Apply migration 023 via `supabase db push` or the Supabase SQL editor.
import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

const ALLOWED_CATEGORIES = ['wrong_answer', 'bad_sentence', 'bad_explanation', 'other'] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

const MAX_LENGTHS = {
	comment: 2000,
	drill_type: 100,
	lemma: 200,
	case_name: 50,
	number_form: 20,
	expected_answer: 500,
	user_answer: 500,
	sentence: 1000,
	explanation: 2000,
	user_agent: 500,
	page_url: 500
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateString(
	value: unknown,
	maxLen: number,
	field: string
): { ok: true; value: string | null } | { ok: false; error: string } {
	if (value === undefined || value === null || value === '') return { ok: true, value: null };
	if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
	if (value.length > maxLen) return { ok: false, error: `${field} exceeds max length ${maxLen}` };
	return { ok: true, value };
}

function truncate(value: string | null | undefined, maxLen: number): string | null {
	if (value === undefined || value === null) return null;
	return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function fieldOrDash(value: string | null | undefined): string {
	if (!value) return '—';
	return value.length > 1024 ? value.slice(0, 1024) + '…' : value;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!isRecord(body)) {
		return json({ error: 'Body must be a JSON object' }, { status: 400 });
	}

	const category = body.category;
	if (typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category as Category)) {
		return json({ error: 'Invalid or missing category' }, { status: 400 });
	}

	const stringFields: Array<keyof typeof MAX_LENGTHS> = [
		'comment',
		'drill_type',
		'lemma',
		'case_name',
		'number_form',
		'expected_answer',
		'user_answer',
		'sentence',
		'explanation'
	];

	const validated: Record<string, string | null> = {};
	for (const field of stringFields) {
		const result = validateString(body[field], MAX_LENGTHS[field], field);
		if (!result.ok) {
			return json({ error: result.error }, { status: 400 });
		}
		validated[field] = result.value;
	}

	let contextValue: unknown = body.context;
	if (contextValue !== undefined && contextValue !== null) {
		try {
			// Keep arbitrary JSON-serializable payload, but cap raw size to avoid abuse.
			const serialized = JSON.stringify(contextValue);
			if (serialized.length > 8000) {
				return json({ error: 'context exceeds max size' }, { status: 400 });
			}
		} catch {
			return json({ error: 'context is not JSON-serializable' }, { status: 400 });
		}
	} else {
		contextValue = null;
	}

	const userAgent = truncate(request.headers.get('user-agent'), MAX_LENGTHS.user_agent);

	let pageUrl: string | null = null;
	const bodyPageUrl = body.page_url;
	if (typeof bodyPageUrl === 'string' && bodyPageUrl.length > 0) {
		pageUrl = truncate(bodyPageUrl, MAX_LENGTHS.page_url);
	} else {
		pageUrl = truncate(request.headers.get('referer'), MAX_LENGTHS.page_url);
	}

	const userId = locals.user?.id ?? null;

	// content_reports has RLS enabled with no client policies (server-only
	// inserts), so we need the service-role key to bypass RLS. locals.supabase
	// is the anon client and would always 401 here.
	const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		console.error(
			'/api/report: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured'
		);
		return json({ error: 'Report service is not configured' }, { status: 500 });
	}
	const adminClient = createClient(supabaseUrl, serviceRoleKey);

	const { error: insertError } = await adminClient.from('content_reports').insert({
		user_id: userId,
		category,
		comment: validated.comment,
		drill_type: validated.drill_type,
		lemma: validated.lemma,
		case_name: validated.case_name,
		number_form: validated.number_form,
		expected_answer: validated.expected_answer,
		user_answer: validated.user_answer,
		sentence: validated.sentence,
		explanation: validated.explanation,
		context: contextValue,
		user_agent: userAgent,
		page_url: pageUrl
	});

	if (insertError) {
		console.error('Content report insert error:', insertError);
		return json({ error: 'Failed to submit report. Please try again.' }, { status: 500 });
	}

	const webhookUrl = privateEnv.DISCORD_REPORT_WEBHOOK_URL;
	if (webhookUrl) {
		const paradigm =
			isRecord(contextValue) && typeof contextValue.paradigm === 'string'
				? contextValue.paradigm
				: null;
		const embed = {
			title: 'New content report',
			color: 0xe34994,
			fields: [
				{ name: 'Category', value: fieldOrDash(category), inline: true },
				{ name: 'Drill type', value: fieldOrDash(validated.drill_type), inline: true },
				{ name: 'Lemma', value: fieldOrDash(validated.lemma), inline: true },
				{ name: 'Paradigm', value: fieldOrDash(paradigm), inline: true },
				{ name: 'Case', value: fieldOrDash(validated.case_name), inline: true },
				{ name: 'Number', value: fieldOrDash(validated.number_form), inline: true },
				{ name: 'Expected answer', value: fieldOrDash(validated.expected_answer), inline: true },
				{ name: 'User answer', value: fieldOrDash(validated.user_answer), inline: true },
				{ name: 'Sentence', value: fieldOrDash(validated.sentence) },
				{ name: 'Explanation', value: fieldOrDash(validated.explanation) },
				{ name: 'Comment', value: fieldOrDash(validated.comment) },
				{ name: 'User ID', value: fieldOrDash(userId) },
				{ name: 'Page', value: fieldOrDash(pageUrl) }
			],
			timestamp: new Date().toISOString()
		};

		// Fire-and-forget: never block the response on Discord, but log failures.
		void fetch(webhookUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ embeds: [embed] })
		})
			.then(async (res) => {
				if (!res.ok) {
					const text = await res.text().catch(() => '');
					console.error('Discord webhook failed:', res.status, text);
				}
			})
			.catch((err) => {
				console.error('Discord webhook error:', err);
			});
	}

	return json({ success: true });
};
