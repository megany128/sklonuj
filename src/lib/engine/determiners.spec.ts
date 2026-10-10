import { describe, it, expect } from 'vitest';
import {
	determinerSentenceTemplates,
	loadDeterminerBank,
	loadDeterminerTemplates,
	pickDeterminerQuestion
} from './determiners';
import { checkAdjectiveAnswer, getAdjectiveForm, getAdjectiveGenderKey } from './adjective-drill';
import { applyPrepositionVoicing } from './preposition-voicing';
import { focusDef, templatesForFocus } from './focus';
import { adjectiveCellKey, isCellKey } from './spacing';
import type { AdjectiveEntry, AdjectiveGenderKey, Case, Number_, Progress } from '../types';
import { ALL_ADJECTIVE_GENDER_KEYS, CASE_INDEX } from '../types';

const bank = loadDeterminerBank();
const templates = loadDeterminerTemplates();

function det(lemma: string): AdjectiveEntry {
	const d = bank.find((x) => x.lemma === lemma);
	if (!d) throw new Error(`missing determiner ${lemma}`);
	return d;
}

function form(lemma: string, gender: AdjectiveGenderKey, case_: Case, number: Number_): string {
	return getAdjectiveForm(det(lemma), gender, case_, number) ?? '';
}

function variants(
	lemma: string,
	gender: AdjectiveGenderKey,
	case_: Case,
	number: Number_
): string[] {
	return det(lemma).variantForms?.[gender]?.[number]?.[CASE_INDEX[case_]] ?? [];
}

const progress: Progress = {
	level: 'A2',
	caseScores: {},
	paradigmScores: {},
	lemmaScores: {},
	cellSchedule: {},
	lastSession: '',
	longestStreak: 0
};

const ALL_BUT_VOC: Case[] = ['nom', 'gen', 'dat', 'acc', 'loc', 'ins'];

