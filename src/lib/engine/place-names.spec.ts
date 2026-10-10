import { describe, it, expect } from 'vitest';
import {
	applyPrepositionVoicing,
	checkAnswer,
	generateFormProduction,
	getCandidates,
	hasValidForm,
	loadTemplates,
	loadWordBank
} from './drill.ts';
import { adjectiveMatchesNoun, loadAdjectiveBank, nounTakesAdjectives } from './adjective-drill.ts';
import { ALL_CASES, CASE_INDEX } from '../types.ts';
import type { Case, Number_, Progress, SentenceTemplate, WordEntry } from '../types.ts';

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

const B2: Progress = {
	level: 'B2',
	caseScores: {},
	paradigmScores: {},
	lemmaScores: {},
	cellSchedule: {},
	lastSession: '',
	longestStreak: 0
};

function candidateLemmas(templateId: string): string[] {
	return getCandidates(template(templateId), B2).map((w) => w.lemma);
}

/** "do ___" + "Prahy" → "do Prahy", with the preposition vocalized as the app shows it. */
function phrase(prep: string, form: string): string {
	return applyPrepositionVoicing(`${prep} ___`, form).replace('___', form);
}

/** Kam? · Kde? · Odkud? for a place, built from the bank's forms. */
function kamKdeOdkud(w: WordEntry): string {
	const number_: Number_ = w.pluralOnly ? 'pl' : 'sg';
	const form = (c: Case): string => w.forms[number_][CASE_INDEX[c]];
	const na = w.categories.includes('na_place');
	return [
		na ? phrase('na', form('acc')) : phrase('do', form('gen')),
		phrase(na ? 'na' : 'v', form('loc')),
		phrase('z', form('gen'))
	].join(' · ');
}

// Standard Czech, checked form by form (Internetová jazyková příručka usage).
const V_PLACES: Record<string, string> = {
	Praha: 'do Prahy · v Praze · z Prahy',
	Plzeň: 'do Plzně · v Plzni · z Plzně',
	Paříž: 'do Paříže · v Paříži · z Paříže',
	Varšava: 'do Varšavy · ve Varšavě · z Varšavy',
	Mnichov: 'do Mnichova · v Mnichově · z Mnichova',
	Neapol: 'do Neapole · v Neapoli · z Neapole',
	Německo: 'do Německa · v Německu · z Německa',
	Polsko: 'do Polska · v Polsku · z Polska',
	Itálie: 'do Itálie · v Itálii · z Itálie',
	Řecko: 'do Řecka · v Řecku · z Řecka',
	Anglie: 'do Anglie · v Anglii · z Anglie',
	Norsko: 'do Norska · v Norsku · z Norska',
	Švédsko: 'do Švédska · ve Švédsku · ze Švédska',
	Dánsko: 'do Dánska · v Dánsku · z Dánska',
	Bulharsko: 'do Bulharska · v Bulharsku · z Bulharska',
	Chorvatsko: 'do Chorvatska · v Chorvatsku · z Chorvatska',
	Thajsko: 'do Thajska · v Thajsku · z Thajska',
	Vietnam: 'do Vietnamu · ve Vietnamu · z Vietnamu',
	Evropa: 'do Evropy · v Evropě · z Evropy',
	Asie: 'do Asie · v Asii · z Asie',
	Afrika: 'do Afriky · v Africe · z Afriky',
	Amerika: 'do Ameriky · v Americe · z Ameriky',
	Austrálie: 'do Austrálie · v Austrálii · z Austrálie',
	Čechy: 'do Čech · v Čechách · z Čech',
	Slezsko: 'do Slezska · ve Slezsku · ze Slezska',
	Krkonoše: 'do Krkonoš · v Krkonoších · z Krkonoš'
};

const NA_PLACES: Record<string, string> = {
	Morava: 'na Moravu · na Moravě · z Moravy',
	Slovensko: 'na Slovensko · na Slovensku · ze Slovenska',
	Šumava: 'na Šumavu · na Šumavě · ze Šumavy',
	Vysočina: 'na Vysočinu · na Vysočině · z Vysočiny',
	Sněžka: 'na Sněžku · na Sněžce · ze Sněžky',
	Havaj: 'na Havaj · na Havaji · z Havaje',
	Kréta: 'na Krétu · na Krétě · z Kréty',
	Florida: 'na Floridu · na Floridě · z Floridy',
	Aljaška: 'na Aljašku · na Aljašce · z Aljašky'
};

const PLACE_LEMMAS = [...Object.keys(V_PLACES), ...Object.keys(NA_PLACES)];
const PLURAL_ONLY_PLACES = ['Čechy', 'Krkonoše'];

