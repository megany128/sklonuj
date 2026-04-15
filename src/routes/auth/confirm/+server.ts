import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';
import type { EmailOtpType } from '@supabase/supabase-js';

export const GET: RequestHandler = async ({ url, locals }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;

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
