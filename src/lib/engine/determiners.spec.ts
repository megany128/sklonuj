import { describe, it, expect } from 'vitest';
import {
	demonstrativeFrames,
	determinerSentenceTemplates,
	loadDeclinableBank,
	loadDeterminerBank,
	loadDeterminerTemplates,
	pickDeterminerQuestion,
	reviewDeterminerQuestion
} from './determiners';
import { checkAdjectiveAnswer, getAdjectiveForm, getAdjectiveGenderKey } from './adjective-drill';
import { applyPrepositionVoicing } from './preposition-voicing';
import { focusDef, templatesForFocus } from './focus';
import { adjectiveCellKey, isCellKey } from './spacing';
import type { AdjectiveEntry, AdjectiveGenderKey, Case, Number_, Progress } from '../types';
import { ALL_ADJECTIVE_GENDER_KEYS, CASE_INDEX, LEVEL_ORDER } from '../types';
import { loadTemplates } from './drill';

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
	it('holds the seven words', () => {
		expect(bank.map((d) => d.lemma)).toEqual([
			'můj',
			'tvůj',
			'náš',
			'váš',
			'ten',
			'tenhle',
			'tento'
		]);
		expect(det('ten').paradigmType).toBe('demonstrative');
		expect(det('ten').difficulty).toBe('A2');
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
		['ten', 'n', 'pl', ['ta', 'těch', 'těm', 'ta', 'ta', 'těch', 'těmi']],
		[
			'tenhle',
			'm_anim',
			'sg',
			['tenhle', 'tohohle', 'tomuhle', 'tohohle', 'tenhle', 'tomhle', 'tímhle']
		],
		['tenhle', 'f', 'sg', ['tahle', 'téhle', 'téhle', 'tuhle', 'tahle', 'téhle', 'touhle']],
		['tenhle', 'n', 'pl', ['tahle', 'těchhle', 'těmhle', 'tahle', 'tahle', 'těchhle', 'těmihle']],
		[
			'tenhle',
			'm_anim',
			'pl',
			['tihle', 'těchhle', 'těmhle', 'tyhle', 'tihle', 'těchhle', 'těmihle']
		],
		['tento', 'm_inanim', 'sg', ['tento', 'tohoto', 'tomuto', 'tento', 'tento', 'tomto', 'tímto']],
		['tento', 'f', 'sg', ['tato', 'této', 'této', 'tuto', 'tato', 'této', 'touto']],
		['tento', 'n', 'sg', ['toto', 'tohoto', 'tomuto', 'toto', 'toto', 'tomto', 'tímto']],
		['tento', 'm_anim', 'pl', ['tito', 'těchto', 'těmto', 'tyto', 'tito', 'těchto', 'těmito']]
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
		// The sentence fixes the noun, and so the gender: every gender needs its
		// own sentence in every case and number, or those forms are never asked.
		for (const gender of ALL_ADJECTIVE_GENDER_KEYS) {
			for (const number of ['sg', 'pl'] as const) {
				for (const case_ of ALL_BUT_VOC) {
					expect(
						templates.some(
							(t) =>
								getAdjectiveGenderKey(t.noun) === gender &&
								t.template.requiredCase === case_ &&
								t.template.number === number
						),
						`${gender} ${case_} ${number}`
					).toBe(true);
				}
			}
		}
	});

	it('belongs to the determiners deck, which asks both numbers from A2', () => {
		const def = focusDef('determiners');
		expect(def.source).toBe('determiners');
		expect(def.unlockLevel).toBe('A2');
		expect(def.bothNumbers).toBe(true);
		const sentences = determinerSentenceTemplates();
		expect(templatesForFocus(sentences, 'determiners')).toHaveLength(templates.length);
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

describe('declension charts', () => {
	it('find determiners alongside adjectives', () => {
		const lemmas = new Set(loadDeclinableBank().map((e) => e.lemma));
		for (const lemma of ['nový', 'můj', 'tvůj', 'náš', 'váš', 'ten', 'tenhle', 'tento']) {
			expect(lemmas.has(lemma), lemma).toBe(true);
		}
		expect(lemmas.size).toBe(loadDeclinableBank().length);
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

describe('ten, ta, to sentences', () => {
	const frames = demonstrativeFrames();

	it('borrows the noun sentences, tagged with their own deck', () => {
		expect(frames.length).toBeGreaterThan(150);
		for (const t of frames) {
			expect(t.id.startsWith('dem:'), t.id).toBe(true);
			expect(t.topics).toEqual(['demonstratives']);
			expect(t.requiredCase).not.toBe('voc');
			expect(t.template.trimStart().startsWith('___'), t.template).toBe(false);
		}
		const def = focusDef('demonstratives');
		expect(def.source).toBe('demonstratives');
		expect(def.unlockLevel).toBe('A2');
		const sentences = determinerSentenceTemplates();
		expect(templatesForFocus(sentences, 'demonstratives')).toHaveLength(frames.length);
		expect(templatesForFocus(sentences, 'determiners')).toHaveLength(templates.length);
	});

	it('leaves out sentences that take no ten', () => {
		const texts = new Set(frames.map((t) => t.template));
		for (const text of [
			'Bratr je ___.',
			'Stal se ___.',
			'Sestra se stala ___.',
			'Chci být ___.',
			'Myji si ___.',
			'Bolí mě ___.',
			'Přijdu za ___.',
			'Odejdu do ___.'
		]) {
			expect(texts.has(text), text).toBe(false);
		}
		for (const text of [
			'Bydlím v ___.',
			'Kočka je za ___.',
			'Zabývám se ___.',
			'Bojím se ___.',
			'Čekám celou ___.',
			'Po ___ si dám kávu.'
		]) {
			expect(texts.has(text), text).toBe(true);
		}
		expect(frames.some((t) => t.template.includes('{'))).toBe(false);
	});

	it('writes a random noun into the sentence, from many paradigms and all genders', () => {
		let s = 21;
		const random = () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		};
		const nouns = new Set<string>();
		const paradigms = new Set<string>();
		const genders = new Set<string>();
		for (let i = 0; i < 300; i++) {
			const q = pickDeterminerQuestion({
				set: 'demonstratives',
				cases: ALL_BUT_VOC,
				numbers: ['sg', 'pl'],
				difficulties: ['A1', 'A2'],
				progress,
				recentTemplateIds: [],
				random
			});
			if (!q) throw new Error('no question');
			const nounForm = q.word.forms[q.number][CASE_INDEX[q.case]];
			expect(q.template.template).toContain(`___ ${nounForm}`);
			expect(q.template.template.match(/___/g)?.length).toBe(1);
			expect(q.template.nounLemma).toBe(q.word.lemma);
			expect(q.template.why.split('\n')[0]).toContain(`agrees with ${nounForm}`);
			expect(q.word.categories).not.toContain('place_name');
			nouns.add(q.word.lemma);
			paradigms.add(q.word.paradigm);
			genders.add(getAdjectiveGenderKey(q.word));
		}
		expect(nouns.size).toBeGreaterThan(150);
		expect(paradigms.size).toBeGreaterThanOrEqual(10);
		expect(genders.size).toBe(4);
	});

	it('asks ten, tenhle and tento, mostly ten, in the form that agrees with the noun', () => {
		let s = 5;
		const random = () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		};
		const expected: Record<AdjectiveGenderKey, Partial<Record<Case, string>>> = {
			m_anim: { acc: 'toho', ins: 'tím' },
			m_inanim: { acc: 'ten', ins: 'tím' },
			f: { acc: 'tu', ins: 'tou' },
			n: { acc: 'to', ins: 'tím' }
		};
		const counts = new Map<string, number>();
		for (let i = 0; i < 300; i++) {
			const q = pickDeterminerQuestion({
				set: 'demonstratives',
				cases: ['acc', 'ins'],
				numbers: ['sg'],
				difficulties: ['A1', 'A2'],
				progress,
				recentTemplateIds: [],
				random
			});
			if (!q?.adjective) throw new Error('no question');
			const lemma = q.adjective.lemma;
			counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
			expect(q.template.topics).toEqual(['demonstratives']);
			const suffix = lemma === 'tenhle' ? 'hle' : lemma === 'tento' ? 'to' : '';
			expect(q.correctAnswer).toBe(`${expected[getAdjectiveGenderKey(q.word)][q.case]}${suffix}`);
		}
		expect([...counts.keys()].sort()).toEqual(['ten', 'tenhle', 'tento']);
		expect(counts.get('ten') ?? 0).toBeGreaterThan(counts.get('tento') ?? 0);
	});

	it('takes tenhle and tento as right answers where ten is asked, in both decks', () => {
		let s = 9;
		const random = () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		};
		let checked = 0;
		for (const set of ['demonstratives', 'determiners'] as const) {
			for (let i = 0; i < 300; i++) {
				const q = pickDeterminerQuestion({
					set,
					cases: ['ins'],
					numbers: ['sg'],
					difficulties: ['A1', 'A2'],
					progress,
					recentTemplateIds: [],
					random
				});
				if (!q?.adjective || q.adjective.lemma !== 'ten' || q.word.gender !== 'f') continue;
				checked++;
				expect(q.correctAnswer).toBe('tou');
				expect(checkAdjectiveAnswer(q, 'touhle')?.correct).toBe(true);
				expect(checkAdjectiveAnswer(q, 'touto')?.correct).toBe(true);
				expect(checkAdjectiveAnswer(q, 'tu')?.correct).toBe(false);
				expect(q.template.why).toContain('Also correct: touhle, touto');
			}
		}
		expect(checked).toBeGreaterThan(5);
	});

	it('a tenhle question wants tenhle, and the Můj, tvůj, ten deck never asks it', () => {
		const pickFrom = (set: 'demonstratives' | 'determiners', seed: number) => {
			let s = seed;
			const random = () => {
				s = (s * 1664525 + 1013904223) % 4294967296;
				return s / 4294967296;
			};
			return Array.from({ length: 200 }, () =>
				pickDeterminerQuestion({
					set,
					cases: ['acc'],
					numbers: ['sg'],
					difficulties: ['A1', 'A2'],
					progress,
					recentTemplateIds: [],
					random
				})
			);
		};
		const tenhle = pickFrom('demonstratives', 4).find(
			(q) => q?.adjective?.lemma === 'tenhle' && q.word.gender === 'f'
		);
		if (!tenhle) throw new Error('no tenhle question');
		expect(checkAdjectiveAnswer(tenhle, 'tuhle')?.correct).toBe(true);
		expect(checkAdjectiveAnswer(tenhle, 'tu')?.correct).toBe(false);
		const lemmas = new Set(pickFrom('determiners', 4).map((q) => q?.adjective?.lemma));
		expect(lemmas.has('tenhle')).toBe(false);
		expect(lemmas.has('tento')).toBe(false);
	});

	it('keeps to the difficulties it is given, and asks no word below them', () => {
		for (let i = 0; i < 100; i++) {
			const q = pickDeterminerQuestion({
				set: 'demonstratives',
				cases: ['nom', 'acc', 'gen', 'loc'],
				numbers: ['sg'],
				difficulties: ['A1', 'A2'],
				progress,
				recentTemplateIds: []
			});
			if (!q?.adjective) throw new Error('no question');
			expect(['A1', 'A2']).toContain(q.template.difficulty);
			expect(['A1', 'A2']).toContain(q.word.difficulty);
		}
		// All three words are A2, so an A1-only pick has none to ask.
		expect(
			pickDeterminerQuestion({
				set: 'demonstratives',
				cases: ['nom'],
				numbers: ['sg'],
				difficulties: ['A1'],
				progress,
				recentTemplateIds: []
			})
		).toBeNull();
	});

	it('takes the spoken těma for těmi, with a note that it is colloquial', () => {
		let s = 13;
		const random = () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		};
		const seen = new Set<string>();
		for (let i = 0; i < 300; i++) {
			const q = pickDeterminerQuestion({
				set: 'demonstratives',
				cases: ['ins'],
				numbers: ['pl'],
				difficulties: ['A1', 'A2'],
				progress,
				recentTemplateIds: [],
				skipSingularFirst: true,
				random
			});
			if (!q?.adjective) throw new Error('no question');
			const lemma = q.adjective.lemma;
			seen.add(lemma);
			if (lemma === 'ten') {
				expect(q.correctAnswer).toBe('těmi');
				expect(checkAdjectiveAnswer(q, 'těma')?.correct).toBe(true);
				expect(checkAdjectiveAnswer(q, 'těmahle')?.correct).toBe(true);
				expect(q.template.why).toContain('Also correct: těmihle, těmito');
				expect(q.template.why).toContain(
					'Spoken Czech often says těma (s těma holkama); written Czech uses těmi.'
				);
			} else if (lemma === 'tenhle') {
				expect(checkAdjectiveAnswer(q, 'těmahle')?.correct).toBe(true);
				expect(checkAdjectiveAnswer(q, 'těma')?.correct).toBe(false);
				expect(q.template.why).toContain('says těmahle');
			} else {
				// Nobody says *těmato*: tento keeps its one form.
				expect(q.acceptedAnswers).toEqual(['těmito']);
				expect(q.template.why).not.toContain('Spoken Czech');
			}
		}
		expect(seen.size).toBe(3);
	});

	it('keeps the A2 singular-first gate on plurals unless told to skip it', () => {
		const ask = (skipSingularFirst: boolean) =>
			pickDeterminerQuestion({
				set: 'demonstratives',
				cases: ['ins'],
				numbers: ['pl'],
				difficulties: ['A1', 'A2'],
				progress,
				recentTemplateIds: [],
				skipSingularFirst
			});
		expect(ask(false)).toBeNull();
		expect(ask(true)).not.toBeNull();
	});

	it('keeps to the noun filter and the asked word', () => {
		for (let i = 0; i < 50; i++) {
			const q = pickDeterminerQuestion({
				set: 'demonstratives',
				lemma: 'tenhle',
				cases: ['acc', 'loc'],
				numbers: ['sg'],
				difficulties: ['A1', 'A2'],
				progress,
				recentTemplateIds: [],
				nounFilter: (w) => w.lemma === 'kniha' || w.lemma === 'dům'
			});
			if (!q?.adjective) throw new Error('no question');
			expect(q.adjective.lemma).toBe('tenhle');
			expect(['kniha', 'dům']).toContain(q.word.lemma);
		}
	});

	it('lists a frame at the level of its easiest noun, and none without nouns', () => {
		for (const frame of demonstrativeFrames()) {
			const original = loadTemplates().find((t) => `dem:${t.id}` === frame.id);
			if (!original) throw new Error(`no noun sentence for ${frame.id}`);
			expect(LEVEL_ORDER.indexOf(frame.difficulty)).toBeGreaterThanOrEqual(
				LEVEL_ORDER.indexOf(original.difficulty)
			);
		}
	});

	it('takes the spoken ty for ti and tý for té, only where they belong', () => {
		const ask = (cases: Case[], numbers: Number_[], gender: string, animate: boolean) => {
			for (let i = 0; i < 400; i++) {
				const q = pickDeterminerQuestion({
					set: 'demonstratives',
					lemma: 'ten',
					cases,
					numbers,
					difficulties: ['A1', 'A2'],
					progress,
					recentTemplateIds: [],
					skipSingularFirst: true
				});
				if (q && q.word.gender === gender && q.word.animate === animate) return q;
			}
			throw new Error('no question');
		};
		const kluci = ask(['nom'], ['pl'], 'm', true);
		expect(kluci.correctAnswer).toBe('ti');
		expect(checkAdjectiveAnswer(kluci, 'ty')?.correct).toBe(true);
		expect(checkAdjectiveAnswer(kluci, 'tyhle')?.correct).toBe(true);
		expect(kluci.template.why).toContain('Spoken Czech often says ty (ty kluci)');
		const holky = ask(['gen'], ['sg'], 'f', false);
		expect(holky.correctAnswer).toBe('té');
		expect(checkAdjectiveAnswer(holky, 'tý')?.correct).toBe(true);
		expect(holky.template.why).toContain('written Czech uses té');
		// tu (feminine accusative) has no spoken stand-in: tý stays wrong there.
		const knihu = ask(['acc'], ['sg'], 'f', false);
		expect(checkAdjectiveAnswer(knihu, 'tý')?.correct).toBe(false);
		expect(knihu.template.why).not.toContain('Spoken Czech');
	});

	it('asks a stored mistake again whatever level the learner is at now', () => {
		const atA1: Progress = { ...progress, level: 'A1' };
		// A1 opens neither the instrumental nor plurals.
		expect(
			pickDeterminerQuestion({
				set: 'demonstratives',
				lemma: 'ten',
				cases: ['ins'],
				numbers: ['pl'],
				difficulties: ['A1', 'A2', 'B1', 'B2'],
				progress: atA1,
				recentTemplateIds: []
			})
		).toBeNull();
		const q = reviewDeterminerQuestion('ten', 'ins', 'pl', atA1);
		expect(q?.adjective?.lemma).toBe('ten');
		expect(q?.correctAnswer).toBe('těmi');
		expect(reviewDeterminerQuestion('můj', 'dat', 'sg', atA1)?.adjective?.lemma).toBe('můj');
		expect(reviewDeterminerQuestion('hrad', 'gen', 'sg', atA1)).toBeNull();
	});
});