describe('place names', () => {
	it('has the Kam? Kde? Odkud? forms of every "v" place', () => {
		for (const [lemma, expected] of Object.entries(V_PLACES)) {
			expect(kamKdeOdkud(word(lemma)), lemma).toBe(expected);
		}
	});

	it('has the Kam? Kde? Odkud? forms of every "na" place', () => {
		for (const [lemma, expected] of Object.entries(NA_PLACES)) {
			expect(kamKdeOdkud(word(lemma)), lemma).toBe(expected);
		}
	});

	it('tags every proper place in the bank, and only as a "v" or a "na" place', () => {
		const tagged = bank.filter((w) => w.categories.includes('place_name')).map((w) => w.lemma);
		expect([...tagged].sort()).toEqual([...PLACE_LEMMAS].sort());
		for (const lemma of Object.keys(V_PLACES)) {
			const cats = word(lemma).categories;
			expect(cats, lemma).toEqual(expect.arrayContaining(['places', 'v_place']));
			expect(cats, lemma).not.toContain('na_place');
		}
		for (const lemma of Object.keys(NA_PLACES)) {
			const cats = word(lemma).categories;
			expect(cats, lemma).toEqual(expect.arrayContaining(['places', 'na_place']));
			expect(cats, lemma).not.toContain('v_place');
			// "Bydlím v ___" takes `dwelling` nouns and hardcodes v.
			expect(cats, lemma).not.toContain('dwelling');
		}
	});

	it('never asks a proper noun in a number it does not have', () => {
		for (const lemma of PLACE_LEMMAS) {
			const w = word(lemma);
			const missing: Number_ = PLURAL_ONLY_PLACES.includes(lemma) ? 'sg' : 'pl';
			expect(w.pluralOnly === true, lemma).toBe(missing === 'sg');
			for (const c of ALL_CASES) {
				expect(hasValidForm(w, c, missing), `${lemma} ${c} ${missing}`).toBe(false);
				expect(generateFormProduction(w, c, missing), `${lemma} ${c} ${missing}`).toBeNull();
			}
		}
		for (const t of loadTemplates()) {
			for (const w of getCandidates(t, B2)) {
				if (!w.categories.includes('place_name')) continue;
				expect(t.number, `${t.id} ${w.lemma}`).toBe(w.pluralOnly ? 'pl' : 'sg');
			}
		}
	});

	it('accepts a place name typed without its capital', () => {
		const question = generateFormProduction(word('Praha'), 'loc', 'sg');
		if (!question) throw new Error('no question for Praha loc sg');
		expect(question.correctAnswer).toBe('Praze');
		expect(checkAnswer(question, 'praze')?.correct).toBe(true);
		expect(checkAnswer(question, 'Praze')?.correct).toBe(true);
		expect(checkAnswer(question, 'Prahu')?.correct).toBe(false);
	});

	it('fills the place templates with the right preposition', () => {
		const bydlim = candidateLemmas('loc_v_001'); // Bydlím v ___.
		expect(bydlim).toEqual(expect.arrayContaining(['Praha', 'Německo', 'Evropa']));
		const jsemNa = candidateLemmas('loc_na_002'); // Jsem na ___.
		expect(jsemNa).toEqual(expect.arrayContaining(Object.keys(NA_PLACES)));
		for (const lemma of Object.keys(NA_PLACES)) expect(bydlim, lemma).not.toContain(lemma);
		for (const lemma of Object.keys(V_PLACES)) expect(jsemNa, lemma).not.toContain(lemma);
		// Plural-only regions reach the plural templates.
		expect(candidateLemmas('loc_v_056')).toEqual(expect.arrayContaining(PLURAL_ONLY_PLACES));
	});

	it('keeps place names out of sentences that need a walkable spot', () => {
		// "Jdu do Austrálie" needs jet/letět; "Jdu na Sněžku" is a hike.
		expect(candidateLemmas('gen_do_011').filter((l) => PLACE_LEMMAS.includes(l))).toEqual([]);
		expect(candidateLemmas('acc_na_009').filter((l) => PLACE_LEMMAS.includes(l))).toEqual([
			'Sněžka'
		]);
		// "Vracím se do ___" takes them all.
		expect(candidateLemmas('gen_do_019')).toEqual(
			expect.arrayContaining(['Praha', 'Německo', 'Austrálie'])
		);
		// Templates about standing next to a building exclude `region`.
		for (const id of ['gen_vedle_016', 'ins_pred_048', 'dat_naproti_097', 'loc_v_160']) {
			expect(
				candidateLemmas(id).filter((l) => PLACE_LEMMAS.includes(l)),
				id
			).toEqual([]);
		}
	});

	it('pairs no adjective with a place name', () => {
		const adjectives = loadAdjectiveBank();
		for (const lemma of PLACE_LEMMAS) {
			const w = word(lemma);
			expect(nounTakesAdjectives(w), lemma).toBe(false);
			expect(
				adjectives.filter((a) => adjectiveMatchesNoun(a, w)),
				lemma
			).toEqual([]);
		}
		expect(nounTakesAdjectives(word('město'))).toBe(true);
	});
});

