import { redirect } from '@sveltejs/kit';
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

	return {};
};
