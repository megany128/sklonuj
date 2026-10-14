import { describe, it, expect } from 'vitest';
import {
	countBucket,
	countContrast,
	hasNumeralToken,
	isCountable,
	oneForm,
	twoForm,
	withCount
} from './numbers';
import { FOCUS_DEFS, focusDef, templatesForFocus } from './focus';
import {
	generateCaseIdentification,
	generateMultiStepQuestion,
	generateSentenceDrill,
	getCandidates,
	loadTemplates,
	loadWordBank
} from './drill';
import type { Difficulty, Progress, SentenceTemplate, WordEntry } from '../types';

const bank = loadWordBank();
const templates = loadTemplates();
const counting = templatesForFocus(templates, 'numbers');

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

function template(id: string): SentenceTemplate {
	const t = templates.find((x) => x.id === id);
	if (!t) throw new Error(`missing template ${id}`);
	return t;
}

function progressAt(level: Difficulty): Progress {
	return {
		level,
		caseScores: {},
		paradigmScores: {},
		lemmaScores: {},
		cellSchedule: {},
		lastSession: '',
		longestStreak: 0
	};
}

describe('numerals that agree with the noun', () => {
	it('jeden follows gender, and animacy in the accusative', () => {
		expect(oneForm(word('dům'), 'nom')).toBe('jeden');
		expect(oneForm(word('dům'), 'acc')).toBe('jeden');
		expect(oneForm(word('bratr'), 'nom')).toBe('jeden');
		expect(oneForm(word('bratr'), 'acc')).toBe('jednoho');
		expect(oneForm(word('sestra'), 'nom')).toBe('jedna');
		expect(oneForm(word('sestra'), 'acc')).toBe('jednu');
		expect(oneForm(word('auto'), 'nom')).toBe('jedno');
		expect(oneForm(word('auto'), 'acc')).toBe('jedno');
	});

	it('dva with masculine nouns, dvě with feminine and neuter', () => {
		expect(twoForm(word('bratr'))).toBe('dva');
		expect(twoForm(word('dům'))).toBe('dva');
		expect(twoForm(word('sestra'))).toBe('dvě');
		expect(twoForm(word('auto'))).toBe('dvě');
		// dítě is neuter; its plural děti takes dvě as well.
		expect(twoForm(word('dítě'))).toBe('dvě');
	});

	it('mass nouns and plural-only nouns are not counted', () => {
		expect(isCountable(word('kniha'))).toBe(true);
		expect(isCountable(word('mléko'))).toBe(false);
		expect(isCountable(word('dveře'))).toBe(false);
	});
});

