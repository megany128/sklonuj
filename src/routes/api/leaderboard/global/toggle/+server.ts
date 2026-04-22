import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = JSON.parse(await request.text());
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	if (!isRecord(body) || typeof body.visible !== 'boolean') {
		return json({ error: 'visible (boolean) is required' }, { status: 400 });
	}

	const supabase = locals.supabase;
	const { error: updateError } = await supabase
		.from('profiles')
		.update({ show_on_leaderboard: body.visible })
		.eq('id', user.id);

	if (updateError) {
		return json({ error: 'Failed to update preference' }, { status: 500 });
	}

	return json({ showOnLeaderboard: body.visible });
};
