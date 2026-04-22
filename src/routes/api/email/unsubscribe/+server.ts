/**
 * One-click email unsubscribe endpoint.
 *
 * Accepts GET requests with `?uid=<user_id>&sig=<hmac_signature>`.
 * Verifies the HMAC signature using CRON_SECRET as the key, then sets
 * `email_reminders = false` on the user's profile.
 *
 * Also supports POST for RFC 8058 List-Unsubscribe-Post compliance.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

async function hmacSign(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function handleUnsubscribe(url: URL): Promise<Response> {
	const uid = url.searchParams.get('uid');
	const sig = url.searchParams.get('sig');

	if (!uid || !sig) {
		return new Response(renderPage('Invalid link', 'The unsubscribe link is missing parameters.'), {
			status: 400,
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});
	}

	const secret = privateEnv.CRON_SECRET;
	if (!secret) {
		return new Response(renderPage('Error', 'Server configuration error.'), {
			status: 500,
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});
	}

	const expectedSig = await hmacSign(secret, `unsubscribe:${uid}`);
	if (sig !== expectedSig) {
		return new Response(
			renderPage('Invalid link', 'This unsubscribe link is invalid or expired.'),
			{
				status: 403,
				headers: { 'Content-Type': 'text/html; charset=utf-8' }
			}
		);
	}

	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		return new Response(renderPage('Error', 'Server configuration error.'), {
			status: 500,
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	await adminClient.from('profiles').update({ email_reminders: false }).eq('id', uid);

	return new Response(
		renderPage(
			'Unsubscribed',
			"You've been unsubscribed from weekly practice reminders. You can re-enable them anytime from your profile."
		),
		{
			status: 200,
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		}
	);
}

function renderPage(title: string, message: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${title} - Skloňuj</title>
	<style>
		body { font-family: system-ui, -apple-system, sans-serif; background: #fbf6f3; color: #5a5a5a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
		.card { background: #fff; border: 1px solid #e8e3e0; border-radius: 16px; padding: 32px; max-width: 400px; text-align: center; }
		h1 { color: #0c0f00; font-size: 18px; margin: 0 0 8px; }
		p { font-size: 14px; line-height: 1.5; margin: 0 0 16px; }
		a { color: #0c0f00; font-weight: 600; }
	</style>
</head>
<body>
	<div class="card">
		<h1>${title}</h1>
		<p>${message}</p>
		<a href="/">Back to Skloňuj</a>
	</div>
</body>
</html>`;
}

// GET — one-click unsubscribe from email link
export const GET: RequestHandler = async ({ url }) => {
	return handleUnsubscribe(url);
};

// POST — RFC 8058 List-Unsubscribe-Post compliance
export const POST: RequestHandler = async ({ url }) => {
	return handleUnsubscribe(url);
};