describe('determiner forms', () => {
	it('holds the five words', () => {
		expect(bank.map((d) => d.lemma)).toEqual(['můj', 'tvůj', 'náš', 'váš', 'ten']);
		expect(det('ten').paradigmType).toBe('demonstrative');
		expect(det('náš').paradigmType).toBe('possessive');
	});

	// Checked against the standard paradigm tables, not derived from the data.
	it.each<[string, AdjectiveGenderKey, Number_, string[]]>([
		['můj', 'm_anim', 'sg', ['můj', 'mého', 'mému', 'mého', 'můj', 'mém', 'mým']],
		['můj', 'm_inanim', 'sg', ['můj', 'mého', 'mému', 'můj', 'můj', 'mém', 'mým']],
		['můj', 'f', 'sg', ['moje', 'mojí', 'mojí', 'moji', 'moje', 'mojí', 'mojí']],
		['můj', 'n', 'sg', ['moje', 'mého', 'mému', 'moje', 'moje', 'mém', 'mým']],
		['můj', 'm_anim', 'pl', ['moji', 'mých', 'mým', 'moje', 'moji', 'mých', 'mými']],
		['můj', 'f', 'pl', ['moje', 'mých', 'mým', 'moje', 'moje', 'mých', 'mými']],
		['tvůj', 'm_anim', 'sg', ['tvůj', 'tvého', 'tvému', 'tvého', 'tvůj', 'tvém', 'tvým']],
		['tvůj', 'f', 'sg', ['tvoje', 'tvojí', 'tvojí', 'tvoji', 'tvoje', 'tvojí', 'tvojí']],
		['tvůj', 'n', 'pl', ['tvoje', 'tvých', 'tvým', 'tvoje', 'tvoje', 'tvých', 'tvými']],
		['náš', 'm_anim', 'sg', ['náš', 'našeho', 'našemu', 'našeho', 'náš', 'našem', 'naším']],
		['náš', 'm_inanim', 'sg', ['náš', 'našeho', 'našemu', 'náš', 'náš', 'našem', 'naším']],
		['náš', 'f', 'sg', ['naše', 'naší', 'naší', 'naši', 'naše', 'naší', 'naší']],
		['náš', 'n', 'sg', ['naše', 'našeho', 'našemu', 'naše', 'naše', 'našem', 'naším']],
		['náš', 'm_anim', 'pl', ['naši', 'našich', 'našim', 'naše', 'naši', 'našich', 'našimi']],
		['náš', 'f', 'pl', ['naše', 'našich', 'našim', 'naše', 'naše', 'našich', 'našimi']],
		['váš', 'm_anim', 'sg', ['váš', 'vašeho', 'vašemu', 'vašeho', 'váš', 'vašem', 'vaším']],
		['váš', 'f', 'sg', ['vaše', 'vaší', 'vaší', 'vaši', 'vaše', 'vaší', 'vaší']],
		['váš', 'n', 'pl', ['vaše', 'vašich', 'vašim', 'vaše', 'vaše', 'vašich', 'vašimi']],
		['ten', 'm_anim', 'sg', ['ten', 'toho', 'tomu', 'toho', 'ten', 'tom', 'tím']],
		['ten', 'm_inanim', 'sg', ['ten', 'toho', 'tomu', 'ten', 'ten', 'tom', 'tím']],
		['ten', 'f', 'sg', ['ta', 'té', 'té', 'tu', 'ta', 'té', 'tou']],
		['ten', 'n', 'sg', ['to', 'toho', 'tomu', 'to', 'to', 'tom', 'tím']],
		['ten', 'm_anim', 'pl', ['ti', 'těch', 'těm', 'ty', 'ti', 'těch', 'těmi']],
		['ten', 'm_inanim', 'pl', ['ty', 'těch', 'těm', 'ty', 'ty', 'těch', 'těmi']],
		['ten', 'f', 'pl', ['ty', 'těch', 'těm', 'ty', 'ty', 'těch', 'těmi']],
		['ten', 'n', 'pl', ['ta', 'těch', 'těm', 'ta', 'ta', 'těch', 'těmi']]
	])('%s %s %s', (lemma, gender, number, expected) => {
		expect(det(lemma).forms[gender][number]).toEqual(expected);
	});

	it('accepts the short forms of můj and tvůj beside the everyday ones', () => {
		expect(variants('můj', 'f', 'nom', 'sg')).toEqual(['má']);
		expect(variants('můj', 'f', 'acc', 'sg')).toEqual(['mou']);
		expect(variants('můj', 'f', 'gen', 'sg')).toEqual(['mé']);
		expect(variants('můj', 'f', 'ins', 'sg')).toEqual(['mou']);
		expect(variants('můj', 'n', 'nom', 'sg')).toEqual(['mé']);
		expect(variants('můj', 'm_anim', 'nom', 'pl')).toEqual(['mí']);
		expect(variants('můj', 'm_inanim', 'nom', 'pl')).toEqual(['mé']);
		expect(variants('můj', 'n', 'acc', 'pl')).toEqual(['má']);
		expect(variants('tvůj', 'f', 'acc', 'sg')).toEqual(['tvou']);
		expect(variants('tvůj', 'm_anim', 'nom', 'pl')).toEqual(['tví']);
		// Only one form exists here.
		expect(variants('můj', 'm_anim', 'gen', 'sg')).toEqual([]);
		expect(variants('náš', 'f', 'acc', 'sg')).toEqual([]);
		expect(variants('ten', 'f', 'acc', 'sg')).toEqual([]);
	});

	it('keeps the i / í pairs apart', () => {
		// moji (acc sg f, nom pl m anim) is short; mojí (gen, dat, loc, ins sg f) is long.
		expect(form('můj', 'f', 'acc', 'sg')).toBe('moji');
		expect(form('můj', 'f', 'ins', 'sg')).toBe('mojí');
		// naším (ins sg m) is long; našim (dat pl) is short.
		expect(form('náš', 'm_anim', 'ins', 'sg')).toBe('naším');
		expect(form('náš', 'm_anim', 'dat', 'pl')).toBe('našim');
	});

	it('every word has a form in every slot', () => {
		for (const d of bank) {
			for (const gender of ALL_ADJECTIVE_GENDER_KEYS) {
				for (const number of ['sg', 'pl'] as const) {
					expect(d.forms[gender][number].every((f) => f.length > 0)).toBe(true);
				}
			}
		}
	});

	it('its spacing cells are valid cell keys', () => {
		expect(isCellKey(adjectiveCellKey('possessive', 'f', 'acc', 'sg'))).toBe(true);
		expect(isCellKey(adjectiveCellKey('demonstrative', 'm_anim', 'nom', 'pl'))).toBe(true);
	});
});

