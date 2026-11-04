import { describe, it, expect } from 'vitest';
import { anonPageKey, readAnonPage, storeAnonPage, type PageCache } from './anon-page-cache';

const HOME = 'https://sklonuj.com/';

function fakeCache(): PageCache & { stored: Map<string, Response> } {
	const stored = new Map<string, Response>();
	return {
		stored,
		match: async (key) => stored.get(key)?.clone(),
		put: async (key, response) => {
			stored.set(key, response);
		}
	};
}

function homeRequest(headers: Record<string, string> = {}): Request {
	return new Request(HOME, { headers });
}

function htmlPage(status = 200, extraHeaders: Record<string, string> = {}): Response {
	return new Response('<html>logged out</html>', {
		status,
		headers: { 'content-type': 'text/html', ...extraHeaders }
	});
}

/** The rule in adapter-cloudflare's worker: it saves unless one of these is present. */
function adapterWouldSave(response: Response): boolean {
	return !/(private|no-cache|no-store)/i.test(response.headers.get('Cache-Control') ?? '');
}

describe('anonPageKey', () => {
	it('shares the homepage between cookieless visitors', () => {
		expect(anonPageKey(homeRequest())).toBe(HOME);
	});

	it('never shares a page with a visitor who sends a cookie', () => {
		const request = homeRequest({ cookie: 'sb-abc-auth-token=base64-xyz' });
		expect(anonPageKey(request)).toBeNull();
	});

	it('only covers listed paths and GET', () => {
		expect(anonPageKey(new Request(`${HOME}profile`))).toBeNull();
		expect(anonPageKey(new Request(HOME, { method: 'POST' }))).toBeNull();
	});

	it('does not treat a SvelteKit data request as the page', () => {
		expect(anonPageKey(new Request(`${HOME}__data.json?x-sveltekit-invalidated=10`))).toBeNull();
	});
});

describe('storeAnonPage', () => {
	it('stores a copy with a TTL and keeps the served response out of the adapter cache', async () => {
		const cache = fakeCache();
		const response = htmlPage();
		await storeAnonPage(cache, HOME, response);

		expect(cache.stored.get(HOME)?.headers.get('Cache-Control')).toContain('s-maxage');
		expect(adapterWouldSave(response)).toBe(false);
		expect(await response.text()).toBe('<html>logged out</html>');
	});

	it('skips errors and responses that set a cookie, still blocking the adapter', () => {
		for (const response of [htmlPage(500), htmlPage(200, { 'Set-Cookie': 'a=b' })]) {
			const cache = fakeCache();
			expect(storeAnonPage(cache, HOME, response)).toBeNull();
			expect(cache.stored.size).toBe(0);
			expect(adapterWouldSave(response)).toBe(false);
		}
	});

	it('survives a failed write', async () => {
		const cache: PageCache = {
			match: async () => undefined,
			put: async () => {
				throw new Error('cache down');
			}
		};
		await expect(storeAnonPage(cache, HOME, htmlPage())).resolves.toBeUndefined();
	});
});

describe('readAnonPage', () => {
	it('serves a stored page without letting the adapter save it again', async () => {
		const cache = fakeCache();
		await storeAnonPage(cache, HOME, htmlPage());

		const served = await readAnonPage(cache, HOME);
		expect(served).not.toBeNull();
		expect(served && adapterWouldSave(served)).toBe(false);
		expect(await served?.text()).toBe('<html>logged out</html>');
	});

	it('treats an empty or failing cache as a miss', async () => {
		expect(await readAnonPage(fakeCache(), HOME)).toBeNull();
		const failing: PageCache = {
			match: async () => {
				throw new Error('cache down');
			},
			put: async () => {}
		};
		expect(await readAnonPage(failing, HOME)).toBeNull();
	});
});
