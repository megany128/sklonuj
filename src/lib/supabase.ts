import { createBrowserClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
	if (browserClient) return browserClient;

	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
	}

	browserClient = createBrowserClient(url, key);
	return browserClient;
}
