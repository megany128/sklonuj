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
const { page: appPage } = await import('$app/state');
const { setLevel } = await import('$lib/engine/progress');
const { CHAPTER_STORAGE_KEY, parseChapterSelection, serializeChapterSelection } =
	await import('$lib/engine/chapter-selection');

const DECK_QUERY = '?deck=kam-kde-odkud';

describe('?deck= URL param', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		setLevel('A1');
		appPage.url.search = DECK_QUERY;
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

	it('leaves the deck when the case filter excludes all of its sentences', async () => {
		// The direction deck asks genitive, accusative, locative and dative.
		appPage.url.search = `${DECK_QUERY}&cases=nom,voc`;
		render(Page);

		await expect.element(page.getByRole('button', { name: /Nom/ }).first()).toBeInTheDocument();
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
	});

	it('returns to the chapter the deck was started from, even after a reload', async () => {
		const chapter = { book: 'kzk1', chapter: 'kzk1_03' } as const;
		localStorage.setItem(CHAPTER_STORAGE_KEY, serializeChapterSelection(chapter));

		render(Page);
		await expect.element(page.getByTestId('deck-banner')).toBeInTheDocument();
		// The deck runs in free practice.
		expect(parseChapterSelection(localStorage.getItem(CHAPTER_STORAGE_KEY))).toBeNull();

		// A reload builds the page again, with nothing kept in memory.
		cleanup();
		render(Page);
		await page.getByRole('button', { name: 'Leave deck' }).click();
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
		expect(parseChapterSelection(localStorage.getItem(CHAPTER_STORAGE_KEY))).toEqual(chapter);
	});

	it('goes back to that chapter when practice is opened without the deck', async () => {
		const chapter = { book: 'kzk1', chapter: 'kzk1_03' } as const;
		localStorage.setItem(CHAPTER_STORAGE_KEY, serializeChapterSelection(chapter));

		render(Page);
		await expect.element(page.getByTestId('deck-banner')).toBeInTheDocument();

		cleanup();
		appPage.url.search = '';
		render(Page);
		await expect
			.poll(() => parseChapterSelection(localStorage.getItem(CHAPTER_STORAGE_KEY)))
			.toEqual(chapter);
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
	});

	it('a word-pattern link does not bring the chapter back', async () => {
		const chapter = { book: 'kzk1', chapter: 'kzk1_03' } as const;
		localStorage.setItem(CHAPTER_STORAGE_KEY, serializeChapterSelection(chapter));

		render(Page);
		await expect.element(page.getByTestId('deck-banner')).toBeInTheDocument();

		cleanup();
		appPage.url.search = '?selectParadigm=hrad';
		render(Page);
		await expect.element(page.getByRole('button', { name: /Nom/ }).first()).toBeInTheDocument();
		expect(parseChapterSelection(localStorage.getItem(CHAPTER_STORAGE_KEY))).toBeNull();
	});

	it('the Numbers deck stays locked below A2', async () => {
		appPage.url.search = '?deck=numbers';
		setLevel('A1');
		render(Page);
		await expect.element(page.getByRole('button', { name: /Nom/ }).first()).toBeInTheDocument();
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
	});

	it('the Numbers deck at A2 hides the Number setting and asks plurals to a new learner', async () => {
		// A new A2 learner: no scores, and the level's default of singular only.
		appPage.url.search = '?deck=numbers';
		setLevel('A2');
		// The welcome tour would cover the settings button.
		localStorage.setItem('sklonuj_onboarded', '1');
		render(Page);
		await expect.element(page.getByTestId('deck-banner')).toHaveTextContent('Kolik? Numbers');

		await page.getByRole('button', { name: 'Exercise settings' }).click();
		await expect.element(page.getByRole('group', { name: 'Exercise type' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('group', { name: 'Grammatical number' }))
			.not.toBeInTheDocument();

		// Three of the deck's four kinds of sentence are plural; a fresh question
		// per render finds one quickly.
		const pluralCue =
			/jsou|pracují|tři|čtyři|pět|šest|sedm|osm|deset|dvacet|několik|hodně|málo|mnoho|Kolik|dva|dvě/;
		let sawPlural = false;
		for (let i = 0; i < 25 && !sawPlural; i++) {
			cleanup();
			render(Page);
			await expect.element(page.getByTestId('deck-banner')).toBeInTheDocument();
			// The banner's own description names numbers, so leave it out.
			const banner = page.getByTestId('deck-banner').element().textContent ?? '';
			sawPlural = pluralCue.test((document.body.textContent ?? '').replace(banner, ''));
		}
		expect(sawPlural).toBe(true);
	});

	it('the Můj, tvůj, ten deck asks for a determiner, not a noun', async () => {
		appPage.url.search = '?deck=muj-tvuj-ten';
		setLevel('A2');
		localStorage.setItem('sklonuj_onboarded', '1');
		render(Page);
		await expect.element(page.getByTestId('deck-banner')).toHaveTextContent('Můj, tvůj, ten');

		// Every question in this deck is a sentence with a typed answer, and the
		// word to decline is one of the five.
		const input = page.getByRole('textbox').first();
		await expect.element(input).toBeInTheDocument();
		const banner = page.getByTestId('deck-banner').element().textContent ?? '';
		const card = (document.body.textContent ?? '').replace(banner, '');
		expect(card).toMatch(/(můj|tvůj|náš|váš|ten)/);
		expect(card).toMatch(/Petr|Eva|Děti|Kde|To je/);

		// Leaving the deck goes back to ordinary practice.
		await page.getByRole('button', { name: 'Leave deck' }).click();
		await expect.element(page.getByTestId('deck-banner')).not.toBeInTheDocument();
	});
});
