import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const { default: LookupSearch } = await import('./LookupSearch.svelte');
const { default: DeclensionTable } = await import('./DeclensionTable.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');
const { getDictionary } = await import('$lib/engine/dictionary');

// The lookup dictionary is loaded on demand. These run in order: the tests
// before "shows the table of a dictionary-only word" see it not yet loaded.
describe('lookup with the on-demand dictionary', () => {
	beforeEach(() => cleanup());

	it('does not load the dictionary for a word that is in the word bank', async () => {
		render(DeclensionTable, { selectedLemma: 'kniha', alwaysExpanded: true });
		await expect.element(page.getByText('knihou').first()).toBeInTheDocument();
		expect(getDictionary()).toBeNull();
	});

	it('does not load it when the parent fills the search box with a drill word', async () => {
		render(LookupSearch, { query: 'kniha', onSelect: vi.fn() });
		await expect
			.element(page.getByRole('combobox', { name: 'Search for a Czech word' }))
			.toHaveValue('kniha');
		await new Promise((r) => setTimeout(r, 300));
		expect(getDictionary()).toBeNull();
	});

	it('shows the table of a dictionary-only word, and says it is looking it up meanwhile', async () => {
		render(DeclensionTable, { selectedLemma: 'abakus', alwaysExpanded: true });
		// Not žena's table while the dictionary is on its way.
		expect(document.body.textContent).toContain('Looking up abakus');
		expect(document.body.textContent).not.toContain('ženou');
		await expect.element(page.getByText('abacích').first()).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('Looking up');
	});

	it('suggests bank words and, once typing has loaded it, dictionary words', async () => {
		render(LookupSearch, { onSelect: vi.fn() });
		const input = page.getByRole('combobox', { name: 'Search for a Czech word' });

		await input.fill('kni');
		await expect.element(page.getByRole('option', { name: /kniha/ }).first()).toBeInTheDocument();

		// abakus is only in the dictionary.
		await input.fill('abak');
		await expect.element(page.getByRole('option', { name: /abakus/ }).first()).toBeInTheDocument();
	});
});
