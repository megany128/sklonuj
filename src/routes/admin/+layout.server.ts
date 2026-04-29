import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/admin';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals.supabase, locals.user?.id, url.pathname + url.search);
	return {};
};
