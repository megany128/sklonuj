import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AdjectiveEntry, DrillQuestion, DrillResult, WordEntry } from '$lib/types';

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

// Adjective drills carry an unrelated placeholder noun in `word`; the lemma the
// learner declines lives in `adjective`.
const humor: WordEntry = {
	lemma: 'humor',
	translation: 'humour',
	gender: 'm',
	animate: false,
	paradigm: 'hrad',
	difficulty: 'B1',
	categories: ['abstract'],
	forms: {
		sg: ['humor', 'humoru', 'humoru', 'humor', 'humore', 'humoru', 'humorem'],
		pl: ['humory', 'humorů', 'humorům', 'humory', 'humory', 'humorech', 'humory']
	}
};

const maly: AdjectiveEntry = {
	lemma: 'malý',
	translation: 'small',
	difficulty: 'A1',
	paradigmType: 'hard',
	categories: ['places'],
	profile: 'physical_extent',
	forms: {
		m_anim: {
			sg: ['malý', 'malého', 'malému', 'malého', 'malý', 'malém', 'malým'],
			pl: ['malí', 'malých', 'malým', 'malé', 'malí', 'malých', 'malými']
		},
		m_inanim: {
			sg: ['malý', 'malého', 'malému', 'malý', 'malý', 'malém', 'malým'],
			pl: ['malé', 'malých', 'malým', 'malé', 'malé', 'malých', 'malými']
		},
		f: {
			sg: ['malá', 'malé', 'malé', 'malou', 'malá', 'malé', 'malou'],
			pl: ['malé', 'malých', 'malým', 'malé', 'malé', 'malých', 'malými']
		},
		n: {
			sg: ['malé', 'malého', 'malému', 'malé', 'malé', 'malém', 'malým'],
			pl: ['malá', 'malých', 'malým', 'malá', 'malá', 'malých', 'malými']
		}
	}
};

const adjectiveQuestion: DrillQuestion = {
	word: humor,
	adjective: maly,
	template: {
		id: 'adj_loc_v_obchode',
		template: 'Jsem v ___ obchodě.',
		lemmaCategory: 'places',
		requiredCase: 'loc',
		number: 'sg',
		requiredGender: 'm',
		requiredAnimate: false,
		trigger: 'v',
		why: "'V' (in) takes the locative case for location.",
		difficulty: 'A1'
	},
	correctAnswer: 'malém',
	case: 'loc',
	number: 'sg',
	drillType: 'sentence_fill_in',
	wordCategory: 'adjective'
};