describe('counting sentences', () => {
	it('sorts each sentence under its rule', () => {
		expect(countBucket(template('acc_jeden_279'))).toBe('one');
		expect(countBucket(template('acc_dva_286'))).toBe('few');
		expect(countBucket(template('nom_tri_284'))).toBe('few');
		expect(countBucket(template('gen_pet_291'))).toBe('many');
		expect(countBucket(template('gen_nekolik_297'))).toBe('many');
		expect(countBucket(template('dat_pomahat_024'))).toBeNull();
	});

	it('every Numbers sentence is a well-formed counting sentence', () => {
		expect(counting.length).toBeGreaterThanOrEqual(24);
		for (const t of counting) {
			const bucket = countBucket(t);
			expect(bucket, t.id).not.toBeNull();
			if (bucket === 'one') expect(t.number, t.id).toBe('sg');
			else expect(t.number, t.id).toBe('pl');
			// 1 and 2–4 keep the sentence's case; 5 and up is genitive.
			expect(t.requiredCase, t.id).toBe(bucket === 'many' ? 'gen' : t.countContext);
			// {dva} only makes sense before a plural, {jeden} before a singular.
			if (t.template.includes('{dva}')) expect(bucket, t.id).toBe('few');
			if (t.template.includes('{jeden}')) expect(bucket, t.id).toBe('one');
			// A 2–4 sentence that names "dva" must use the token, or it would
			// read "dva sestry".
			expect(t.template.replace(/\{\w+\}/g, ''), t.id).not.toMatch(
				/(^|\s)(dva|dvě|jeden|jedna|jedno|jednu|jednoho)(\s|$)/i
			);
		}
		// Each rule has enough sentences to practise on its own.
		for (const bucket of ['one', 'few', 'many'] as const) {
			expect(counting.filter((t) => countBucket(t) === bucket).length).toBeGreaterThanOrEqual(4);
		}
	});

	it('every counting sentence in the bank is in the Numbers deck', () => {
		for (const t of templates) {
			expect(t.countContext !== undefined, t.id).toBe(t.topics?.includes('numbers') === true);
		}
	});

	it('fills the numeral in for the word, in sentence, trigger and why', () => {
		const one = withCount(template('acc_jeden_279'), word('bratr'));
		expect(one.template).toBe('Mám jen jednoho ___.');
		expect(one.trigger).toBe('jednoho');
		expect(withCount(template('acc_jeden_279'), word('sestra')).template).toBe(
			'Mám jen jednu ___.'
		);
		expect(withCount(template('nom_jeden_280'), word('kniha')).template).toBe(
			'Na stole je jen jedna ___.'
		);
		expect(withCount(template('acc_dva_286'), word('sestra')).template).toBe('Mám dvě ___.');
		expect(withCount(template('acc_dva_286'), word('bratr')).template).toBe('Mám dva ___.');
		const plain = template('dat_pomahat_024');
		expect(withCount(plain, word('bratr'))).toBe(plain);
	});

	it('compares 1, 2–4 and 5+ in the case the sentence counts in', () => {
		expect(countContrast(template('acc_dva_286'), word('bratr'))).toBe(
			'Compare: 1 jednoho bratra · **2–4 dva bratry** · 5+ pět bratrů'
		);
		expect(countContrast(template('nom_dva_285'), word('učitelka'))).toBe(
			'Compare: 1 jedna učitelka · **2–4 dvě učitelky** · 5+ pět učitelek'
		);
		expect(countContrast(template('gen_sest_292'), word('pero'))).toBe(
			'Compare: 1 jedno pero · 2–4 dvě pera · **5+ pět per**'
		);
		expect(countContrast(template('acc_jeden_279'), word('dítě'))).toBe(
			'Compare: **1 jedno dítě** · 2–4 dvě děti · 5+ pět dětí'
		);
		expect(countContrast(template('dat_pomahat_024'), word('bratr'))).toBeNull();
		expect(countContrast(template('gen_pet_291'), word('mléko'))).toBeNull();
	});

	it('keeps the first why line, which the hints read', () => {
		const t = template('gen_pet_291');
		const made = withCount(t, word('pes'));
		expect(made.why.split('\n')[0]).toBe(t.why.split('\n')[0]);
		expect(made.why).toContain('**5+ pět psů**');
	});
});

