import { describe, expect, it } from 'vitest';
import { nounCellKey } from './spacing';
import {
	checkAnswer,
	generateFormProduction,
	generateCaseIdentification,
	generateSentenceDrill,
	getCandidates,
	loadTemplates,
	loadWordBank,
	weightedRandom,
	pickWeightedTemplate,
	applyPrepositionVoicing,
	casesWithContent,
	caseUnlockLevel,
	lockedCasesForLevel,
	hasValidForm
} from './drill.ts';
import type { Case, Difficulty, Progress } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('loadWordBank', () => {
	it('returns non-empty array with expected shape', () => {
		const bank = loadWordBank();
		expect(bank.length).toBeGreaterThan(0);
		const first = bank[0];
		expect(first).toHaveProperty('lemma');
		expect(first).toHaveProperty('translation');
		expect(first).toHaveProperty('gender');
		expect(first).toHaveProperty('animate');
		expect(first).toHaveProperty('paradigm');
		expect(first).toHaveProperty('difficulty');
		expect(first).toHaveProperty('categories');
		expect(first).toHaveProperty('forms');
		expect(first.forms).toHaveProperty('sg');
		expect(first.forms).toHaveProperty('pl');
	});
});

describe('loadTemplates', () => {
	it('returns non-empty array of templates', () => {
		const templates = loadTemplates();
		expect(templates.length).toBeGreaterThan(0);
	});
});

describe('getCandidates', () => {
	it('filters by category - places template returns only words with places category', () => {
		const templates = loadTemplates();
		const placesTemplate = templates.find((t) => t.lemmaCategory === 'places');
		expect(placesTemplate).toBeDefined();
		if (!placesTemplate) return;
		const progress: Progress = {
			level: 'B1',
			caseScores: {},
			paradigmScores: {},
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
		};
		const candidates = getCandidates(placesTemplate, progress);
		expect(candidates.length).toBeGreaterThan(0);
		for (const word of candidates) {
			expect(word.categories).toContain('places');
		}
	});
});

describe('generateFormProduction', () => {
	it('returns correct locative singular form for hrad', () => {
		const bank = loadWordBank();
		const hrad = bank.find((w) => w.lemma === 'hrad');
		expect(hrad).toBeDefined();
		if (!hrad) return;
		const question = generateFormProduction(hrad, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		expect(question.correctAnswer).toBe('hradě');
		expect(question.case).toBe('loc');
		expect(question.number).toBe('sg');
		expect(question.word.lemma).toBe('hrad');
		expect(question.drillType).toBe('form_production');
	});
});

describe('generateSentenceDrill', () => {
	it('returns correct answer for known template + word combo', () => {
		const templates = loadTemplates();
		const template = templates.find((t) => t.id === 'loc_v_001');
		expect(template).toBeDefined();
		if (!template) return;
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateSentenceDrill(template, dum);
		expect(question).not.toBeNull();
		if (!question) return;
		// loc_v_001 requires loc sg; dům loc sg (index 5) = "domě"
		expect(question.correctAnswer).toBe('domě');
		expect(question.case).toBe('loc');
		expect(question.number).toBe('sg');
		expect(question.drillType).toBe('sentence_fill_in');
	});
});

describe('generateCaseIdentification', () => {
	it('returns the case abbreviation as correctAnswer', () => {
		const templates = loadTemplates();
		const template = templates.find((t) => t.id === 'loc_v_001');
		expect(template).toBeDefined();
		if (!template) return;
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateCaseIdentification(template, dum);
		expect(question.correctAnswer).toBe('loc');
		expect(question.case).toBe('loc');
		expect(question.drillType).toBe('case_identification');
	});

	it('checkAnswer correctly validates case identification', () => {
		const templates = loadTemplates();
		const template = templates.find((t) => t.id === 'acc_vid_006');
		expect(template).toBeDefined();
		if (!template) return;
		const bank = loadWordBank();
		const word = bank[0];
		const question = generateCaseIdentification(template, word);
		const correct = checkAnswer(question, 'acc');
		expect(correct).not.toBeNull();
		if (!correct) return;
		expect(correct.correct).toBe(true);
		const wrong = checkAnswer(question, 'loc');
		expect(wrong).not.toBeNull();
		if (!wrong) return;
		expect(wrong.correct).toBe(false);
	});
});

describe('checkAnswer', () => {
	it('exact match returns correct true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		const result = checkAnswer(question, 'domě');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(true);
		expect(result.nearMiss).toBe(false);
	});

	it('near miss with wrong diacritics counts as correct with nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// correctAnswer is "domě", user types "dome" (missing háček)
		const result = checkAnswer(question, 'dome');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(true);
		expect(result.nearMiss).toBe(true);
	});

	it('wrong answer returns correct false and nearMiss false', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// correctAnswer is "domě", user types "xyz" — completely wrong
		const result = checkAnswer(question, 'xyz');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(false);
		expect(result.nearMiss).toBe(false);
	});

	it('at A1, near-miss (wrong diacritics) counts as correct with nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// correctAnswer is "domě", user types "dome" (missing háček), level A1
		const result = checkAnswer(question, 'dome', 'A1');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(true);
		expect(result.nearMiss).toBe(true);
	});

	it('at B1, near-miss (wrong diacritics) counts as INCORRECT with nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// correctAnswer is "domě", user types "dome" (missing háček), level B1
		const result = checkAnswer(question, 'dome', 'B1');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(false);
		expect(result.nearMiss).toBe(true);
	});

	it('at B2, near-miss (wrong diacritics) counts as INCORRECT with nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// correctAnswer is "domě", user types "dome" (missing háček), level B2
		const result = checkAnswer(question, 'dome', 'B2');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(false);
		expect(result.nearMiss).toBe(true);
	});

	it('at A2, near-miss (wrong diacritics) counts as correct with nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// correctAnswer is "domě", user types "dome" (missing háček), level A2
		const result = checkAnswer(question, 'dome', 'A2');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(true);
		expect(result.nearMiss).toBe(true);
	});

	it('variant form is accepted as correct', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		expect(question).not.toBeNull();
		if (!question) return;
		// Primary form is "domě", variant is "domu" — both should be correct
		const result = checkAnswer(question, 'domu');
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.correct).toBe(true);
		expect(result.nearMiss).toBe(false);
	});
});

