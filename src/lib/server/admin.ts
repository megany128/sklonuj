// Admin authorization helpers. Reads `profiles.is_admin` for the current
// authenticated user using the request-scoped supabase client (which carries
// the user's session cookies). Returns the bare boolean — callers decide how
// to react (redirect, 403, etc).
import { error, redirect } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

export async function isAdmin(
	supabase: SupabaseClient,
	userId: string | null | undefined
): Promise<boolean> {
	if (!userId) return false;
	const { data, error: queryError } = await supabase
		.from('profiles')
		.select('is_admin')
		.eq('id', userId)
		.maybeSingle();
	if (queryError) {
		console.error('isAdmin lookup failed:', queryError);
		return false;
	}
	if (!data || typeof data !== 'object') return false;
	// Standard parseRow narrowing pattern used elsewhere in this repo: untyped
	// Supabase rows are widened to Record<string, unknown> for safe property
	// reads, then the value itself is checked at runtime.
	const row = data as Record<string, unknown>;
	return row.is_admin === true;
}

/**
 * Layout/page guard. Anonymous users are redirected to /auth (so they can
 * sign in as an admin). Signed-in non-admins get a 404 — we don't want to
 * advertise that admin routes exist.
 */
export async function requireAdmin(
	supabase: SupabaseClient,
	userId: string | null | undefined,
	redirectFrom: string
): Promise<void> {
	if (!userId) {
		throw redirect(303, `/auth?redirectTo=${encodeURIComponent(redirectFrom)}`);
	}
	const ok = await isAdmin(supabase, userId);
	if (!ok) throw error(404, 'Not found');
}

/**
 * Returns a service-role client for admin write operations on RLS-locked
 * tables (content_reports has no client policies, so a regular user-scoped
 * client cannot mutate it). Caller MUST have already verified admin status
 * via requireAdmin / isAdmin.
 */
export function createAdminWriteClient(): SupabaseClient {
	const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		throw error(500, 'Admin service is not configured');
	}
	return createClient(supabaseUrl, serviceRoleKey);
}
