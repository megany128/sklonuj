import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { DrillQuestion, WordEntry } from '$lib/types';

const { default: DrillCard } = await import('./DrillCard.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');

const muzeum: WordEntry = {
	lemma: 'muzeum',
	translation: 'museum',
	gender: 'n',
	animate: false,
	paradigm: 'město',
	difficulty: 'A1',
	categories: ['places'],
	forms: {
		sg: ['muzeum', 'muzea', 'muzeu', 'muzeum', 'muzeum', 'muzeu', 'muzeem'],
		pl: ['muzea', 'muzeí', 'muzeím', 'muzea', 'muzea', 'muzeích', 'muzei']
	}
};

const question: DrillQuestion = {
	word: muzeum,
	template: {
		id: 'dat_naproti_097',
		template: 'Bydlím naproti ___.',
		lemmaCategory: 'places',
		requiredCase: 'dat',
		number: 'sg',
		trigger: 'naproti',
		why: "'Naproti' (opposite/across from) always takes the dative case.",
		difficulty: 'A2'
	},
	correctAnswer: 'muzeu',
	case: 'dat',
	number: 'sg',
	drillType: 'sentence_fill_in',
	wordCategory: 'noun'
};

function mount() {
	const onSubmit = vi.fn<(answer: string) => void>();
	render(DrillCard, {
		question,
		result: null,
		onSubmit,
		onSpeak: null,
		selectedCases: ['dat'],
		soundEnabled: false
	});
	return onSubmit;
}

// Typed drills used to rely solely on an Enter keydown to submit. Android
// keyboards often deliver a composition keydown instead of "Enter", which left
// learners with no way to check an answer (content report, 2026-09-12). The
// input now lives in a real form with a visible Check/Skip button, so the
// keyboard's action key and a tap both work; Enter must still submit exactly once.
describe('DrillCard typed answer submission', () => {
	beforeEach(() => cleanup());

	it('submits once on Enter', async () => {
		const onSubmit = mount();
		const input = page.getByRole('textbox');
		await input.fill('muzeu');
		await userEvent.keyboard('{Enter}');
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith('muzeu');
	});

	it('submits via the Check button', async () => {
		const onSubmit = mount();
		await page.getByRole('textbox').fill('muzeu');
		await page.getByRole('button', { name: 'Check' }).click();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith('muzeu');
	});

	it('submits via the form itself (mobile keyboard action key, no Enter keydown)', async () => {
		const onSubmit = mount();
		const input = page.getByRole('textbox');
		await input.fill('muzeu');
		const form = input.element().closest('form');
		expect(form).not.toBeNull();
		form?.requestSubmit();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith('muzeu');
	});

	it('offers Skip while the input is empty and reports a skip', async () => {
		const onSubmit = mount();
		await expect.element(page.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Skip' }).click();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith('__skip__');
	});

	it('a second Enter advances instead of resubmitting the answer', async () => {
		const onSubmit = mount();
		await page.getByRole('textbox').fill('muzeu');
		await userEvent.keyboard('{Enter}');
		await userEvent.keyboard('{Enter}');
		// The window handler turns Enter-after-submit into the advance sentinel;
		// the answer itself must not be submitted again.
		expect(onSubmit.mock.calls).toEqual([['muzeu'], ['__advance__']]);
	});
});
