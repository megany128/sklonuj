import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isRecord } from '../utils/is-record.ts';
import { getCandidates, loadTemplates, loadWordBank, templateTakesWord } from './drill.ts';
import {
	filterAdjectivesByTemplate,
	loadAdjectiveBank,
	loadAdjectiveTemplates
} from './adjective-drill.ts';
import type { Difficulty, Progress, SentenceTemplate, WordEntry } from '../types.ts';

const bank = loadWordBank();

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

function template(id: string): SentenceTemplate {
	const t = loadTemplates().find((x) => x.id === id);
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

describe('content sweep: glosses', () => {
	// Loanwords whose English gloss used to be the bare lemma and read as a
	// different word ("top" the garment, "post" the job, "hit" the song).
	const disambiguated = [
		'role',
		'model',
		'bar',
		'post',
		'hit',
		'index',
		'server',
		'salon',
		'minus',
		'squat',
		'underground',
		'cola',
		'techno',
		'top',
		'benefit',
		'tablet',
		'monitor',
		'argument',
		'motor',
		'kilo'
	];

	it.each(disambiguated)('%s is not glossed as itself', (lemma) => {
		const gloss = word(lemma).translation.trim().toLowerCase();
		expect(gloss).not.toBe(lemma.toLowerCase());
		expect(gloss.length).toBeGreaterThan(lemma.length);
	});

	it.each([
		['kontrola', 'control'],
		['venkov', 'country'],
		['stáří', 'age'],
		['lék', 'drug'],
		['rod', 'genus'],
		['koupě', 'bargain'],
		['kytice', 'flower'],
		['metro', 'tube'],
		['baterka', 'battery'],
		['olovo', 'lead'],
		['ples', 'ball'],
		['okupace', 'occupation']
	])('%s is no longer glossed as bare "%s"', (lemma, oldGloss) => {
		expect(word(lemma).translation).not.toBe(oldGloss);
	});

	it('no noun has an empty gloss', () => {
		expect(bank.filter((w) => w.translation.trim() === '').map((w) => w.lemma)).toEqual([]);
	});
});

describe('content sweep: sentence frames', () => {
	const cases: {
		id: string;
		level: Difficulty;
		takes: string[];
		rejects: string[];
	}[] = [
		// "___ stačí." — a span of time can be enough; a point or a date cannot.
		{
			id: 'nom_staci_074',
			level: 'B1',
			takes: ['hodina', 'týden', 'víkend', 'chvíle'],
			rejects: ['konec', 'začátek', 'počátek', 'věk', 'datum', 'ročník', 'valentýn', 'silvestr']
		},
		// A fountain is a landmark you wait at, not a room you go into or sit in.
		// ...and you walk into a café, not into a republic or a country.
		{
			id: 'gen_do_011',
			level: 'A1',
			takes: ['kavárna', 'park', 'svět'],
			rejects: ['fontána', 'republika', 'země', 'kraj']
		},
		{
			id: 'loc_v_160',
			level: 'A1',
			takes: ['kavárna', 'kino', 'bazén'],
			rejects: ['fontána', 'moře']
		},
		// "Hraju si s ___." — pets and the like, not insects, sea or wild animals.
		{
			id: 'ins_s_052',
			level: 'A2',
			takes: ['pes', 'kočka', 'křeček', 'medvídek'],
			rejects: ['hmyz', 'medúza', 'humr', 'kapr', 'velryba', 'lev', 'kráva']
		},
		// Side dishes and condiments, not whole meals.
		{
			id: 'ins_s_146',
			level: 'A2',
			takes: ['chléb', 'rýže', 'kečup'],
			rejects: ['oběd', 'večeře', 'snídaně', 'jídlo', 'pití']
		},
		{
			id: 'gen_bez_014',
			level: 'A2',
			takes: ['cukr', 'mléko', 'kečup'],
			rejects: ['oběd', 'večeře', 'snídaně', 'jídlo', 'pití']
		},
		// You live next to a building, not next to part of one.
		{
			id: 'gen_vedle_016',
			level: 'A2',
			takes: ['škola', 'park', 'fontána'],
			rejects: ['střecha', 'balkón', 'balkon', 'jeviště', 'pódium']
		},
		// "Mám ___." — things one owns, not walls, floors or street fixtures.
		{
			id: 'acc_mam_007',
			level: 'A1',
			takes: ['kniha', 'stůl', 'trouba'],
			rejects: ['stěna', 'podlaha', 'eskalátor', 'pomník', 'bankomat', 'semafor']
		},
		{ id: 'acc_vidim_166', level: 'A1', takes: ['vlak', 'tramvaj'], rejects: ['doprava'] },
		// Rain, snow and leaves fall; mushrooms and ice do not.
		{
			id: 'nom_pada_175',
			level: 'A2',
			takes: ['sníh', 'déšť', 'list', 'strom'],
			rejects: ['houba', 'led', 'květina', 'růže']
		},
		// A baby owns no car and takes no phone calls (same as the existing
		// "dům" and "Telefonuji" blocks).
		{
			id: 'gen_possess_241',
			level: 'A2',
			takes: ['bratr', 'babička'],
			rejects: ['mimino', 'miminko']
		},
		{
			id: 'acc_volat_026',
			level: 'A2',
			takes: ['lékař', 'kamarádka'],
			rejects: ['mimino', 'miminko', 'batole']
		}
	];

	it.each(cases)('$id keeps sensible nouns and drops the nonsense ones', (c) => {
		const t = template(c.id);
		for (const lemma of c.takes) expect(templateTakesWord(t, word(lemma)), lemma).toBe(true);
		for (const lemma of c.rejects) expect(templateTakesWord(t, word(lemma)), lemma).toBe(false);
	});

	it.each(cases)('$id still has a usable pool at $level', (c) => {
		expect(getCandidates(template(c.id), progressAt(c.level)).length).toBeGreaterThanOrEqual(8);
	});

	// The fountain stays a place you can wait at or walk past.
	it('fontána is still offered where a landmark fits', () => {
		expect(templateTakesWord(template('gen_u_015'), word('fontána'))).toBe(true);
	});
});

const PINNED = [
	'publicista',
	'publicistka',
	'hořčice',
	'technik',
	'titulek',
	'salón',
	'pán',
	'bufet',
	'sestřenice',
	'rohlík',
	'milionářka',
	'sekretářka',
	'golf',
	'biftek',
	'zavazadlo',
	'cyklista',
	'cyklistka',
	'moderátor',
	'ježek',
	'úplněk',
	'podpatek',
	'překladatel'
];

describe('content sweep: pinned forms', () => {
	// form_overrides.json holds the forms these 22 words had before their gloss
	// was reworded. The bank must still match it exactly, so a later rebuild
	// can't change what learners are expected to type.
	const overrides: unknown = JSON.parse(readFileSync('scripts/form_overrides.json', 'utf-8'));

	function variants(value: unknown): Record<string, string[]> {
		const out: Record<string, string[]> = {};
		if (!isRecord(value)) return out;
		for (const [index, forms] of Object.entries(value)) {
			if (Array.isArray(forms) && forms.length > 0) out[index] = forms.map(String);
		}
		return out;
	}

	it.each(PINNED)('%s has exactly its pinned forms, variants, gender and animacy', (lemma) => {
		const pin = isRecord(overrides) ? overrides[lemma] : undefined;
		if (!isRecord(pin)) throw new Error(`no override for ${lemma}`);
		const entry = word(lemma);
		expect(entry.forms.sg).toEqual(pin.sg);
		expect(entry.forms.pl).toEqual(pin.pl);
		expect(entry.gender).toBe(pin.gender);
		expect(entry.animate).toBe(pin.animate);
		expect(variants(entry.variantForms?.sg)).toEqual(variants(pin.variants_sg));
		expect(variants(entry.variantForms?.pl)).toEqual(variants(pin.variants_pl));
	});
});

describe('content sweep: leftover glosses keep their forms', () => {
	// Reworded through the pipeline with the forms pinned in form_overrides.json.
	it.each([
		['publicista', 'publicist (a journalist, often a commentator)'],
		['publicistka', 'female publicist (a journalist, often a commentator)'],
		['hořčice', 'mustard (plant, genus Sinapis)'],
		['technik', 'technologist'],
		['titulek', 'subtitle, caption (textual versions of the dialog in films)'],
		['salón', 'salon'],
		['pán', 'Mr'],
		['bufet', 'buffet'],
		['sestřenice', 'cousin'],
		['rohlík', 'roll (a form of bread)'],
		['milionářka', 'female equivalent of milionář'],
		['sekretářka', 'secretary (person who handles general clerical work)'],
		['golf', 'golf (a ball game)'],
		['biftek', 'steak (slice of beef)'],
		['zavazadlo', 'baggage (luggage; traveling equipment)'],
		['cyklista', 'cyclist, biker, bicycle rider'],
		['cyklistka', 'female cyclist, biker, bicycle rider'],
		['moderátor', 'host (US), presenter (UK)'],
		['ježek', 'hedgehog (mammal)'],
		['úplněk', 'full moon (moon when it is in opposition to the sun)'],
		['podpatek', 'heel (part of shoe)'],
		['překladatel', 'translator (person)']
	])('%s has a new gloss', (lemma, oldGloss) => {
		const gloss = word(lemma).translation;
		expect(gloss).not.toBe(oldGloss);
		expect(gloss.trim()).not.toBe('');
	});

	it('pán keeps its vocative, plural and variants', () => {
		const w = word('pán');
		expect(w.forms.sg).toEqual(['pán', 'pána', 'pánovi', 'pána', 'pane', 'pánovi', 'pánem']);
		expect(w.forms.pl).toEqual(['páni', 'pánů', 'pánům', 'pány', 'páni', 'pánech', 'pány']);
		expect(w.variantForms).toEqual({
			sg: { '2': ['pánu'], '5': ['pánu'] },
			pl: { '0': ['pánové'], '4': ['pánové'] }
		});
	});

	it('bufet and salón keep the -u locative and gain no variants', () => {
		expect(word('bufet').forms.sg[5]).toBe('bufetu');
		expect(word('salón').forms.sg[5]).toBe('salónu');
		expect(word('bufet').variantForms).toBeUndefined();
		expect(word('salón').variantForms).toBeUndefined();
	});

	it.each(['hořčice', 'rohlík', 'titulek', 'publicista', 'cyklista', 'golf', 'zavazadlo'])(
		'%s gains no MorphoDiTa variants',
		(lemma) => {
			expect(word(lemma).variantForms).toBeUndefined();
		}
	);

	it('masculine person nouns stay animate', () => {
		for (const lemma of ['publicista', 'technik', 'cyklista', 'moderátor', 'překladatel']) {
			expect(word(lemma).animate, lemma).toBe(true);
		}
	});
});

describe('content sweep: trouba and přijezd', () => {
	it('trouba is the feminine oven, not the masculine fool', () => {
		const w = word('trouba');
		expect(w.translation).toBe('oven');
		expect(w.gender).toBe('f');
		expect(w.animate).toBe(false);
		expect(w.paradigm).toBe('žena');
		expect(w.forms.sg).toEqual([
			'trouba',
			'trouby',
			'troubě',
			'troubu',
			'troubo',
			'troubě',
			'troubou'
		]);
		expect(w.forms.pl).toEqual([
			'trouby',
			'trub',
			'troubám',
			'trouby',
			'trouby',
			'troubách',
			'troubami'
		]);
	});

	it('trouba is drilled like the other kitchen appliances', () => {
		const w = word('trouba');
		expect(w.categories).toEqual(word('lednička').categories);
		expect(templateTakesWord(template('nom_kde_061'), w)).toBe(true);
		expect(templateTakesWord(template('ins_za_045'), w)).toBe(true);
		expect(templateTakesWord(template('nom_existuje_066'), w)).toBe(false);
	});

	it('the misspelt přijezd is gone and příjezd stays', () => {
		expect(bank.some((w) => w.lemma === 'přijezd')).toBe(false);
		expect(word('příjezd').translation).toBe('arrival');
	});
});

describe('content sweep: concrete nouns are not abstract', () => {
	const retagged = [
		'sandál',
		'notebook',
		'pilotka',
		'filozof',
		'kosmonaut',
		'hřiště',
		'baterka',
		'terasa',
		'čtenář',
		'kytara',
		'hřbitov',
		'potomek',
		'podpatek'
	];

	it.each(retagged)('%s is out of the abstract frames but still drilled', (lemma) => {
		const w = word(lemma);
		expect(w.categories).not.toContain('abstract');
		expect(w.categories.length).toBeGreaterThan(0);
		for (const id of ['nom_existuje_066', 'nom_vporadku_072', 'loc_na_232', 'ins_zabyvat_147']) {
			expect(templateTakesWord(template(id), w), id).toBe(false);
		}
		expect(templateTakesWord(template('loc_o_003'), w)).toBe(true);
	});

	it.each(['svoboda', 'problém', 'kultura', 'zdraví'])('%s is still abstract', (lemma) => {
		expect(templateTakesWord(template('nom_existuje_066'), word(lemma))).toBe(true);
	});
});

describe('content sweep: adjective pairings', () => {
	const adjectives = loadAdjectiveBank();

	function offered(templateId: string): string[] {
		const t = loadAdjectiveTemplates().find((x) => x.id === templateId);
		if (!t) throw new Error(`missing adjective template ${templateId}`);
		return filterAdjectivesByTemplate(adjectives, t).map((a) => a.lemma);
	}

	it.each([
		{ id: 'adj_a2_nom_sg_n_001', takes: ['velký', 'nový'], rejects: ['teplý', 'studený'] },
		{ id: 'adj_b1_gen_sg_minanim_001', takes: ['velký', 'zelený'], rejects: ['bohatý'] },
		{
			id: 'adj_a2_acc_sg_n_001',
			takes: ['dobrý', 'teplý', 'sladký'],
			rejects: ['nebezpečný', 'zelený', 'bohatý', 'první']
		},
		{
			id: 'adj_b2_acc_sg_manim_001',
			takes: ['dobrý', 'zkušený', 'praktický'],
			rejects: ['podobný', 'původní']
		},
		{
			id: 'adj_gen_sg_f_005',
			takes: ['mladý', 'český'],
			rejects: ['silný', 'slabý', 'nebezpečný']
		},
		{
			id: 'adj_a2_ins_sg_f_001',
			takes: ['velký', 'malý'],
			rejects: ['cizí', 'první', 'poslední']
		},
		{
			id: 'adj_b2_nom_sg_manim_001',
			takes: ['dobrý', 'zkušený'],
			rejects: ['společenský', 'praktický', 'původní']
		},
		{ id: 'adj_acc_sg_manim_024', takes: ['dobrý', 'nový'], rejects: ['společenský', 'původní'] },
		{ id: 'adj_acc_sg_m_008', takes: ['zelený', 'starý'], rejects: ['cizí'] }
	])('$id drops the odd adjectives and keeps a usable pool', (c) => {
		const pool = offered(c.id);
		for (const lemma of c.takes) expect(pool, lemma).toContain(lemma);
		for (const lemma of c.rejects) expect(pool, lemma).not.toContain(lemma);
		expect(pool.length).toBeGreaterThanOrEqual(8);
	});
});

describe('"Bydlím naproti ___."', () => {
	it('takes buildings, not parts of one', () => {
		const t = template('dat_naproti_097');
		for (const lemma of ['škola', 'nádraží', 'park']) {
			expect(templateTakesWord(t, word(lemma)), lemma).toBe(true);
		}
		for (const lemma of ['střecha', 'balkón', 'jeviště', 'chodník']) {
			expect(templateTakesWord(t, word(lemma)), lemma).toBe(false);
		}
	});
});