function mount(result: DrillResult | null = null, q: DrillQuestion = question) {
	const onSubmit = vi.fn<(answer: string, meta?: { hinted: boolean }) => void>();
	render(DrillCard, {
		question: q,
		result,
		onSubmit,
		onSpeak: null,
		selectedCases: [q.case],
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
		// The card focuses the box a frame after mount; let that land first so it
		// can't pull focus back after the Tab.
		await expect.element(input).toHaveFocus();
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

// The sr-only label names the word being declined. Adjective drills used to
// read out the placeholder noun ("form of humor") while the card showed "malý".
describe('DrillCard answer label', () => {
	beforeEach(() => cleanup());

	it('names the noun for a noun fill-in', async () => {
		mount();
		await expect
			.element(page.getByLabelText('Type the correct form of muzeum to fill in the blank'))
			.toBeInTheDocument();
	});

	it('names the adjective, not the placeholder noun, for an adjective fill-in', async () => {
		mount(null, adjectiveQuestion);
		await expect
			.element(page.getByLabelText('Type the correct form of malý to fill in the blank'))
			.toBeInTheDocument();
		await expect.element(page.getByLabelText(/humor/)).not.toBeInTheDocument();
	});

	it('names the adjective for adjective form production', async () => {
		mount(null, { ...adjectiveQuestion, drillType: 'form_production' });
		await expect.element(page.getByLabelText(/form of malý$/)).toBeInTheDocument();
		await expect.element(page.getByLabelText(/humor/)).not.toBeInTheDocument();
	});
});

// "Which case?" choices come from the cases the learner's level covers: an
// A1 learner was offered Vocative, which A1 hasn't unlocked.
describe('DrillCard adjective feedback', () => {
	beforeEach(() => cleanup());

	// The sentence names its noun; `word` is a stand-in of the same gender.
	const inShop: DrillQuestion = {
		...adjectiveQuestion,
		template: { ...adjectiveQuestion.template, nounLemma: 'obchod' }
	};

	it('shows the phrase with the sentence noun, not the stand-in', async () => {
		mount({ question: inShop, userAnswer: 'malém', correct: true, nearMiss: false }, inShop);
		await page.getByRole('textbox').fill('malém');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('malý obchod →')).toBeInTheDocument();
		await expect.element(page.getByText('malém obchodě', { exact: true })).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('humor');
	});

	it('names the gender even when the form is also another case', async () => {
		// "toho" is the masculine animate accusative and also a genitive.
		const { loadDeterminerBank } = await import('$lib/engine/determiners');
		const ten = loadDeterminerBank().find((d) => d.lemma === 'ten');
		if (!ten) throw new Error('no ten');
		const stul: WordEntry = { ...humor, lemma: 'stůl' };
		const q: DrillQuestion = {
			...adjectiveQuestion,
			word: stul,
			adjective: ten,
			template: {
				...adjectiveQuestion.template,
				template: 'Vidím ___ stůl.',
				requiredCase: 'acc',
				nounLemma: undefined
			},
			case: 'acc',
			correctAnswer: 'ten'
		};
		mount(
			{
				question: q,
				userAnswer: 'toho',
				correct: false,
				nearMiss: false,
				accidentalCase: { case: 'gen', number: 'sg' }
			},
			q
		);
		await page.getByRole('textbox').fill('toho');
		await userEvent.keyboard('{Enter}');
		await expect
			.element(
				page.getByText(
					'toho is the masculine animate form — stůl is masculine inanimate, so it takes ten'
				)
			)
			.toBeInTheDocument();
	});

	it('names the sentence noun when the answer has the wrong gender', async () => {
		mount({ question: inShop, userAnswer: 'malé', correct: false, nearMiss: false }, inShop);
		await page.getByRole('textbox').fill('malé');
		await userEvent.keyboard('{Enter}');
		await expect
			.element(page.getByText('malé is the feminine form — obchod is masculine, so it takes malém'))
			.toBeInTheDocument();
	});
});

describe('DrillCard case identification choices', () => {
	beforeEach(() => cleanup());

	const caseQuestion = (correct: 'acc' | 'voc'): DrillQuestion => ({
		...question,
		template: { ...question.template, template: 'Vidím ___.' },
		correctAnswer: correct,
		case: correct,
		drillType: 'case_identification'
	});

	function mountCases(q: DrillQuestion, selectedCases: DrillQuestion['case'][]) {
		render(DrillCard, {
			question: q,
			result: null,
			onSubmit: vi.fn(),
			onSpeak: null,
			selectedCases,
			soundEnabled: false
		});
	}

	it('offers only the cases it is given, with the right one among them', async () => {
		for (let i = 0; i < 5; i++) {
			cleanup();
			mountCases(caseQuestion('acc'), ['nom', 'gen', 'acc', 'loc']);
			await expect.element(page.getByRole('button', { name: /Accusative/ })).toBeInTheDocument();
			expect(
				page.getByRole('button', { name: /Vocative|Dative|Instrumental/ }).elements()
			).toHaveLength(0);
		}
	});

	it('shows the declined form in place of the dictionary form once answered', async () => {
		const q = caseQuestion('acc');
		render(DrillCard, {
			question: q,
			result: { question: q, userAnswer: 'acc', correct: true, nearMiss: false },
			onSubmit: vi.fn(),
			onSpeak: null,
			selectedCases: ['nom', 'acc'],
			soundEnabled: false
		});
		const word = page.getByTestId('case-id-word');
		await expect.element(word).toHaveTextContent('(muzeum)');
		await page.getByRole('button', { name: /Accusative/ }).click();
		await expect.element(word).toHaveTextContent('muzeum');
		await expect.element(word).not.toHaveTextContent('(');
	});

	it('still offers the right case when the list is short and leaves it out', async () => {
		mountCases(caseQuestion('voc'), ['nom', 'acc']);
		await expect.element(page.getByRole('button', { name: /Vocative/ })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Nominative/ })).toBeInTheDocument();
	});
});

// The pivo Easter egg hides the system cursor on the card. Its cleanup used to
// read the bound card element after the {#key} block had already unset it, so
// it threw and the next question kept the pivo answer locked in the box.
describe('DrillCard after a pivo question', () => {
	beforeEach(() => cleanup());

	it('the next question gets a fresh, typeable box', async () => {
		const pivo: WordEntry = {
			lemma: 'pivo',
			translation: 'beer',
			gender: 'n',
			animate: false,
			paradigm: 'město',
			difficulty: 'A1',
			categories: ['drinks'],
			forms: {
				sg: ['pivo', 'piva', 'pivu', 'pivo', 'pivo', 'pivu', 'pivem'],
				pl: ['piva', 'piv', 'pivům', 'piva', 'piva', 'pivech', 'pivy']
			}
		};
		const pivoQuestion: DrillQuestion = {
			...question,
			word: pivo,
			correctAnswer: 'pivu',
			drillType: 'form_production'
		};
		const onSubmit = vi.fn<(answer: string, meta?: { hinted: boolean }) => void>();
		const props = {
			question: pivoQuestion,
			result: null,
			onSubmit,
			onSpeak: null,
			selectedCases: [pivoQuestion.case],
			soundEnabled: false
		};
		const { rerender } = render(DrillCard, props);
		await page.getByRole('textbox').fill('pivu');
		await userEvent.keyboard('{Enter}');
		const result: DrillResult = {
			question: pivoQuestion,
			userAnswer: 'pivu',
			correct: true,
			nearMiss: false
		};
		await rerender({ ...props, result });
		await rerender({ ...props, question, result: null });
		const input = page.getByRole('textbox');
		await expect.element(input).toBeEnabled();
		await expect.element(input).toHaveValue('');
	});
});