describe('applyPrepositionVoicing', () => {
	it('changes "v ___" to "ve ___" before words starting with v', () => {
		const result = applyPrepositionVoicing('Bydlím v ___.', 'Vršovicích');
		expect(result).toBe('Bydlím ve ___.');
	});

	it('changes "s ___" to "se ___" before words starting with s', () => {
		const result = applyPrepositionVoicing('Jdu tam s ___.', 'sestrou');
		expect(result).toBe('Jdu tam se ___.');
	});

	it('keeps "s ___" before words starting with a vowel', () => {
		const result = applyPrepositionVoicing('Jdu tam s ___.', 'otcem');
		expect(result).toBe('Jdu tam s ___.');
	});

	it('changes "z ___" to "ze ___" before words starting with z', () => {
		const result = applyPrepositionVoicing('Přijel jsem z ___.', 'zahrady');
		expect(result).toBe('Přijel jsem ze ___.');
	});

	it('keeps template unchanged when no voicing needed', () => {
		const result = applyPrepositionVoicing('Bydlím v ___.', 'Praze');
		expect(result).toBe('Bydlím v ___.');
	});
});

describe('weightedRandom', () => {
	it('returns a word from the candidates array', () => {
		const bank = loadWordBank();
		const candidates = bank.slice(0, 5);
		const progress: Progress = {
			level: 'A1',
			caseScores: {},
			paradigmScores: {},
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
		};
		const picked = weightedRandom(candidates, progress, 'nom', 'sg');
		expect(candidates).toContainEqual(picked);
	});

	it('favors unseen lemmas over well-known ones', () => {
		const bank = loadWordBank();
		const hrad = bank.find((w) => w.paradigm === 'hrad');
		const zena = bank.find((w) => w.paradigm === 'žena');
		const mesto = bank.find((w) => w.paradigm === 'město');
		expect(hrad).toBeDefined();
		expect(zena).toBeDefined();
		expect(mesto).toBeDefined();
		if (!hrad || !zena || !mesto) return;
		const candidates = [hrad, zena, mesto];
		// Mark hrad and žena lemmas as well-known, leave město unseen
		const progress: Progress = {
			level: 'A1',
			caseScores: {},
			paradigmScores: {},
			lemmaScores: {
				[`${hrad.lemma}_loc_sg`]: { attempts: 20, correct: 20 },
				[`${zena.lemma}_loc_sg`]: { attempts: 20, correct: 20 }
			},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
		};

		const counts: Record<string, number> = {};
		for (const c of candidates) counts[c.lemma] = 0;

		const iterations = 1000;
		for (let i = 0; i < iterations; i++) {
			const picked = weightedRandom(candidates, progress, 'loc', 'sg');
			counts[picked.lemma]++;
		}

		// Unseen lemma (město): lemma_weight ~10. Seen lemmas: lemma_weight ~0.91.
		// město should dominate the picks heavily.
		expect(counts[mesto.lemma]).toBeGreaterThan(iterations * 0.7);
	});

	it('prefers a word whose spacing cell is due over one just practised', () => {
		const bank = loadWordBank();
		const hrad = bank.find((w) => w.paradigm === 'hrad');
		const zena = bank.find((w) => w.paradigm === 'žena');
		expect(hrad).toBeDefined();
		expect(zena).toBeDefined();
		if (!hrad || !zena) return;
		const candidates = [hrad, zena];
		const now = 10 * DAY_MS;
		// Both lemmas equally known; hrad's cell was just seen, žena's is a week overdue.
		const progress: Progress = {
			level: 'A1',
			caseScores: {},
			paradigmScores: {},
			lemmaScores: {
				[`${hrad.lemma}_loc_sg`]: { attempts: 5, correct: 5 },
				[`${zena.lemma}_loc_sg`]: { attempts: 5, correct: 5 }
			},
			cellSchedule: {
				[nounCellKey('hrad', 'loc', 'sg')]: { last: now, box: 1, streak: 1 },
				[nounCellKey('žena', 'loc', 'sg')]: { last: now - 8 * DAY_MS, box: 1, streak: 1 }
			},
			lastSession: '',
			longestStreak: 0
		};
		// hrad weight ≈ 0.91 * 0.5 (floor), žena ≈ 0.91 * 1.0 (capped overdue):
		// a draw just above hrad's share must land on žena.
		expect(weightedRandom(candidates, progress, 'loc', 'sg', now, () => 0.4)).toBe(zena);
		expect(weightedRandom(candidates, progress, 'loc', 'sg', now, () => 0.2)).toBe(hrad);
	});
});

