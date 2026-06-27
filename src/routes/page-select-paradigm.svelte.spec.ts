import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost:5173/?selectParadigm=pán'),
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

describe('?selectParadigm= URL param', () => {
	beforeEach(() => {
		cleanup();
	});

	it('shows the paradigm filter banner when set to a valid paradigm', async () => {
		render(Page);

		const banner = page.getByText(/practicing the/i);
		await expect.element(banner).toBeInTheDocument();

		const clearBtn = page.getByRole('button', { name: /clear filter/i });
		await expect.element(clearBtn).toBeInTheDocument();
	});
});
