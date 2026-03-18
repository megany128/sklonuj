import { json, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, locals }) => {
	const origin = request.headers.get('origin');
	if (!origin || origin !== url.origin) {
		return json({ error: 'Forbidden: origin mismatch' }, { status: 403 });
	}

	const { error } = await locals.supabase.auth.signOut();
	if (error) {
		console.error('Sign-out error:', error.message);
	}

	redirect(303, resolve('/'));
};
