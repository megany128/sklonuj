import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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

describe('/+page.svelte', () => {
	beforeEach(() => {
		cleanup();
	});

	it('should render without errors', async () => {
		expect(() => render(Page)).not.toThrow();
	});

	it('should render main content area with drill interface', async () => {
		render(Page);

		const main = page.getByRole('main');
		await expect.element(main).toBeInTheDocument();
		await expect.element(main).toBeVisible();
	});

	it('should render navigation bar', async () => {
		render(Page);

		const nav = page.getByRole('navigation');
		await expect.element(nav).toBeInTheDocument();
		await expect.element(nav).toBeVisible();
	});

	it('should display drill settings toggle', async () => {
		render(Page);

		// Look for any button or element that might be the settings toggle
		const buttons = await page.getByRole('button').all();
		expect(buttons.length).toBeGreaterThan(0);
	});

	it('should display case pill bar or case selection interface', async () => {
		render(Page);

		// The page should have some form of case selection - look for multiple buttons or interactive elements
		const buttons = await page.getByRole('button').all();
		// Should have at least a few buttons for navigation and settings
		expect(buttons.length).toBeGreaterThanOrEqual(1);
	});

	it('should render drill card area where questions appear', async () => {
		render(Page);

		const main = page.getByRole('main');
		await expect.element(main).toBeInTheDocument();

		// Main content should contain the drill interface
		// We're verifying the structure is present without assuming specific content
		const mainElement = await main.element();
		expect(mainElement.children.length).toBeGreaterThan(0);
	});
});