describe('nationality nouns', () => {
	it('declines the masculine ones as animate, with their plural stems', () => {
		const cech = word('Čech');
		expect(cech.animate).toBe(true);
		expect(cech.forms.sg).toEqual([
			'Čech',
			'Čecha',
			'Čechovi',
			'Čecha',
			'Čechu',
			'Čechovi',
			'Čechem'
		]);
		expect(cech.forms.pl).toEqual(['Češi', 'Čechů', 'Čechům', 'Čechy', 'Češi', 'Češích', 'Čechy']);
		for (const lemma of ['Němec', 'Francouz', 'Rakušan']) {
			const w = word(lemma);
			expect(w.animate, lemma).toBe(true);
			// Animate masculine: accusative = genitive.
			expect(w.forms.sg[CASE_INDEX.acc], lemma).toBe(w.forms.sg[CASE_INDEX.gen]);
		}
		expect(word('Němec').forms.pl[CASE_INDEX.nom]).toBe('Němci');
		expect(word('Rakušan').forms.pl[CASE_INDEX.nom]).toBe('Rakušané');
		expect(word('Francouzka').forms.pl[CASE_INDEX.gen]).toBe('Francouzek');
	});

	it('tags all eight as people', () => {
		for (const lemma of [
			'Čech',
			'Češka',
			'Němec',
			'Němka',
			'Francouz',
			'Francouzka',
			'Rakušan',
			'Rakušanka'
		]) {
			expect(word(lemma).categories, lemma).toEqual(['people', 'nationality']);
		}
		expect(candidateLemmas('ins_s_051')).toEqual(expect.arrayContaining(['Čech', 'Němka']));
	});
});

describe('nouns that decline like adjectives', () => {
	const ADJECTIVAL = [
		'dovolená',
		'vstupné',
		'spropitné',
		'známý',
		'příbuzný',
		'příbuzná',
		'dospělý',
		'dospělá',
		'vrátný',
		'vrátná',
		'krejčí',
		'mateřská',
		'nemocenská',
		'rodičovská'
	];
	const NO_PLURAL = ['dovolená', 'vstupné', 'spropitné', 'mateřská', 'nemocenská', 'rodičovská'];

	it('are irregular and carry a note instead of a paradigm rule', () => {
		for (const lemma of ADJECTIVAL) {
			const w = word(lemma);
			expect(w.irregular, lemma).toBe(true);
			expect(w.declensionNote, lemma).toMatch(/^Declines like an? (soft )?adjective/);
		}
	});

	it('have adjective endings', () => {
		expect(word('dovolená').forms.sg).toEqual([
			'dovolená',
			'dovolené',
			'dovolené',
			'dovolenou',
			'dovolená',
			'dovolené',
			'dovolenou'
		]);
		expect(word('vstupné').forms.sg).toEqual([
			'vstupné',
			'vstupného',
			'vstupnému',
			'vstupné',
			'vstupné',
			'vstupném',
			'vstupným'
		]);
		expect(word('známý').forms.sg).toEqual([
			'známý',
			'známého',
			'známému',
			'známého',
			'známý',
			'známém',
			'známým'
		]);
		expect(word('známý').forms.pl).toEqual([
			'známí',
			'známých',
			'známým',
			'známé',
			'známí',
			'známých',
			'známými'
		]);
		expect(word('krejčí').forms.sg).toEqual([
			'krejčí',
			'krejčího',
			'krejčímu',
			'krejčího',
			'krejčí',
			'krejčím',
			'krejčím'
		]);
	});

	it('never asks the leave and fee nouns in the plural, and still asks them in the singular', () => {
		const plural = loadTemplates().filter((t) => t.number === 'pl');
		for (const lemma of NO_PLURAL) {
			const w = word(lemma);
			expect(w.categories, lemma).toContain('mass');
			for (const c of ALL_CASES) {
				expect(generateFormProduction(w, c, 'pl'), `${lemma} ${c}`).toBeNull();
			}
			for (const t of plural) {
				expect(
					getCandidates(t, B2).map((x) => x.lemma),
					`${t.id} ${lemma}`
				).not.toContain(lemma);
			}
			expect(generateFormProduction(w, 'acc', 'sg'), lemma).not.toBeNull();
			expect(candidateLemmas('acc_chci_107'), lemma).toContain(lemma); // Chci ___.
		}
		// The food-only "Mám dost ___" / "Trochu ___" templates ask for `mass`.
		for (const id of ['gen_dost_a1', 'gen_trochu_a1']) {
			expect(candidateLemmas(id).filter((l) => NO_PLURAL.includes(l))).toEqual([]);
		}
		expect(candidateLemmas('acc_tesim_244')).toContain('dovolená'); // Těším se na ___.
		expect(candidateLemmas('gen_zucastnil_190')).not.toContain('dovolená');
	});
});
