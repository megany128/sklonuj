// Edge cache for the logged-out render of the homepage, so crawler sweeps don't
// run the auth check and the leaderboard query on every hit.
//
// This can't be done with a public Cache-Control header. adapter-cloudflare's
// worker saves any response that allows it into `caches.default`, and looks
// that cache up by URL alone before the app runs, ignoring cookies and `Vary`.
// A logged-in visitor would then be handed the logged-out page. So the page is
// kept in a named cache only this module reads, and every response leaves with
// a `no-cache` directive that keeps the adapter from saving it.

export const ANON_PAGE_CACHE_NAME = 'anon-pages';
const STORED_CACHE_CONTROL = 'public, s-maxage=300';
const SERVED_CACHE_CONTROL = 'no-cache';

// Routes whose cookieless render is identical for every visitor.
const CACHEABLE_PATHS: ReadonlySet<string> = new Set(['/']);

export interface PageCache {
	match(key: string): Promise<Response | undefined>;
	put(key: string, response: Response): Promise<void>;
}

/**
 * The cache key for a request that may share the logged-out page, or null if it
 * must be rendered for its sender. Any cookie opts out: it may carry a session
 * or a guest id, both of which change the render.
 *
 * Reads the raw request URL, not `event.url`: SvelteKit strips `/__data.json`
 * from the latter, so a data request would look like the page and get its HTML.
 */
export function anonPageKey(request: Request): string | null {
	if (request.method !== 'GET') return null;
	if (request.headers.has('cookie')) return null;
	const url = new URL(request.url);
	return CACHEABLE_PATHS.has(url.pathname) ? url.href : null;
}

/** The stored page ready to serve, or null on a miss. Cache failures count as misses. */
export async function readAnonPage(cache: PageCache, key: string): Promise<Response | null> {
	try {
		const cached = await cache.match(key);
		if (!cached) return null;
		const served = new Response(cached.body, cached);
		served.headers.set('Cache-Control', SERVED_CACHE_CONTROL);
		return served;
	} catch (e: unknown) {
		console.error('anon page cache: read failed', e);
		return null;
	}
}

/**
 * Stores a copy of a freshly rendered page and marks the original so the adapter
 * won't save it. Returns the pending write, for `waitUntil`, or null if the
 * response isn't storable.
 */
export function storeAnonPage(
	cache: PageCache,
	key: string,
	response: Response
): Promise<void> | null {
	const storable =
		response.status === 200 &&
		!response.headers.has('Set-Cookie') &&
		(response.headers.get('content-type') ?? '').includes('text/html');

	let write: Promise<void> | null = null;
	if (storable) {
		const copy = new Response(response.clone().body, response);
		copy.headers.set('Cache-Control', STORED_CACHE_CONTROL);
		write = cache.put(key, copy).catch((e: unknown) => {
			console.error('anon page cache: write failed', e);
		});
	}
	response.headers.set('Cache-Control', SERVED_CACHE_CONTROL);
	return write;
}
