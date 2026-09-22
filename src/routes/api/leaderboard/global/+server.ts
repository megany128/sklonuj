import { json } from '@sveltejs/kit';
import { computeGlobalLeaderboard, GlobalLeaderboardError } from '$lib/server/global-leaderboard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await computeGlobalLeaderboard(locals.user, locals.guestId));
	} catch (e) {
		if (e instanceof GlobalLeaderboardError) {
			return json({ error: e.message }, { status: 500 });
		}
		throw e;
	}
};
