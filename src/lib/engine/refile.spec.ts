import { describe, it, expect } from 'vitest';
import { loadTemplates, loadWordBank, templateTakesWord } from './drill.ts';
import { adjectiveMatchesNoun, loadAdjectiveBank } from './adjective-drill.ts';
import type { AdjectiveEntry, SentenceTemplate, WordEntry } from '../types.ts';

// Nouns that used to be filed under `abstract` and then sat in `misc` alone now
// carry the categories of their neighbours (kouč like lékař, přístav like
// škola, hřiště like náměstí, pas like průkaz), so they are drilled in the
// sentences that suit them.

const bank = loadWordBank();
const adjectives = loadAdjectiveBank();

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

function adjective(lemma: string): AdjectiveEntry {
	const a = adjectives.find((x) => x.lemma === lemma);
	if (!a) throw new Error(`missing adjective ${lemma}`);
	return a;
}

describe('re-filed nouns land in the frames that suit them', () => {
	it.each([
		// people: a job goes into "Chci být ___", but gets no address or title tag
		{ lemma: 'kouč', takes: ['ins_byt_050', 'acc_hledam_030'], rejects: ['voc_dobry_pane_038b'] },
		{ lemma: 'uklízečka', takes: ['ins_byt_235'], rejects: ['voc_dobry_pani_038a'] },
		{ lemma: 'čtenář', takes: ['acc_hledam_030', 'ins_s_051'], rejects: ['ins_byt_050'] },
		{ lemma: 'protivník', takes: ['nom_to_176'], rejects: ['voc_ahoj_035', 'voc_prominte_036'] },
		{ lemma: 'spolužák', takes: ['nom_to_176', 'voc_ahoj_035'], rejects: ['ins_byt_050'] },
		// "v" places: do / v
		{ lemma: 'přístav', takes: ['gen_do_011', 'loc_v_004'], rejects: ['acc_na_009', 'loc_na_002'] },
		{ lemma: 'tábor', takes: ['gen_do_011', 'loc_v_160'], rejects: ['acc_na_009', 'loc_na_002'] },
		{ lemma: 'cela', takes: ['loc_v_160'], rejects: ['gen_vedle_016', 'loc_na_002'] },
		{ lemma: 'okres', takes: ['loc_v_004'], rejects: ['gen_do_011', 'gen_u_015'] },
		// "na" places: na / na
		{ lemma: 'hřiště', takes: ['acc_na_009', 'loc_na_002'], rejects: ['gen_do_011', 'loc_v_004'] },
		{ lemma: 'zastávka', takes: ['acc_na_009', 'gen_u_015'], rejects: ['gen_do_011', 'loc_v_160'] },
		{ lemma: 'křižovatka', takes: ['loc_na_002'], rejects: ['loc_v_004'] },
		{ lemma: 'terasa', takes: ['loc_na_005', 'acc_na_009'], rejects: ['gen_vedle_016'] },
		{ lemma: 'zámek', takes: ['acc_na_009', 'gen_vedle_016'], rejects: ['gen_do_011'] },
		// an indoor spot: you wait at it, you do not live next to it
		{ lemma: 'pokladna', takes: ['gen_u_015'], rejects: ['gen_vedle_016', 'gen_do_011'] },
		// objects
		{ lemma: 'pas', takes: ['gen_bez_020', 'nom_kde_061'], rejects: ['nom_existuje_066'] },
		{ lemma: 'kotel', takes: ['ins_za_045', 'acc_mam_007'], rejects: ['gen_bez_020'] },
		{ lemma: 'zábradlí', takes: ['nom_kde_061'], rejects: ['acc_mam_007'] },
		{ lemma: 'faktura', takes: ['acc_ctu_029'], rejects: ['nom_kde_061'] }
	])('$lemma', ({ lemma, takes, rejects }) => {
		const w = word(lemma);
		for (const id of takes) expect(templateTakesWord(template(id), w), id).toBe(true);
		for (const id of rejects) expect(templateTakesWord(template(id), w), id).toBe(false);
	});

	it('gives no re-filed person a new address or title tag', () => {
		const address = [
			'address_informal',
			'address_formal',
			'address_group',
			'address_group_formal',
			'title',
			'formal_title'
		];
		for (const lemma of ['kouč', 'primátor', 'posluchač', 'protivník', 'císař', 'uklízečka']) {
			expect(
				word(lemma).categories.filter((c) => address.includes(c)),
				lemma
			).toEqual([]);
		}
	});

	it('leaves the nouns whose place is unclear in misc', () => {
		for (const lemma of ['paluba', 'vchod', 'hrob', 'zatáčka', 'výtah']) {
			expect(word(lemma).categories, lemma).toEqual(['misc']);
		}
	});
});

describe('trouba stays an oven', () => {
	it('carries no people or address category', () => {
		expect(word('trouba').categories).toEqual(['objects', 'large_object']);
	});

	it('is in no frame that addresses or describes a person', () => {
		const w = word('trouba');
		const personFrames = loadTemplates().filter((t) => {
			const cats = Array.isArray(t.lemmaCategory) ? t.lemmaCategory : [t.lemmaCategory];
			return (
				t.requiredCase === 'voc' ||
				cats.some((c) => c === 'people' || c === 'family' || c === 'profession')
			);
		});
		expect(personFrames.length).toBeGreaterThan(50);
		expect(personFrames.filter((t) => templateTakesWord(t, w)).map((t) => t.id)).toEqual([]);
	});
});

describe('adjectives on re-filed nouns', () => {
	it.each([
		['dobrý', 'kouč'],
		['zkušený', 'pilotka'],
		['velký', 'přístav'],
		['starý', 'zámek'],
		['nový', 'pas']
	])('%s %s is offered', (adj, noun) => {
		expect(adjectiveMatchesNoun(adjective(adj), word(noun))).toBe(true);
	});

	it.each([
		['vědecký', 'uklízečka'],
		['praktický', 'kouč'],
		['pomalý', 'předchůdce'],
		['červený', 'okres'],
		['jarní', 'křižovatka'],
		['levný', 'kontinent'],
		['teplý', 'rám'],
		['příjemný', 'vízum']
	])('%s %s is not', (adj, noun) => {
		expect(adjectiveMatchesNoun(adjective(adj), word(noun))).toBe(false);
	});
});
