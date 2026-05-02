// POST /api/profile/display-name — save the signed-in user's display_name.
// Used by the layout-level prompt that appears when a logged-in user's
// `profiles.display_name` is null (e.g. email/password signups that never
// supplied a name, or pre-trigger-fix accounts that were never backfilled).
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_LEN = 50;

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Not authenticated');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw error(400, 'Body must be an object');
	}

	const raw = (body as Record<string, unknown>).display_name;
	if (typeof raw !== 'string') {
		throw error(400, 'display_name must be a string');
	}

	const name = raw.trim().slice(0, MAX_LEN);
	if (name.length === 0) {
		throw error(400, 'display_name cannot be empty');
	}

	// Upsert so the call still succeeds if the profile row is missing for any
	// reason — same defensive shape as the saveName action in /classes.
	const { error: dbError } = await locals.supabase
		.from('profiles')
		.upsert({ id: user.id, display_name: name }, { onConflict: 'id' });

	if (dbError) {
		console.error('Failed to save display_name:', dbError);
		throw error(500, 'Failed to save display name');
	}

	return json({ display_name: name });
};
