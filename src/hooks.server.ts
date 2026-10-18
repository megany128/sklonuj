import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { createSupabaseServerClient } from '$lib/supabase-server';
import { GUEST_ID_STORAGE_KEY, isGuestId } from '$lib/engine/guest-id';
import { handlePostHogProxy, isPostHogProxyRequest } from '$lib/posthog-proxy';

export const handle: Handle = async ({ event, resolve }) => {
	// Redirect www to apex domain
	if (event.url.hostname === 'www.sklonuj.com') {
		return new Response(null, {
			status: 301,
			headers: { Location: `https://sklonuj.com${event.url.pathname}${event.url.search}` }
		});
	}

	// PostHog reverse proxy — must run before auth/CSP so analytics requests
	// never touch Supabase and aren't blocked by tracker lists.
	if (isPostHogProxyRequest(event)) {
		return handlePostHogProxy(event);
	}

	if (building) {
		// Prerendering runs this hook with no request context, no cookies, and no
		// Supabase env (the CI build doesn't inject PUBLIC_SUPABASE_*). Prerendered
		// pages carry no per-user data, so render them anonymously instead of
		// constructing a Supabase client that would throw. Security headers below
		// still apply; the _headers file covers the emitted static files at runtime.
		event.locals.user = null;
		event.locals.guestId = null;
	} else {
		const supabase = createSupabaseServerClient(event.cookies);
		event.locals.supabase = supabase;

		const {
			data: { user }
		} = await supabase.auth.getUser();

		event.locals.user = user;

		// Anonymous visitors mirror their localStorage guest id into a cookie so the
		// global leaderboard can include them (and window around them during SSR).
		// Parsed for every request; consumers decide whether it applies to a
		// signed-in user (it never does for scoring — see computeGlobalLeaderboard).
		const guestCookie = event.cookies.get(GUEST_ID_STORAGE_KEY);
		event.locals.guestId = isGuestId(guestCookie) ? guestCookie.toLowerCase() : null;
	}

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
		// To remove it, we would need to refactor GTM to load via external script or use a nonce.
		// Keep this in sync with the _headers file (which covers static/prerendered responses).
		"default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://*.supabase.co; media-src 'self' https://audio.sklonuj.com; connect-src 'self' https://*.supabase.co https://accounts.google.com https://www.google-analytics.com https://cloudflareinsights.com https://us.i.posthog.com https://us-assets.i.posthog.com; frame-src https://challenges.cloudflare.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com"
	);

	// Edge-cache the homepage for crawler/bot sweeps so repeated hits are served
	// from Cloudflare's CDN instead of re-invoking the function every time.
	// Only cookieless GETs are cached: with no cookie the response can't be
	// personalized (no auth, no guest-leaderboard window, no saved chapter), so
	// it's the generic render and safe to share. Authenticated responses are
	// explicitly no-store so per-user HTML can never land in a shared cache.
	// (Static/prerendered pages are already CDN-cached as assets and don't reach
	// this hook.)
	if (
		event.request.method === 'GET' &&
		(response.headers.get('content-type') ?? '').includes('text/html') &&
		!response.headers.has('Cache-Control')
	) {
		if (event.locals.user) {
			response.headers.set('Cache-Control', 'private, no-store');
		} else if (
			CACHEABLE_ANON_PATHS.has(event.url.pathname) &&
			!event.request.headers.get('cookie')
		) {
			response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
			response.headers.append('Vary', 'Cookie');
		}
	}

	return response;
};

// Dynamic (non-prerendered) routes whose cookieless render is identical for
// every visitor — safe to serve from the CDN cache. The homepage is the hot
// path crawlers hammer; personalization happens client-side after load.
const CACHEABLE_ANON_PATHS = new Set(['/']);
