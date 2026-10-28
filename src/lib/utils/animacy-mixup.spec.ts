import { describe, it, expect } from 'vitest';
import { adjectiveAnimacyMixup, nounAnimacyMixup, paradigmAnimacyMixup } from './animacy-mixup';
import { loadWordBank } from '$lib/engine/drill';
import { loadAdjectiveBank } from '$lib/engine/adjective-drill';
import type { AdjectiveEntry, Case, Number_, WordEntry } from '$lib/types';

const bank = loadWordBank();
const adjectives = loadAdjectiveBank();

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

function adjective(lemma: string): AdjectiveEntry {
	const a = adjectives.find((x) => x.lemma === lemma);
	if (!a) throw new Error(`missing adjective ${lemma}`);
	return a;
}

function slot(case_: Case, number: Number_): { case: Case; number: Number_ } {
	return { case: case_, number };
}

describe('nounAnimacyMixup', () => {
	it('catches the nominative typed for an animate accusative', () => {
		expect(nounAnimacyMixup(word('student'), slot('acc', 'sg'), 'student')).toBe(
			'student is animate, so accusative = genitive: studenta.'
		);
	});

	it('catches the genitive typed for an inanimate accusative', () => {
		expect(nounAnimacyMixup(word('stůl'), slot('acc', 'sg'), 'stolu')).toContain(
			'stůl is inanimate, so accusative = nominative: stůl.'
		);
		expect(nounAnimacyMixup(word('stroj'), slot('acc', 'sg'), 'Stroje ')).toContain(
			'stroj is inanimate'
		);
	});

	it('uses the accusative rule for an animate ending on an inanimate accusative', () => {
		expect(nounAnimacyMixup(word('hrad'), slot('acc', 'sg'), 'hrada')).toContain(
			'hrad is inanimate, so accusative = nominative: hrad.'
		);
	});

	it('catches nominative and accusative plural swapped on animate nouns', () => {
		expect(nounAnimacyMixup(word('kluk'), slot('nom', 'pl'), 'kluky')).toContain(
			'kluk is animate: nominative plural is kluci, not kluky.'
		);
		expect(nounAnimacyMixup(word('pes'), slot('acc', 'pl'), 'psi')).toContain(
			'pes is animate: accusative plural is psy, not psi.'
		);
	});

	it('catches an ending borrowed from the other-animacy paradigm', () => {
		expect(nounAnimacyMixup(word('student'), slot('gen', 'sg'), 'studentu')).toBe(
			'student is animate: -u is for inanimate nouns like hrad. Use studenta.'
		);
		expect(nounAnimacyMixup(word('hrad'), slot('nom', 'pl'), 'hradi')).toContain(
			'hrad is inanimate: -i is for animate nouns like pán. Use hrady.'
		);
		expect(nounAnimacyMixup(word('stroj'), slot('acc', 'pl'), 'stroje')).toBeNull();
	});

	it('stays quiet for right answers, accepted variants and other mistakes', () => {
		expect(nounAnimacyMixup(word('student'), slot('acc', 'sg'), 'studenta')).toBeNull();
		expect(nounAnimacyMixup(word('pán'), slot('dat', 'sg'), 'pánu')).toBeNull();
		expect(nounAnimacyMixup(word('pán'), slot('dat', 'sg'), 'pánem')).toBeNull();
		expect(nounAnimacyMixup(word('hrad'), slot('acc', 'sg'), '')).toBeNull();
		const zena = bank.find((w) => w.paradigm === 'žena');
		if (!zena) throw new Error('missing žena noun');
		expect(nounAnimacyMixup(zena, slot('acc', 'sg'), zena.forms.sg[0])).toBeNull();
	});
});

describe('adjectiveAnimacyMixup', () => {
	it('catches the inanimate form on an animate noun and vice versa', () => {
		expect(
			adjectiveAnimacyMixup(adjective('nový'), word('student'), slot('acc', 'sg'), 'nový')
		).toBe('student is animate: use nového, not nový.');
		expect(
			adjectiveAnimacyMixup(adjective('nový'), word('stůl'), slot('nom', 'pl'), 'noví')
		).toContain('stůl is inanimate: use nové, not noví.');
	});

	it('names the sentence noun rather than the stand-in word', () => {
		expect(
			adjectiveAnimacyMixup(adjective('nový'), word('stůl'), slot('acc', 'sg'), 'nového', 'dům')
		).toBe('dům is inanimate: use nový, not nového.');
	});

	it('stays quiet when the forms agree or the answer is something else', () => {
		const novy = adjective('nový');
		expect(adjectiveAnimacyMixup(novy, word('student'), slot('acc', 'sg'), 'nového')).toBeNull();
		expect(adjectiveAnimacyMixup(novy, word('student'), slot('gen', 'sg'), 'novém')).toBeNull();
	});
});

describe('paradigmAnimacyMixup', () => {
	it('flags a masculine noun filed under the other animacy', () => {
		expect(paradigmAnimacyMixup(word('stůl'), 'pán')).toContain('stůl is inanimate');
		expect(paradigmAnimacyMixup(word('student'), 'hrad')).toContain('student is animate');
	});

	it('ignores same-animacy and non-masculine picks', () => {
		expect(paradigmAnimacyMixup(word('stůl'), 'stroj')).toBeNull();
		expect(paradigmAnimacyMixup(word('student'), 'muž')).toBeNull();
		expect(paradigmAnimacyMixup(word('student'), 'žena')).toBeNull();
	});
});

describe('nounAnimacyMixup with a softened stem', () => {
	it('matches the stem on a variant when the primary alternates it', () => {
		expect(nounAnimacyMixup(word('papír'), slot('loc', 'sg'), 'papírovi')).toBe(
			'papír is inanimate: -ovi is for animate nouns like pán. Use papíře or papíru.'
		);
	});
});
