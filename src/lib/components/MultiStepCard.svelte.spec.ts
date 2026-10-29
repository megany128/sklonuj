import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AdjectiveEntry, MultiStepQuestion, WordEntry } from '$lib/types';

const { default: MultiStepCard } = await import('./MultiStepCard.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');

const segra: WordEntry = {
	lemma: 'ségra',
	translation: 'sister',
	gender: 'f',
	animate: false,
	paradigm: 'žena',
	difficulty: 'A2',
	categories: ['family', 'people'],
	forms: {
		sg: ['ségra', 'ségry', 'ségře', 'ségru', 'ségro', 'ségře', 'ségrou'],
		pl: ['ségry', 'ségr', 'ségrám', 'ségry', 'ségry', 'ségrách', 'ségrami']
	}
};

const forms = (sg: string[], pl: string[]) => ({ sg, pl });
const maly: AdjectiveEntry = {
	lemma: 'malý',
	translation: 'small',
	difficulty: 'A1',
	paradigmType: 'hard',
	categories: [],
	profile: 'physical_extent',
	forms: {
		m_anim: forms(
			['malý', 'malého', 'malému', 'malého', 'malý', 'malém', 'malým'],
			['malí', 'malých', 'malým', 'malé', 'malí', 'malých', 'malými']
		),
		m_inanim: forms(
			['malý', 'malého', 'malému', 'malý', 'malý', 'malém', 'malým'],
			['malé', 'malých', 'malým', 'malé', 'malé', 'malých', 'malými']
		),
		f: forms(
			['malá', 'malé', 'malé', 'malou', 'malá', 'malé', 'malou'],
			['malé', 'malých', 'malým', 'malé', 'malé', 'malých', 'malými']
		),
		n: forms(
			['malé', 'malého', 'malému', 'malé', 'malé', 'malém', 'malým'],
			['malá', 'malých', 'malým', 'malá', 'malá', 'malých', 'malými']
		)
	}
};

function question(withAdjective: boolean): MultiStepQuestion {
	return {
		word: segra,
		template: {
			id: 'ins_jdu_213',
			template: 'Jdu s ___.',
			lemmaCategory: 'people',
			requiredCase: 'ins',
			number: 'pl',
			trigger: 's',
			why: 's (with) → instrumental',
			difficulty: 'A2'
		},
		case: 'ins',
		number: 'pl',
		correctParadigm: 'žena',
		correctCase: 'ins',
		correctForm: 'ségrami',
		showCaseStep: false,
		...(withAdjective
			? { adjective: maly, correctAdjectiveForm: 'malými', acceptedAdjectiveForms: ['malými'] }
			: {})
	};
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** The paradigm and noun steps, answered right, ending on the next step. */
async function answerNounSteps() {
	await page.getByRole('button', { name: 'Feminine' }).click();
	await page.getByRole('group', { name: 'Select paradigm' }).getByRole('button').first().click();
	await nextFrame();
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.getByPlaceholder('Type the correct form...').fill('ségrami');
	await page.getByRole('button', { name: 'Check' }).click();
	await nextFrame();
	await page.getByRole('button', { name: /Continue|See Summary/ }).click();
}

const text = () => document.body.textContent?.replace(/\s+/g, ' ') ?? '';

describe('MultiStepCard preposition voicing', () => {
	beforeEach(() => cleanup());

	it('voices on the noun when the noun follows the preposition', async () => {
		render(MultiStepCard, { question: question(false), onComplete: vi.fn() });
		await answerNounSteps();
		await expect.poll(text).toContain('Jdu se ségrami');
	});

	it('voices on the adjective in the adjective step and the summary', async () => {
		render(MultiStepCard, { question: question(true), onComplete: vi.fn() });
		await answerNounSteps();
		await expect.element(page.getByPlaceholder('Type the adjective form...')).toBeInTheDocument();
		expect(text()).toMatch(/Jdu s (\(malý\))? ?ségrami/);
		expect(text()).not.toContain('Jdu se');
		await page.getByPlaceholder('Type the adjective form...').fill('malými');
		await page.getByRole('button', { name: 'Check' }).click();
		await nextFrame();
		await page.getByRole('button', { name: /See Summary/ }).click();
		await expect.poll(text).toContain('Jdu s malými ségrami');
	});
});
