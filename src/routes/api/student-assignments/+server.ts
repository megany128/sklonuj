import { json } from '@sveltejs/kit';
import { loadStudentAssignments } from '$lib/server/student-assignments';
import type { RequestHandler } from './$types';

// Client refresh endpoint. The home page's initial render gets the same
// list from +page.server.ts (awaited, so SSR paints the panel at final size).
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		const assignments = await loadStudentAssignments(locals.supabase, user.id);
		return json({ assignments });
	} catch (e: unknown) {
		console.error('student assignments: query failed', e);
		return json({ error: 'Failed to fetch assignments' }, { status: 500 });
	}
};
