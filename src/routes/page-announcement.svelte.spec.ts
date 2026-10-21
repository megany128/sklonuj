import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost:5173/'),
		params: {},
		route: { id: '/' },
		status: 200,
		error: null,
		data: { user: null },
		form: null,
		state: {}
	},
	navigating: {
		from: null,
		to: null,
		type: null,
		willUnload: false,
		delta: 0,
		complete: Promise.resolve()
	},
	updated: { current: false, check: () => Promise.resolve(false) }
}));

vi.mock('$app/paths', () => ({
	base: '',
	assets: '',
	resolve: (path: string) => path
}));

const { default: Page } = await import('./+page.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');
const { page: appPage } = await import('$app/state');

describe("what's new banner", () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		localStorage.setItem('sklonuj_onboarded', '1');
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		appPage.url.search = '';
	});

	it('shows on the practice page and stays closed once dismissed', async () => {
		render(Page);
		const banner = page.getByTestId('whats-new-banner');
		await expect.element(banner).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Browse decks' })).toBeInTheDocument();
		await banner.getByRole('button', { name: 'Dismiss' }).click();
		await expect.element(banner).not.toBeInTheDocument();
		cleanup();
		render(Page);
		await expect.element(page.getByRole('main')).toBeInTheDocument();
		expect(page.getByTestId('whats-new-banner').elements()).toHaveLength(0);
	});

	it('stays hidden while an assignment link is still loading', async () => {
		// The assignment never arrives, so the page stays in its loading state.
		const realFetch = globalThis.fetch;
		vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
			String(input).includes('assignment') ? new Promise(() => {}) : realFetch(input, init)
		);
		appPage.url.search = '?assignment=abc123';
		render(Page);
		await expect.element(page.getByRole('main')).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, 300));
		expect(page.getByTestId('whats-new-banner').elements()).toHaveLength(0);
	});
});
