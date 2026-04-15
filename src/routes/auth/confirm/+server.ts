import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';
import type { EmailOtpType } from '@supabase/supabase-js';

export const GET: RequestHandler = async ({ url, locals }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;
	const code = url.searchParams.get('code');

	// PKCE flow: Supabase sends a `code` param instead of `token_hash`
	if (code) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (error) {
			console.error('Recovery code exchange error:', error.message);
			redirect(303, `${resolve('/auth')}?error=auth_failed`);
		}
		// The confirm route is only used for password recovery, so always
		// redirect to the reset-password form after a successful exchange.
		redirect(303, `${resolve('/auth')}?recovery=true`);
	}

	// Legacy implicit flow: uses token_hash + type
	if (!token_hash || !type) {
		redirect(303, `${resolve('/auth')}?error=missing_token`);
	}

	const { error } = await locals.supabase.auth.verifyOtp({ token_hash, type });

	if (error) {
		console.error('Email confirmation error:', error.message);
		redirect(303, `${resolve('/auth')}?error=auth_failed`);
	}

	if (type === 'recovery') {
		redirect(303, `${resolve('/auth')}?recovery=true`);
	}

	const returnTo = url.searchParams.get('returnTo');
	if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
		redirect(303, returnTo);
	}

	redirect(303, resolve('/'));
};
