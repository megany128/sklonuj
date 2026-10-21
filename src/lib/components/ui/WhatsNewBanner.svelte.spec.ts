import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';

const { default: WhatsNewBanner } = await import('./WhatsNewBanner.svelte');
const { render } = await import('vitest-browser-svelte');

describe('WhatsNewBanner', () => {
	it('links to its page and reports a dismissal', async () => {
		const onAction = vi.fn();
		const onDismiss = vi.fn();
		render(WhatsNewBanner, {
			announcement: {
				id: 'x',
				title: 'Decks',
				body: 'Practise one topic at a time.',
				href: '/decks',
				actionLabel: 'Browse decks',
				until: '2026-12-15'
			},
			onAction,
			onDismiss
		});
		const link = page.getByRole('link', { name: 'Browse decks' });
		await expect.element(link).toHaveAttribute('href', expect.stringMatching(/\/decks$/));
		await page.getByRole('button', { name: 'Dismiss' }).click();
		expect(onDismiss).toHaveBeenCalledOnce();
		expect(onAction).not.toHaveBeenCalled();
	});
});
