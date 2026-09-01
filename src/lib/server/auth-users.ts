/**
 * Helpers for resolving auth.users rows via the Supabase admin API.
 *
 * `auth.admin.listUsers` paginates the ENTIRE auth.users table, so scanning
 * it to find a handful of ids is O(total_users / page_size) round trips.
 * `auth.admin.getUserById` is O(1) per id, so resolving N ids directly costs
 * N requests — run with bounded concurrency so a large batch doesn't open
 * hundreds of sockets at once (mirrors `src/routes/classes/[id]/+page.server.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_CONCURRENCY = 10;

/**
 * Split an array into consecutive chunks of at most `size` items.
 * Shared by callers that need to bound `.in()` filter lists or upsert payloads.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
	if (size <= 0) throw new RangeError('chunk size must be positive');
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/**
 * Resolve email addresses for exactly the given user ids.
 *
 * Returns a map of `userId -> email`. Ids that don't exist, have no email, or
 * whose lookup fails are simply absent from the map — one bad id never aborts
 * the batch.
 */
export async function resolveUserEmails(
	adminClient: SupabaseClient,
	ids: Iterable<string>,
	concurrency: number = DEFAULT_CONCURRENCY
): Promise<Map<string, string>> {
	const uniqueIds = Array.from(new Set(ids));
	const emailById = new Map<string, string>();
	if (uniqueIds.length === 0) return emailById;

	const workerCount = Math.max(1, Math.min(concurrency, uniqueIds.length));
	let cursor = 0;

	async function worker(): Promise<void> {
		while (cursor < uniqueIds.length) {
			const id = uniqueIds[cursor++];
			try {
				const { data, error } = await adminClient.auth.admin.getUserById(id);
				if (error || !data.user) continue;
				const email = data.user.email;
				if (typeof email === 'string' && email.length > 0) {
					emailById.set(data.user.id, email);
				}
			} catch (err) {
				console.error(`auth-users: getUserById(${id}) failed`, err);
			}
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return emailById;
}
