import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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

/**
 * Send a password-reset email using the implicit auth flow.
 *
 * The default SSR browser client uses PKCE, which stores a `code_verifier` in
 * a cookie. That verifier is lost when the user opens the email link (often in
 * a different tab/context), causing the code exchange to fail. By using the
 * implicit flow for this single call, Supabase issues a plain `token_hash`
 * that the server can verify directly via `verifyOtp` — no code_verifier
 * needed.
 */
export async function sendPasswordResetEmail(email: string, redirectTo: string) {
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
	}

	const client = createClient(url, key, {
		auth: { flowType: 'implicit', persistSession: false }
	});

	return client.auth.resetPasswordForEmail(email, { redirectTo });
}
