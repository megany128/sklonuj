import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ContentMode, WordMode } from '$lib/types';

const { default: DrillSettings } = await import('./DrillSettings.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');

function mount(contentMode: ContentMode, wordMode: WordMode) {
	const onSettingsChange = vi.fn();
	render(DrillSettings, {
		selectedDrillTypes: ['sentence_fill_in'],
		numberMode: 'both',
		contentMode,
		wordMode,
		pronounsUnlocked: true,
		adjectivesUnlocked: true,
		onSettingsChange
	});
	return onSettingsChange;
}

const pill = (name: string) => page.getByRole('button', { name, exact: true });

describe('DrillSettings content pills', () => {
	beforeEach(() => cleanup());

	// Adjectives-only is stored as contentMode 'nouns' + wordMode 'adjectives';
	// the Nouns pill must not read as pressed in that state.
	it('shows only Adjectives as pressed for an adjectives-only selection', async () => {
		mount('nouns', 'adjectives');
		await expect.element(pill('Adjectives')).toHaveAttribute('aria-pressed', 'true');
		await expect.element(pill('Nouns')).toHaveAttribute('aria-pressed', 'false');
		await expect.element(pill('Pronouns')).toHaveAttribute('aria-pressed', 'false');
	});

	it('shows Nouns and Adjectives as pressed when both are selected', async () => {
		mount('nouns', 'both');
		await expect.element(pill('Nouns')).toHaveAttribute('aria-pressed', 'true');
		await expect.element(pill('Adjectives')).toHaveAttribute('aria-pressed', 'true');
		await expect.element(pill('Pronouns')).toHaveAttribute('aria-pressed', 'false');
	});

	it('adds nouns back to an adjectives-only selection', async () => {
		const onSettingsChange = mount('nouns', 'adjectives');
		await pill('Nouns').click();
		expect(onSettingsChange).toHaveBeenCalledWith(
			expect.objectContaining({ contentMode: 'nouns', wordMode: 'both' })
		);
	});

	it('keeps the last selected pill on', async () => {
		const onSettingsChange = mount('nouns', 'adjectives');
		await pill('Adjectives').click();
		expect(onSettingsChange).not.toHaveBeenCalled();
	});

	it('shows a locked pill that offers its level instead of toggling', async () => {
		const onSettingsChange = vi.fn();
		const onLockedSelect = vi.fn();
		render(DrillSettings, {
			selectedDrillTypes: ['sentence_fill_in'],
			numberMode: 'sg',
			contentMode: 'nouns',
			wordMode: 'both',
			pronounsUnlocked: false,
			adjectivesUnlocked: true,
			demonstrativesUnlocked: true,
			lockedContent: [{ content: 'pronouns', unlockLevel: 'B1' }],
			onLockedSelect,
			onSettingsChange
		});
		const locked = page.getByRole('button', { name: /Pronouns/ });
		await expect.element(locked).toHaveAttribute('title', 'Unlocks at B1');
		await locked.click();
		expect(onLockedSelect).toHaveBeenCalledWith({ content: 'pronouns', unlockLevel: 'B1' });
		expect(onSettingsChange).not.toHaveBeenCalled();
	});

	it('toggles Ten, ta, to on its own, keeping the other content', async () => {
		const onSettingsChange = vi.fn();
		render(DrillSettings, {
			selectedDrillTypes: ['sentence_fill_in'],
			numberMode: 'sg',
			contentMode: 'nouns',
			wordMode: 'nouns',
			demonstrativesUnlocked: true,
			onSettingsChange
		});
		await expect.element(pill('Ten, ta, to')).toHaveAttribute('aria-pressed', 'false');
		await pill('Ten, ta, to').click();
		expect(onSettingsChange).toHaveBeenCalledWith(
			expect.objectContaining({
				contentMode: 'nouns',
				wordMode: 'nouns',
				includeDemonstratives: true
			})
		);
	});
});
