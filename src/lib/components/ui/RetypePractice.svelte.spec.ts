import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const { default: RetypePractice } = await import('./RetypePractice.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');

describe('RetypePractice accents', () => {
	beforeEach(() => cleanup());

	it('accepts missing accents and reminds with the form that matched', async () => {
		render(RetypePractice, {
			accepted: ['příteli', 'přítelovi'],
			canAdvance: true,
			onAdvance: vi.fn()
		});
		await page.getByLabelText('Practice: type the correct form').fill('pritelovi');
		await userEvent.keyboard('{Enter}');
		// The second accepted form matched, so the reminder shows it, not příteli.
		await expect
			.element(page.getByText('Right letters — mind the accents: přítelovi'))
			.toBeInTheDocument();
	});

	it('still rejects different letters', async () => {
		render(RetypePractice, { accepted: ['příteli'], canAdvance: true, onAdvance: vi.fn() });
		const box = page.getByLabelText('Practice: type the correct form');
		await box.fill('pritela');
		await userEvent.keyboard('{Enter}');
		await expect.element(box).toBeInTheDocument();
		await expect.element(page.getByText(/mind the accents/)).not.toBeInTheDocument();
	});
});