describe('casesWithContent', () => {
	const nounsOnly = (level: Difficulty, numberMode: 'sg' | 'pl' | 'both' = 'sg'): Case[] =>
		casesWithContent({
			level,
			includeNouns: true,
			includePronouns: false,
			includeAdjectives: false,
			numberMode
		});

	it('A1 nouns-only stays within the unlocked case set and excludes dat/ins/voc', () => {
		const cases = nounsOnly('A1');
		const allowed: Case[] = ['nom', 'acc', 'gen', 'loc'];
		for (const c of cases) expect(allowed).toContain(c);
		expect(cases).not.toContain('dat');
		expect(cases).not.toContain('ins');
		expect(cases).not.toContain('voc');
		// nom always has content
		expect(cases).toContain('nom');
	});

	it('higher levels expose the full 7-case set', () => {
		for (const level of ['A2', 'B1', 'B2'] as Difficulty[]) {
			const cases = nounsOnly(level);
			expect(cases.length).toBe(7);
		}
	});

	it('no-silent-empty invariant: every returned case has ≥1 backing word', () => {
		const bank = loadWordBank();
		for (const level of ['A1', 'A2', 'B1', 'B2'] as Difficulty[]) {
			const cases = nounsOnly(level);
			for (const c of cases) {
				const hasWord = bank.some((w) => hasValidForm(w, c, 'sg'));
				expect(hasWord).toBe(true);
			}
		}
	});

	it('paradigm filter to a never-vocative paradigm (stavení) excludes voc', () => {
		// stavení is neuter inanimate with no vocative-eligible lemmas, so the
		// auto-hide-empty net must drop voc even though the level unlocks it.
		const cases = casesWithContent({
			level: 'B2',
			includeNouns: true,
			includePronouns: false,
			includeAdjectives: false,
			numberMode: 'sg',
			nounFilter: (w) => w.paradigm === 'stavení'
		});
		expect(cases).not.toContain('voc');
		expect(cases).toContain('acc');
	});

	it('pronoun-only at B1 returns cases that all have a pronoun form', () => {
		const cases = casesWithContent({
			level: 'B1',
			includeNouns: false,
			includePronouns: true,
			includeAdjectives: false,
			numberMode: 'sg'
		});
		expect(cases.length).toBeGreaterThan(0);
	});
});

