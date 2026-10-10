import { describe, it, expect } from 'vitest';
import { deckQuery, grammarDecks, paradigmDecks, sentenceCountLabel } from './decks';
import { loadTemplates } from './drill';
import { determinerSentenceTemplates } from './determiners';
import { ALL_PARADIGMS } from '../types';

// What the Decks page passes in: noun sentences plus the determiner deck's own.
const templates = [...loadTemplates(), ...determinerSentenceTemplates()];

describe('grammar decks', () => {
	it('lists every deck with its sentences and cases for the level', () => {
		const decks = grammarDecks('A2', templates, {});
		expect(decks.map((d) => d.def.id)).toEqual(['direction', 'verbs', 'numbers', 'determiners']);
		for (const d of decks) {
			expect(d.unlocked).toBe(true);
			expect(d.sentences).toBeGreaterThan(5);
			expect(d.cases.length).toBeGreaterThanOrEqual(2);
			expect(d.stat).toBeUndefined();
		}
	});

	it('a deck above the level is listed as locked', () => {
		const numbers = grammarDecks('A1', templates, {}).find((d) => d.def.id === 'numbers');
		expect(numbers?.unlocked).toBe(false);
		expect(grammarDecks('A2', templates, {}).find((d) => d.def.id === 'numbers')?.cases).toEqual([
			'nom',
			'gen',
			'acc'
		]);
	});

	it('says when a level reaches only part of a deck', () => {
		const at = (level: 'A1' | 'B2', id: string) => {
			const deck = grammarDecks(level, templates, {}).find((d) => d.def.id === id);
			if (!deck) throw new Error(`no deck ${id}`);
			return { deck, label: sentenceCountLabel(deck, level) };
		};
		const a1 = at('A1', 'direction');
		expect(a1.deck.sentences).toBeLessThan(a1.deck.total);
		expect(a1.label).toBe(`${a1.deck.sentences} of ${a1.deck.total} sentences at A1`);
		const b2 = at('B2', 'direction');
		expect(b2.label).toBe(`${b2.deck.total} sentences`);
		// A locked deck shows its size, not "0 of 25".
		const locked = at('A1', 'numbers');
		expect(locked.label).toBe(`${locked.deck.total} sentences`);
	});

	it('counts only what the level can be asked: dative opens at A2', () => {
		const a1 = grammarDecks('A1', templates, {}).find((d) => d.def.id === 'direction');
		const a2 = grammarDecks('A2', templates, {}).find((d) => d.def.id === 'direction');
		expect(a1?.cases).not.toContain('dat');
		expect(a2?.cases).toContain('dat');
		expect(a2?.sentences ?? 0).toBeGreaterThan(a1?.sentences ?? 0);
		// Cases come back in the usual order, not the order sentences were written in.
		expect(a2?.cases).toEqual(['gen', 'dat', 'acc', 'loc']);
	});

	it('carries the saved progress onto its deck', () => {
		const stat = { attempts: 10, correct: 7, last: 1 };
		const decks = grammarDecks('B1', templates, { verbs: stat });
		expect(decks.find((d) => d.def.id === 'verbs')?.stat).toBe(stat);
		expect(decks.find((d) => d.def.id === 'direction')?.stat).toBeUndefined();
	});

	it('builds the practice link from the deck slug', () => {
		expect(deckQuery('direction')).toBe('?deck=kam-kde-odkud');
		expect(deckQuery('verbs')).toBe('?deck=verbs');
	});
});

describe('word-pattern decks', () => {
	it('has one deck per noun paradigm, summing its cells', () => {
		const decks = paradigmDecks({
			hrad_gen_sg: { attempts: 4, correct: 3 },
			hrad_loc_pl: { attempts: 2, correct: 1 },
			žena_acc_sg: { attempts: 5, correct: 5 },
			// Not noun cells: paradigm identification, adjective types, spacing keys.
			paradigm_id_hrad: { attempts: 9, correct: 9 },
			hard_f_acc_sg: { attempts: 3, correct: 0 },
			'n:hrad:gen:sg': { attempts: 7, correct: 7 },
			hrad_extra: { attempts: 8, correct: 8 }
		});
		expect(decks.map((d) => d.paradigm)).toEqual(ALL_PARADIGMS);
		expect(decks.find((d) => d.paradigm === 'hrad')).toEqual({
			paradigm: 'hrad',
			attempts: 6,
			correct: 4
		});
		expect(decks.find((d) => d.paradigm === 'žena')?.attempts).toBe(5);
		expect(decks.find((d) => d.paradigm === 'pán')).toEqual({
			paradigm: 'pán',
			attempts: 0,
			correct: 0
		});
	});
});