describe('Numbers deck', () => {
	it('opens at A2 and asks singular and plural together', () => {
		const def = focusDef('numbers');
		expect(def.unlockLevel).toBe('A2');
		expect(def.bothNumbers).toBe(true);
		// The other decks leave the number setting alone.
		expect(FOCUS_DEFS.filter((d) => !d.bothNumbers).map((d) => d.id)).toEqual([
			'direction',
			'verbs'
		]);
	});

	it('a new A2 learner is held to singular-first outside the deck, not inside it', () => {
		const plural = template('gen_pet_291');
		expect(getCandidates(plural, progressAt('A2'))).toEqual([]);
		expect(
			getCandidates(plural, progressAt('A2'), { skipSingularFirst: true }).length
		).toBeGreaterThan(50);
		// A1 has no plural at all, deck or not.
		expect(getCandidates(plural, progressAt('A1'), { skipSingularFirst: true })).toEqual([]);
	});

	it.each(['A2', 'B1', 'B2'] as const)('has all three rules to ask at %s', (level) => {
		const usable = counting.filter(
			(t) => getCandidates(t, progressAt(level), { skipSingularFirst: true }).length >= 20
		);
		expect(new Set(usable.map((t) => countBucket(t)))).toEqual(new Set(['one', 'few', 'many']));
		expect(usable.length).toBeGreaterThanOrEqual(20);
	});

	it('only countable nouns are offered', () => {
		for (const t of counting) {
			for (const w of getCandidates(t, progressAt('B2'))) {
				expect(isCountable(w), `${t.id} ${w.lemma}`).toBe(true);
			}
		}
	});

	it('no question shows an unfilled numeral, whatever the word and question type', () => {
		for (const t of counting) {
			for (const w of getCandidates(t, progressAt('B2'))) {
				const made = [
					generateSentenceDrill(t, w)?.template,
					generateCaseIdentification(t, w).template,
					generateMultiStepQuestion(w, t, true)?.template
				];
				for (const q of made) {
					if (!q) continue;
					const where = `${t.id} ${w.lemma}`;
					expect(hasNumeralToken(q.template), where).toBe(false);
					expect(hasNumeralToken(q.trigger), where).toBe(false);
					expect(hasNumeralToken(q.why), where).toBe(false);
					expect(q.why, where).toContain('Compare: ');
					expect(q.why.match(/\*\*/g)?.length, where).toBe(2);
				}
			}
		}
	});

	it('the numeral in the sentence agrees with every word it is asked with', () => {
		for (const t of counting.filter((x) => x.template.includes('{dva}'))) {
			for (const w of getCandidates(t, progressAt('B2'))) {
				const sentence = generateSentenceDrill(t, w)?.template.template ?? '';
				expect(sentence, `${t.id} ${w.lemma}`).toContain(w.gender === 'm' ? 'dva ___' : 'dvě ___');
			}
		}
	});
});

describe('time units', () => {
	const UNITS = ['rok', 'měsíc', 'týden', 'den', 'hodina', 'minuta'];
	const timeSentences = counting.filter((t) =>
		Array.isArray(t.lemmaCategory) ? t.lemmaCategory.includes('count_time') : false
	);

	it('take exactly the six units, in every sentence', () => {
		expect(timeSentences.length).toBe(7);
		for (const t of timeSentences) {
			const lemmas = getCandidates(t, progressAt('A2'), { skipSingularFirst: true }).map(
				(w) => w.lemma
			);
			expect(lemmas.sort(), t.id).toEqual([...UNITS].sort());
		}
	});

	it('say "pět let", with roků still accepted', () => {
		const q = generateSentenceDrill(template('gen_pet_306'), word('rok'));
		expect(q?.correctAnswer).toBe('let');
		expect(word('rok').variantForms?.pl?.[1]).toContain('roků');
		expect(q?.template.why).toContain('Compare: 1 jeden rok · 2–4 dva roky · **5+ pět let**');
	});

	it('agree in gender: dvě hodiny, dva dny, jednu minutu', () => {
		expect(generateSentenceDrill(template('acc_dva_304'), word('hodina'))?.template.template).toBe(
			'Čekám už dvě ___.'
		);
		expect(generateSentenceDrill(template('acc_dva_304'), word('den'))?.template.template).toBe(
			'Čekám už dva ___.'
		);
		const one = generateSentenceDrill(template('acc_jeden_303'), word('minuta'));
		expect(one?.template.template).toBe('Čekám už jednu ___.');
		expect(one?.correctAnswer).toBe('minutu');
		expect(countContrast(template('gen_kolik_309'), word('hodina'))).toBe(
			'Compare: 1 jednu hodinu · 2–4 dvě hodiny · **5+ pět hodin**'
		);
	});
});
