import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';

const { default: LookupSearch } = await import('./LookupSearch.svelte');
const { render } = await import('vitest-browser-svelte');
const { getDictionary } = await import('$lib/engine/dictionary');

// In its own file so the dictionary is certainly not loaded when the first
// keystroke lands: this is the path a learner's first search takes.
describe('the first search of a visit', () => {
	it('answers from the word bank at once and loads the dictionary by typing', async () => {
		render(LookupSearch, { onSelect: vi.fn() });
		const input = page.getByRole('combobox', { name: 'Search for a Czech word' });
		expect(getDictionary()).toBeNull();

		// Bank suggestions don't wait for the download.
		await input.fill('kni');
		await expect.element(page.getByRole('option', { name: /kniha/ }).first()).toBeInTheDocument();

		// abakus is only in the dictionary, which the typing above asked for.
		await input.fill('abak');
		await expect.element(page.getByRole('option', { name: /abakus/ }).first()).toBeInTheDocument();
		expect(getDictionary()).not.toBeNull();
	});
});
