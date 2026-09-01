import { redirect } from '@sveltejs/kit';
import {
	computeGlobalLeaderboard,
	type GlobalLeaderboardResult
} from '$lib/server/global-leaderboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	// If the practice page is opened in assignment mode (?assignment=<id>) by an
	// unauthenticated user, redirect to sign-in before rendering any HTML.
	// Otherwise the client-side effect races the practice engine init and the
	// user sees a flash of non-assignment free-practice content before the
	// redirect lands.
	const assignmentId = url.searchParams.get('assignment');
	if (assignmentId && !locals.user) {
		const returnTo = `/?assignment=${assignmentId}`;
		throw redirect(303, `/auth?returnTo=${encodeURIComponent(returnTo)}`);
	}

	// Streamed (not awaited): the page renders immediately and the leaderboard
	// arrives in the same response as soon as the query finishes, instead of
	// waiting for hydration + a separate client fetch. Never rejects — a
	// failure resolves to null and the banner shows an "unavailable" state.
	const globalLeaderboard: Promise<GlobalLeaderboardResult | null> = computeGlobalLeaderboard(
		locals.user
	).catch((e: unknown) => {
		console.error('global leaderboard: initial load failed', e);
		return null;
	});

	return { globalLeaderboard };
};
