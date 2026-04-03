import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase-server';

export const handle: Handle = async ({ event, resolve }) => {
	// Redirect www to apex domain
	if (event.url.hostname === 'www.sklonuj.com') {
		return new Response(null, {
			status: 301,
			headers: { Location: `https://sklonuj.com${event.url.pathname}${event.url.search}` }
		});
	}

	const supabase = createSupabaseServerClient(event.cookies);
	event.locals.supabase = supabase;

	const {
		data: { user }
	} = await supabase.auth.getUser();

	event.locals.user = user;

	const response = await resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
	response.headers.set(
		'Content-Security-Policy',
		// Note: 'unsafe-inline' is required for Google Analytics inline scripts in app.html
		// To remove it, we would need to refactor GTM to load via external script or use a nonce
		"default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://accounts.google.com https://www.google-analytics.com https://cloudflareinsights.com https://us.i.posthog.com https://us-assets.i.posthog.com; frame-src https://challenges.cloudflare.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com"
	);

	return response;
};
