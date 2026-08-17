import type { RequestEvent } from '@sveltejs/kit';

/**
 * Same-origin path the browser SDK posts to. Requests under this prefix are
 * forwarded to PostHog's US ingestion hosts by `handlePostHogProxy`.
 *
 * Why: ad/tracker blockers drop requests to `*.i.posthog.com` wholesale, which
 * made PostHog miss entire users (Supabase showed several heavy users with
 * thousands of answers/week and zero PostHog events). Proxying through our own
 * domain is PostHog's recommended fix.
 */
export const POSTHOG_PROXY_PREFIX = '/ingest';

const POSTHOG_INGEST_HOST = 'us.i.posthog.com';
const POSTHOG_ASSETS_HOST = 'us-assets.i.posthog.com';

/** Headers we never forward upstream — cookies are ours, not PostHog's. */
const STRIPPED_REQUEST_HEADERS = ['cookie', 'host', 'cf-connecting-ip', 'x-forwarded-for'];

export function isPostHogProxyRequest(event: RequestEvent): boolean {
	const { pathname } = event.url;
	return pathname === POSTHOG_PROXY_PREFIX || pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`);
}

/**
 * Forward a `/ingest/*` request to PostHog and return its response verbatim.
 * `/ingest/static/*` goes to the assets CDN (SDK bundles, recorder), everything
 * else to the ingestion API. The real client IP is passed via X-Forwarded-For
 * so GeoIP enrichment still works.
 */
export async function handlePostHogProxy(event: RequestEvent): Promise<Response> {
	const { pathname, search } = event.url;
	const strippedPath = pathname.slice(POSTHOG_PROXY_PREFIX.length) || '/';
	const upstreamHost = strippedPath.startsWith('/static/')
		? POSTHOG_ASSETS_HOST
		: POSTHOG_INGEST_HOST;
	const upstreamUrl = `https://${upstreamHost}${strippedPath}${search}`;

	const headers = new Headers(event.request.headers);
	for (const name of STRIPPED_REQUEST_HEADERS) headers.delete(name);
	headers.set('host', upstreamHost);
	try {
		headers.set('X-Forwarded-For', event.getClientAddress());
	} catch {
		// getClientAddress can throw during prerender/dev without a platform; skip.
	}

	const method = event.request.method;
	const hasBody = method !== 'GET' && method !== 'HEAD';
	const body = hasBody ? await event.request.arrayBuffer() : undefined;

	const upstream = await fetch(upstreamUrl, { method, headers, body, redirect: 'manual' });

	// Copy the response so headers are mutable and hop-by-hop noise is dropped.
	const responseHeaders = new Headers(upstream.headers);
	responseHeaders.delete('content-encoding');
	responseHeaders.delete('content-length');
	responseHeaders.delete('transfer-encoding');
	return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
