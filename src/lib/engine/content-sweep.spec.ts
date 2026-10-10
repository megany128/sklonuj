import { describe, it, expect } from 'vitest';
import { getCandidates, loadTemplates, loadWordBank, templateTakesWord } from './drill.ts';
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
		{ id: 'gen_do_011', level: 'A1', takes: ['kavárna', 'park'], rejects: ['fontána'] },
		{ id: 'loc_v_160', level: 'A1', takes: ['kavárna', 'kino'], rejects: ['fontána'] },
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
