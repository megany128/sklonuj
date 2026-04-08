import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const oauthError = url.searchParams.get('error');
	if (oauthError) {
		const description = url.searchParams.get('error_description') || oauthError || 'unknown';
		redirect(303, `${resolve('/auth')}?error=${encodeURIComponent(description)}`);
	}

	const code = url.searchParams.get('code');

	if (!code) {
		redirect(303, `${resolve('/auth')}?error=missing_code`);
	}

	const { error } = await locals.supabase.auth.exchangeCodeForSession(code);

	if (error) {
		console.error('OAuth callback error:', error.message);
		redirect(303, `${resolve('/auth')}?error=auth_failed`);
	}

	// If this is a password recovery flow, redirect to auth page with recovery flag
	const type = url.searchParams.get('type');
	if (type === 'recovery') {
		redirect(303, `${resolve('/auth')}?recovery=true`);
	}

	const returnTo = url.searchParams.get('returnTo');
	if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
		redirect(303, returnTo);
	}

	redirect(303, resolve('/'));
};