describe('determiner sentences', () => {
	it('each sentence has one blank and its noun in the right form', () => {
		expect(templates.length).toBeGreaterThanOrEqual(36);
		expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
		for (const { template, noun } of templates) {
			expect(template.template.match(/___/g)?.length, template.id).toBe(1);
			const nounForm = noun.forms[template.number][CASE_INDEX[template.requiredCase]];
			expect(template.template, template.id).toContain(`___ ${nounForm}`);
			expect(template.why, template.id).toContain(`agrees with ${nounForm}`);
		}
	});

	it('no sentence has "I" or "you" as its subject, which would call for svůj', () => {
		const firstOrSecondPerson =
			/(^|\s)(já|ty|my|vy|jsem|jsi|jsme|jste|mám|máš|máme|máte|znáš|znám|hledám|vidím|bydlím|jdu|jedu|mluvím|mluvíme)(\s|$)/i;
		for (const { template } of templates) {
			expect(template.template, template.id).not.toMatch(firstOrSecondPerson);
		}
	});

	it('covers every case but the vocative, in both numbers and all four genders', () => {
		for (const number of ['sg', 'pl'] as const) {
			for (const case_ of ALL_BUT_VOC) {
				expect(
					templates.some((t) => t.template.requiredCase === case_ && t.template.number === number),
					`${case_} ${number}`
				).toBe(true);
			}
		}
		expect(templates.some((t) => t.template.requiredCase === 'voc')).toBe(false);
		expect(new Set(templates.map((t) => getAdjectiveGenderKey(t.noun)))).toEqual(
			new Set(ALL_ADJECTIVE_GENDER_KEYS)
		);
	});

	it('belongs to the determiners deck, which asks both numbers from A2', () => {
		const def = focusDef('determiners');
		expect(def.source).toBe('determiners');
		expect(def.unlockLevel).toBe('A2');
		expect(def.bothNumbers).toBe(true);
		const sentences = determinerSentenceTemplates();
		expect(templatesForFocus(sentences, 'determiners')).toHaveLength(sentences.length);
		expect(templatesForFocus(sentences, 'numbers')).toHaveLength(0);
	});

	it('v becomes ve before vašem', () => {
		const home = templates.find((t) => t.template.template === 'Petr bydlí v ___ domě.');
		if (!home) throw new Error('missing sentence');
		expect(applyPrepositionVoicing(home.template.template, 'vašem')).toBe(
			'Petr bydlí ve ___ domě.'
		);
		expect(applyPrepositionVoicing(home.template.template, 'mém')).toBe('Petr bydlí v ___ domě.');
	});
});

describe('determiner questions', () => {
	const pick = (
		random: () => number,
		cases: Case[] = ALL_BUT_VOC,
		numbers: Number_[] = ['sg', 'pl']
	) =>
		pickDeterminerQuestion({
			cases,
			numbers,
			difficulties: ['A1', 'A2'],
			progress,
			recentTemplateIds: [],
			random
		});

	function seeded(seed: number): () => number {
		let s = seed;
		return () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		};
	}

	it('asks the determiner form that agrees with the sentence noun', () => {
		const random = seeded(7);
		const lemmas = new Map<string, number>();
		for (let i = 0; i < 300; i++) {
			const q = pick(random);
			if (!q || !q.adjective) throw new Error('no question');
			lemmas.set(q.adjective.lemma, (lemmas.get(q.adjective.lemma) ?? 0) + 1);
			expect(q.wordCategory).toBe('adjective');
			expect(q.drillType).toBe('sentence_fill_in');
			expect(q.template.topics).toEqual(['determiners']);
			expect(q.correctAnswer).toBe(
				getAdjectiveForm(q.adjective, getAdjectiveGenderKey(q.word), q.case, q.number)
			);
			expect(q.word.lemma).toBe(q.template.nounLemma);
		}
		expect(new Set(lemmas.keys())).toEqual(new Set(['můj', 'tvůj', 'náš', 'váš', 'ten']));
		// With no history the five come up about equally often.
		for (const count of lemmas.values()) expect(count).toBeGreaterThan(30);
	});

	it('keeps to the cases and numbers it is given, and returns null when none fit', () => {
		const random = seeded(3);
		for (let i = 0; i < 60; i++) {
			const q = pick(random, ['loc'], ['pl']);
			expect(q?.case).toBe('loc');
			expect(q?.number).toBe('pl');
		}
		expect(pick(random, ['voc'])).toBeNull();
		expect(pick(random, ALL_BUT_VOC, [])).toBeNull();
	});

	it('grades the short form as right and a wrong gender as wrong', () => {
		const random = seeded(11);
		let checked = 0;
		for (let i = 0; i < 400 && checked < 5; i++) {
			const q = pick(random, ['acc'], ['sg']);
			if (!q?.adjective || q.adjective.lemma !== 'můj' || q.word.gender !== 'f') continue;
			checked++;
			expect(q.correctAnswer).toBe('moji');
			expect(q.template.why.split('\n')).toEqual([
				`agrees with ${q.word.forms.sg[3]} · feminine · accusative sg`,
				'Also correct: mou'
			]);
			expect(checkAdjectiveAnswer(q, 'moji')?.correct).toBe(true);
			expect(checkAdjectiveAnswer(q, 'mou')?.correct).toBe(true);
			expect(checkAdjectiveAnswer(q, 'mého')?.correct).toBe(false);
		}
		expect(checked).toBeGreaterThan(0);
	});
});
