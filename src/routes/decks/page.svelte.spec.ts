import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost:5173/decks'),
		params: {},
		route: { id: '/decks' },
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

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { default: DecksPage } = await import('./+page.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');

describe('Decks page', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
	});

	it('lists the grammar decks, each linking to practice with that deck', async () => {
		render(DecksPage);

		await expect
			.element(page.getByRole('heading', { name: 'Decks', level: 1 }))
			.toBeInTheDocument();
		const direction = page.getByTestId('deck-kam-kde-odkud');
		await expect.element(direction).toHaveTextContent('Kam? Kde? Odkud?');
		await expect.element(direction).toHaveTextContent('Not started');
		await expect
			.element(direction.getByRole('link', { name: 'Start' }))
			.toHaveAttribute('href', '/?deck=kam-kde-odkud');
		await expect
			.element(page.getByTestId('deck-verbs').getByRole('link', { name: 'Start' }))
			.toHaveAttribute('href', '/?deck=verbs');
	});

	it('shows saved progress and offers to continue', async () => {
		localStorage.setItem(
			'sklonuj_deck_progress',
			JSON.stringify({ direction: { attempts: 41, correct: 25, last: 1 } })
		);
		render(DecksPage);

		const direction = page.getByTestId('deck-kam-kde-odkud');
		await expect.element(direction).toHaveTextContent('61% right · 41 answered');
		await expect.element(direction.getByRole('link', { name: 'Continue' })).toBeInTheDocument();
		await expect.element(page.getByTestId('deck-verbs')).toHaveTextContent('Not started');
	});

	it('has a card for each of the 14 word patterns, linking to that pattern', async () => {
		render(DecksPage);

		await expect
			.element(page.getByTestId('pattern-hrad'))
			.toHaveAttribute('href', '/?selectParadigm=hrad');
		await expect.element(page.getByTestId('pattern-stavení')).toBeInTheDocument();
		expect(document.querySelectorAll('[data-testid^="pattern-"]').length).toBe(14);
	});
});
