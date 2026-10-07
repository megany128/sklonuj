import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { DrillQuestion, DrillResult, WordEntry } from '$lib/types';

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

function mount(result: DrillResult | null = null) {
	const onSubmit = vi.fn<(answer: string, meta?: { hinted: boolean }) => void>();
	render(DrillCard, {
		question,
		result,
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
		expect(onSubmit).toHaveBeenCalledWith('muzeu', { hinted: false });
	});

	it('submits via the Check button', async () => {
		const onSubmit = mount();
		await page.getByRole('textbox').fill('muzeu');
		await page.getByRole('button', { name: 'Check' }).click();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith('muzeu', { hinted: false });
	});

	it('submits via the form itself (mobile keyboard action key, no Enter keydown)', async () => {
		const onSubmit = mount();
		const input = page.getByRole('textbox');
		await input.fill('muzeu');
		const form = input.element().closest('form');
		expect(form).not.toBeNull();
		form?.requestSubmit();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith('muzeu', { hinted: false });
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
		expect(onSubmit.mock.calls).toEqual([['muzeu', { hinted: false }], ['__advance__']]);
	});
});

describe('DrillCard hints', () => {
	beforeEach(() => cleanup());

	it('Enter on an empty box opens a hint, and the answer is reported as hinted', async () => {
		const onSubmit = mount();
		const input = page.getByRole('textbox');
		await input.click();
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Needs')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
		await input.fill('muzeu');
		await userEvent.keyboard('{Enter}');
		expect(onSubmit).toHaveBeenCalledWith('muzeu', { hinted: true });
	});

	it('the Hint button steps through to the first letters', async () => {
		mount();
		await page.getByRole('button', { name: 'Hint' }).click();
		await page.getByRole('button', { name: 'Another hint' }).click();
		await page.getByRole('button', { name: 'Another hint' }).click();
		await expect.element(page.getByText('Starts with')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Another hint' }))
			.not.toBeInTheDocument();
	});
	it('Enter on an empty box skips once every hint is open', async () => {
		const onSubmit = mount();
		await page.getByRole('textbox').click();
		for (let i = 0; i < 3; i++) await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Starts with')).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();
		await userEvent.keyboard('{Enter}');
		expect(onSubmit).toHaveBeenCalledWith('__skip__');
	});
});

describe('DrillCard retype after a miss', () => {
	beforeEach(() => cleanup());

	it('accepts the exact form, then Enter moves on', async () => {
		// The page grades the answer; DrillCard shows that result once submitted.
		const onSubmit = mount({ question, userAnswer: 'muzea', correct: false, nearMiss: false });
		await page.getByRole('textbox').fill('muzea');
		await userEvent.keyboard('{Enter}');
		const retype = page.getByLabelText('Practice: type the correct form');
		await expect.element(retype).toBeInTheDocument();
		await retype.fill('muzea');
		await userEvent.keyboard('{Enter}');
		// A wrong retype keeps the box open instead of advancing.
		expect(onSubmit.mock.calls.at(-1)).toEqual(['muzea', { hinted: false }]);
		await retype.fill('muzeu');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText("That's right")).toBeInTheDocument();
		await userEvent.keyboard('{Enter}');
		expect(onSubmit.mock.calls.at(-1)).toEqual(['__advance__']);
	});
});

// The chip in the empty box drops in the dictionary form so learners only
// change the ending; Tab does the same while the box is empty.
describe('DrillCard copy-the-word chip', () => {
	beforeEach(() => cleanup());

	it('Tab in the empty box fills the dictionary form with the caret at the end', async () => {
		mount();
		const input = page.getByRole('textbox');
		await input.click();
		await userEvent.keyboard('{Tab}');
		await expect.element(input).toHaveValue('muzeum');
		const el = input.element();
		if (!(el instanceof HTMLInputElement)) throw new Error('not an input');
		expect(document.activeElement).toBe(el);
		expect(el.selectionStart).toBe('muzeum'.length);
		expect(el.selectionEnd).toBe('muzeum'.length);
		await expect
			.element(page.getByRole('button', { name: 'Fill in muzeum' }))
			.not.toBeInTheDocument();
	});

	it('tapping the chip fills the box, and the answer is not marked hinted', async () => {
		const onSubmit = mount();
		await page.getByRole('button', { name: 'Fill in muzeum' }).click();
		const input = page.getByRole('textbox');
		await expect.element(input).toHaveValue('muzeum');
		await userEvent.keyboard('{Backspace}{Backspace}u');
		await expect.element(input).toHaveValue('muzeu');
		await userEvent.keyboard('{Enter}');
		expect(onSubmit).toHaveBeenCalledWith('muzeu', { hinted: false });
	});

	it('Tab moves focus as usual once the box has text', async () => {
		mount();
		const input = page.getByRole('textbox');
		await input.fill('muz');
		await userEvent.keyboard('{Tab}');
		await expect.element(input).toHaveValue('muz');
		expect(document.activeElement).not.toBe(input.element());
	});

	it('is gone once the answer is submitted', async () => {
		mount({ question, userAnswer: 'muzeu', correct: true, nearMiss: false });
		await page.getByRole('textbox').fill('muzeu');
		await userEvent.keyboard('{Enter}');
		await expect
			.element(page.getByRole('button', { name: 'Fill in muzeum' }))
			.not.toBeInTheDocument();
	});
});
