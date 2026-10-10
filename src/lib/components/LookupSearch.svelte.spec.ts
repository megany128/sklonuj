import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const { default: LookupSearch } = await import('./LookupSearch.svelte');
const { default: DeclensionTable } = await import('./DeclensionTable.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');
const { getDictionary } = await import('$lib/engine/dictionary');

// The lookup dictionary is loaded on demand. These run in order: the first
// test is the only one that sees it not yet loaded.
describe('lookup with the on-demand dictionary', () => {
	beforeEach(() => cleanup());

	it('does not load the dictionary for a word that is in the word bank', async () => {
		render(DeclensionTable, { selectedLemma: 'kniha', alwaysExpanded: true });
		await expect.element(page.getByText('knihou').first()).toBeInTheDocument();
		expect(getDictionary()).toBeNull();
	});

	it('suggests bank words at once and dictionary words once it has loaded', async () => {
		const onSelect = vi.fn();
		render(LookupSearch, { onSelect });
		const input = page.getByRole('combobox', { name: 'Search for a Czech word' });

		await input.fill('kni');
		await expect.element(page.getByRole('option', { name: /kniha/ }).first()).toBeInTheDocument();

		// abakus is only in the dictionary.
		await input.fill('abak');
		await expect.element(page.getByRole('option', { name: /abakus/ }).first()).toBeInTheDocument();
		expect(getDictionary()).not.toBeNull();
	});

	it('shows the table of a dictionary-only word', async () => {
		render(DeclensionTable, { selectedLemma: 'abakus', alwaysExpanded: true });
		await expect.element(page.getByText('abacích').first()).toBeInTheDocument();
	});
});
