import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const { default: AliasName } = await import('./AliasName.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');
const { default: posthog } = await import('$lib/posthog');

const gloss = { english: 'Homemade Dumpling', note: 'The bread dumpling.' };

function nameButton(): HTMLButtonElement {
	const el = page.getByRole('button', { name: 'Domácí Knedlík' }).element();
	if (!(el instanceof HTMLButtonElement)) throw new Error('name is not a button');
	return el;
}

function touchPress(el: HTMLElement): void {
	el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
}

describe('AliasName tooltip', () => {
	beforeEach(() => cleanup());

	it('opens on hover and closes when the pointer leaves', async () => {
		render(AliasName, { name: 'Domácí Knedlík', gloss, placement: 'list' });
		await page.getByRole('button', { name: 'Domácí Knedlík' }).hover();
		await expect.element(page.getByRole('tooltip')).toHaveTextContent('Homemade Dumpling');
		await userEvent.unhover(page.getByRole('button', { name: 'Domácí Knedlík' }));
		await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
	});

	it('a tap toggles it, and keyboard focus still opens it after a tap', async () => {
		render(AliasName, { name: 'Domácí Knedlík', gloss, placement: 'list' });
		const el = nameButton();
		touchPress(el);
		el.focus();
		el.click();
		await expect.element(page.getByRole('tooltip')).toBeInTheDocument();
		el.click();
		await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();

		// Focus moves away, then comes back from the keyboard.
		el.blur();
		el.focus();
		await expect.element(page.getByRole('tooltip')).toHaveTextContent('Homemade Dumpling');
	});

	describe('Escape', () => {
		const onWindowKey = vi.fn<(e: KeyboardEvent) => void>();
		beforeEach(() => {
			onWindowKey.mockClear();
			window.addEventListener('keydown', onWindowKey);
		});
		afterEach(() => window.removeEventListener('keydown', onWindowKey));

		it('closes just the tooltip, without reaching the leaderboard around it', async () => {
			render(AliasName, { name: 'Domácí Knedlík', gloss, placement: 'list' });
			nameButton().focus();
			await expect.element(page.getByRole('tooltip')).toBeInTheDocument();
			await userEvent.keyboard('{Escape}');
			await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
			expect(onWindowKey).not.toHaveBeenCalled();
		});
	});

	it('keeps clicks on the name from reaching the banner', async () => {
		const onBanner = vi.fn();
		document.body.addEventListener('click', onBanner);
		render(AliasName, { name: 'Domácí Knedlík', gloss, placement: 'list' });
		nameButton().click();
		document.body.removeEventListener('click', onBanner);
		expect(onBanner).not.toHaveBeenCalled();
	});

	describe('analytics', () => {
		const capture = vi.spyOn(posthog, 'capture').mockImplementation(() => undefined);
		beforeEach(() => capture.mockClear());

		it('logs a view once the tooltip has stayed open', async () => {
			render(AliasName, { name: 'Domácí Knedlík', gloss, placement: 'banner', own: false });
			await page.getByRole('button', { name: 'Domácí Knedlík' }).hover();
			await new Promise((r) => setTimeout(r, 700));
			expect(capture).toHaveBeenCalledTimes(1);
			expect(capture).toHaveBeenCalledWith('leaderboard_name_tooltip_viewed', {
				alias: 'Domácí Knedlík',
				english: 'Homemade Dumpling',
				via: 'hover',
				placement: 'banner',
				own: false
			});
		});

		it('does not log a pointer just passing over the name', async () => {
			render(AliasName, { name: 'Domácí Knedlík', gloss, placement: 'list' });
			const name = page.getByRole('button', { name: 'Domácí Knedlík' });
			await name.hover();
			await userEvent.unhover(name);
			await new Promise((r) => setTimeout(r, 700));
			expect(capture).not.toHaveBeenCalled();
		});
	});
});
