import { redirect } from '@sveltejs/kit';
import {
	computeGlobalLeaderboard,
	type GlobalLeaderboardResult
} from '$lib/server/global-leaderboard';
import {
	loadAssignmentConfig,
	loadStudentAssignments,
	type AssignmentConfig,
	type StudentAssignment
} from '$lib/server/student-assignments';
import {
	CHAPTER_STORAGE_KEY,
	parseChapterSelection,
	type ChapterSelection
} from '$lib/engine/chapter-selection';
import { isCase } from '$lib/types';
import type { PageServerLoad } from './$types';

/**
 * KzK chapter mode for the first paint. The client persists its selection to
 * localStorage and mirrors it into the `sklonuj_chapter` cookie so SSR can
 * render the chapter stepper (instead of the free-practice level selector +
 * case pill bar) and hydration doesn't reflow the page. Deep-link params that
 * force free practice on the client (`?selectCase=`, `?cases=`, `?mode=review`)
 * are applied here too so both sides pick the same branch.
 */
function resolveInitialChapter(
	rawCookie: string | undefined,
	params: URLSearchParams
): ChapterSelection | null {
	const selection = parseChapterSelection(rawCookie);
	if (selection === null) return null;
	const selectCase = params.get('selectCase');
	if (selectCase !== null && isCase(selectCase)) return null;
	const cases = params.get('cases');
	if (cases !== null && cases.split(',').some((c) => isCase(c))) return null;
	if (params.get('mode') === 'review') return null;
	return selection;
}

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	// If the practice page is opened in assignment mode (?assignment=<id>) by an
	// unauthenticated user, redirect to sign-in before rendering any HTML.
	// Otherwise the client-side effect races the practice engine init and the
	// user sees a flash of non-assignment free-practice content before the
	// redirect lands.
	const assignmentId = url.searchParams.get('assignment');
	const user = locals.user;
	if (assignmentId && !user) {
		const returnTo = `/?assignment=${assignmentId}`;
		throw redirect(303, `/auth?returnTo=${encodeURIComponent(returnTo)}`);
	}

	// Streamed (not awaited): the page renders immediately and the leaderboard
	// arrives in the same response as soon as the query finishes, instead of
	// waiting for hydration + a separate client fetch. Never rejects — a
	// failure resolves to null and the banner shows an "unavailable" state.
	const globalLeaderboard: Promise<GlobalLeaderboardResult | null> = computeGlobalLeaderboard(
		user
	).catch((e: unknown) => {
		console.error('global leaderboard: initial load failed', e);
		return null;
	});

	// Streamed too: the assignment-mode drill config for ?assignment=<id>.
	// Resolves to the same JSON as GET /api/assignment-progress, or null when
	// the assignment is missing / not authorized / the query fails — the client
	// then falls back to the API route, which reports the real status code.
	// `assignmentConfigId` lets the client confirm the promise belongs to the
	// id currently in the URL (shallow-routing changes don't re-run this load).
	const assignmentConfig: Promise<AssignmentConfig | null> | null =
		assignmentId && user
			? loadAssignmentConfig(locals.supabase, user.id, assignmentId)
					.then((result) => (result.ok ? result.config : null))
					.catch((e: unknown) => {
						console.error('assignment config: initial load failed', e);
						return null;
					})
			: null;

	// Awaited: a single indexed query, and having it in the SSR payload lets
	// the "Your assignments" panel render at its final size with no skeleton.
	let studentAssignments: StudentAssignment[] = [];
	if (user) {
		try {
			studentAssignments = await loadStudentAssignments(locals.supabase, user.id);
		} catch (e: unknown) {
			console.error('student assignments: initial load failed', e);
		}
	}

	return {
		initialChapter: resolveInitialChapter(cookies.get(CHAPTER_STORAGE_KEY), url.searchParams),
		globalLeaderboard,
		studentAssignments,
		assignmentConfigId: assignmentId && user ? assignmentId : null,
		assignmentConfig
	};
};