describe('caseUnlockLevel', () => {
	it('nom unlocks at A1 (every level has it)', () => {
		expect(caseUnlockLevel('nom')).toBe('A1');
	});

	it('dat and ins first unlock at A2', () => {
		expect(caseUnlockLevel('dat')).toBe('A2');
		expect(caseUnlockLevel('ins')).toBe('A2');
	});
});

describe('lockedCasesForLevel', () => {
	it('A1 locks dat and ins, each pointing at A2', () => {
		const locked = lockedCasesForLevel('A1');
		const map = new Map(locked.map((l) => [l.case, l.unlockLevel]));
		expect(map.get('dat')).toBe('A2');
		expect(map.get('ins')).toBe('A2');
		// A1-unlocked cases are never reported as locked.
		expect(map.has('nom')).toBe(false);
		expect(map.has('acc')).toBe(false);
	});

	it('A2+ unlock all 7 cases, so nothing is locked', () => {
		for (const level of ['A2', 'B1', 'B2'] as Difficulty[]) {
			expect(lockedCasesForLevel(level)).toEqual([]);
		}
	});

	it('locked + unlocked partition is exactly the cases a higher level adds', () => {
		// Honesty check against casesWithContent: a case is either available now
		// or locked-for-later, never both, and never silently dropped.
		const locked = lockedCasesForLevel('A1').map((l) => l.case);
		const available = casesWithContent({
			level: 'A1',
			includeNouns: true,
			includePronouns: true,
			includeAdjectives: true,
			numberMode: 'both'
		});
		for (const c of locked) expect(available).not.toContain(c);
	});
});

describe('pickWeightedTemplate', () => {
	const templates = [
		{ id: 'tiny', pool: 9 },
		{ id: 'big', pool: 900 }
	];
	const bySize = (t: { pool: number }) => t.pool;

	it('returns null for an empty list', () => {
		expect(pickWeightedTemplate([], bySize, [])).toBeNull();
	});

	it('weights by the square root of the pool size', () => {
		// sqrt(9)=3, sqrt(900)=30: the first 3/33 of the unit interval picks "tiny".
		expect(pickWeightedTemplate(templates, bySize, [], () => 0.05)?.id).toBe('tiny');
		expect(pickWeightedTemplate(templates, bySize, [], () => 0.1)?.id).toBe('big');
		expect(pickWeightedTemplate(templates, bySize, [], () => 0.99)?.id).toBe('big');
	});

	it('skips recently used templates when others remain', () => {
		expect(pickWeightedTemplate(templates, bySize, ['big'], () => 0.99)?.id).toBe('tiny');
		// Everything recent: fall back to the full list.
		expect(pickWeightedTemplate(templates, bySize, ['big', 'tiny'], () => 0.99)?.id).toBe('big');
	});

	it('falls back to a uniform pick when every pool is empty', () => {
		expect(
			pickWeightedTemplate(
				templates,
				() => 0,
				[],
				() => 0.6
			)?.id
		).toBe('big');
		expect(
			pickWeightedTemplate(
				templates,
				() => 0,
				[],
				() => 0.4
			)?.id
		).toBe('tiny');
	});

	it('never picks a template whose pool is empty when another has words', () => {
		const mixed = [
			{ id: 'empty', pool: 0 },
			{ id: 'full', pool: 4 }
		];
		for (const r of [0, 0.25, 0.5, 0.99]) {
			expect(pickWeightedTemplate(mixed, bySize, [], () => r)?.id).toBe('full');
		}
	});
});
