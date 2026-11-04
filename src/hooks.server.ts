import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { createSupabaseServerClient } from '$lib/supabase-server';
import { GUEST_ID_STORAGE_KEY, isGuestId } from '$lib/engine/guest-id';
import { handlePostHogProxy, isPostHogProxyRequest } from '$lib/posthog-proxy';
import {
	anonPageKey,
	readAnonPage,
	storeAnonPage,
	ANON_PAGE_CACHE_NAME
} from '$lib/server/anon-page-cache';

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

	// Serve the shared logged-out homepage before doing any auth work. Absent in
	// `vite dev` and during prerendering, where nothing is cached.
	const anonKey = building ? null : anonPageKey(event.request, event.url);
	const anonCache = anonKey ? await event.platform?.caches.open(ANON_PAGE_CACHE_NAME) : undefined;
	if (anonKey && anonCache) {
		const cached = await readAnonPage(anonCache, anonKey);
		if (cached) return cached;
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

	// Only cookieless GETs share a render: with no cookie the response can't be
	// personalized (no auth, no guest-leaderboard window, no saved chapter).
	// Authenticated responses are explicitly no-store so per-user HTML can never
	// land in a shared cache. (Static/prerendered pages are served as assets and
	// don't reach this hook.)
	if (anonKey && anonCache && !event.locals.user) {
		const write = storeAnonPage(anonCache, anonKey, response);
		if (write) event.platform?.ctx.waitUntil(write);
	} else if (
		event.locals.user &&
		event.request.method === 'GET' &&
		(response.headers.get('content-type') ?? '').includes('text/html') &&
		!response.headers.has('Cache-Control')
	) {
		response.headers.set('Cache-Control', 'private, no-store');
	}

	return response;
};
