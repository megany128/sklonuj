import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost:5173/?deck=kam-kde-odkud'),
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

describe('?deck= URL param', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
	});

	it('shows the deck banner with a way back to all decks', async () => {
		render(Page);

		const banner = page.getByTestId('deck-banner');
		await expect.element(banner).toBeInTheDocument();
		await expect.element(banner).toHaveTextContent('Kam? Kde? Odkud?');
		await expect.element(page.getByRole('link', { name: 'All decks' })).toBeInTheDocument();
	});

	it('leaving the deck removes the banner', async () => {
		render(Page);

		await page.getByRole('button', { name: 'Leave deck' }).click();
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
	});

	it('picking a single case leaves the deck', async () => {
		render(Page);

		await expect.element(page.getByTestId('deck-banner')).toBeInTheDocument();
		await page.getByRole('button', { name: /Gen/ }).first().click();
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
	});
});
