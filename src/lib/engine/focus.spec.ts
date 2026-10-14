import { describe, it, expect } from 'vitest';
import {
	FOCUS_DEFS,
	directionContrast,
	directionRole,
	focusDef,
	focusFromSlug,
	focusUnlocked,
	isFocusTopic,
	placeKind,
	templatesForFocus,
	withDirectionContrast
} from './focus';
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

describe('focus topics', () => {
	it('recognises topic ids', () => {
		expect(isFocusTopic('direction')).toBe(true);
		expect(isFocusTopic('verbs')).toBe(true);
		expect(isFocusTopic('nonsense')).toBe(false);
		expect(isFocusTopic(null)).toBe(false);
	});

	it('resolves deck links, and gives each deck its own slug', () => {
		expect(focusFromSlug('kam-kde-odkud')).toBe('direction');
		expect(focusFromSlug('verbs')).toBe('verbs');
		expect(focusFromSlug('nope')).toBeNull();
		expect(focusFromSlug(null)).toBeNull();
		expect(new Set(FOCUS_DEFS.map((d) => d.slug)).size).toBe(FOCUS_DEFS.length);
		for (const d of FOCUS_DEFS) expect(d.slug).toMatch(/^[a-z0-9-]+$/);
	});

	it('filters templates to a topic, and passes everything through with no focus', () => {
		expect(templatesForFocus(templates, null)).toBe(templates);
		const direction = templatesForFocus(templates, 'direction');
		expect(direction.length).toBeGreaterThan(15);
		expect(direction.every((t) => t.topics?.includes('direction'))).toBe(true);
		expect(direction.some((t) => t.id === 'acc_na_009')).toBe(true);
		expect(direction.some((t) => t.id === 'dat_pomahat_024')).toBe(false);
	});

	it('unlocks by level', () => {
		expect(focusUnlocked('direction', 'A1')).toBe(true);
		expect(focusUnlocked('verbs', 'B2')).toBe(true);
	});

	// Decks made of tagged noun sentences; the determiner deck has its own
	// sentences and its own spec.
	it.each(FOCUS_DEFS.filter((d) => d.source === undefined).map((d) => d.id))(
		'%s has drillable sentences at every level it is offered',
		(id) => {
			for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
				if (!focusUnlocked(id, level)) continue;
				// A new learner has no plural yet, except in a deck that asks both.
				const bothNumbers = focusDef(id).bothNumbers === true;
				const usable = templatesForFocus(templates, id).filter(
					(t) =>
						(bothNumbers || t.number === 'sg') &&
						getCandidates(t, progressAt(level), { skipSingularFirst: bothNumbers }).length >= 5
				);
				// Enough sentences that a session doesn't loop on two of them.
				expect(usable.length, `${id} at ${level}`).toBeGreaterThanOrEqual(6);
				// And more than one case, or there is nothing to tell apart.
				expect(new Set(usable.map((t) => t.requiredCase)).size).toBeGreaterThanOrEqual(2);
			}
		}
	);

	it('every topic sentence can be drilled with several words at B2', () => {
		for (const t of templates.filter((x) => x.topics && x.topics.length > 0)) {
			expect(getCandidates(t, progressAt('B2')).length, t.id).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('Kam? Kde? Odkud?', () => {
	it('sorts nouns into their preposition set', () => {
		expect(placeKind(word('škola'))).toBe('v');
		expect(placeKind(word('pošta'))).toBe('na');
		expect(placeKind(word('babička'))).toBe('person');
		expect(placeKind(word('stůl'))).toBeNull();
		// A word tagged both ways goes with na, the marked choice (na hradě).
		expect(placeKind(word('hrad'))).toBe('na');
	});

	it('every direction sentence answers kam, kde or odkud', () => {
		for (const t of templatesForFocus(templates, 'direction')) {
			expect(directionRole(t), t.id).not.toBeNull();
		}
		expect(directionRole(template('gen_do_011'))).toBe('kam');
		expect(directionRole(template('loc_v_256'))).toBe('kde');
		expect(directionRole(template('gen_z_257'))).toBe('odkud');
		expect(directionRole(template('dat_pomahat_024'))).toBeNull();
	});

	it('builds the three-way contrast with voiced prepositions, asked one in bold', () => {
		expect(directionContrast(template('loc_v_256'), word('škola'))).toBe(
			'Compare: Kam? do školy · **Kde? ve škole** · Odkud? ze školy'
		);
		expect(directionContrast(template('acc_na_009'), word('pošta'))).toBe(
			'Compare: **Kam? na poštu** · Kde? na poště · Odkud? z pošty'
		);
		expect(directionContrast(template('gen_od_261'), word('babička'))).toBe(
			'Compare: Kam? k babičce · Kde? u babičky · **Odkud? od babičky**'
		);
		// z serves both do- and na-places; the word decides the other two.
		expect(directionContrast(template('gen_z_258'), word('pošta'))).toBe(
			'Compare: Kam? na poštu · Kde? na poště · **Odkud? z pošty**'
		);
	});

	it('gives no contrast when the sentence and the word disagree, or outside the topic', () => {
		// v + a noun that takes na (v hradě is possible, but the set shown would be na's).
		expect(directionContrast(template('loc_v_256'), word('hrad'))).toBeNull();
		expect(directionContrast(template('dat_pomahat_024'), word('babička'))).toBeNull();
		expect(directionContrast(template('gen_do_011'), word('stůl'))).toBeNull();
	});

	it('appends the contrast to the why without touching its first line', () => {
		const t = template('loc_v_256');
		const withContrast = withDirectionContrast(t, word('škola'));
		expect(withContrast.why.split('\n')[0]).toBe(t.why.split('\n')[0]);
		expect(withContrast.why).toContain('Compare: Kam? do školy');
		expect(withContrast.id).toBe(t.id);
		expect(withDirectionContrast(t, word('hrad'))).toBe(t);
	});

	it('every question built from a direction sentence carries the contrast', () => {
		const t = template('gen_do_011');
		const w = word('škola');
		expect(generateSentenceDrill(t, w)?.template.why).toContain('**Kam? do školy**');
		expect(generateCaseIdentification(t, w).template.why).toContain('**Kam? do školy**');
		expect(generateMultiStepQuestion(w, t, true)?.template.why).toContain('**Kam? do školy**');
		// Sentences outside the topic are passed through as they are.
		const plain = template('dat_pomahat_024');
		expect(generateSentenceDrill(plain, word('babička'))?.template).toBe(plain);
	});

	it('the contrast is right for every word each direction sentence can take', () => {
		for (const t of templatesForFocus(templates, 'direction')) {
			for (const w of getCandidates(t, progressAt('B2'))) {
				const contrast = directionContrast(t, w);
				if (contrast === null) continue;
				expect(contrast.match(/\*\*/g)?.length, `${t.id} ${w.lemma}`).toBe(2);
				expect(contrast).toMatch(
					/^Compare: (\*\*)?Kam\? .+ · (\*\*)?Kde\? .+ · (\*\*)?Odkud\? .+$/
				);
			}
		}
	});
});

describe('place names in Kam? Kde? Odkud?', () => {
	it('builds the contrast for a city and for a "na" region', () => {
		expect(directionContrast(template('loc_v_256'), word('Praha'))).toBe(
			'Compare: Kam? do Prahy · **Kde? v Praze** · Odkud? z Prahy'
		);
		expect(directionContrast(template('loc_na_264'), word('Morava'))).toBe(
			'Compare: Kam? na Moravu · **Kde? na Moravě** · Odkud? z Moravy'
		);
	});

	it('walking sentences skip them: you go to Prague by "jet", not "jít"', () => {
		const lemmas = (id: string) =>
			getCandidates(template(id), progressAt('B2')).map((w) => w.lemma);
		expect(lemmas('gen_z_257')).not.toContain('Praha'); // Jdu z ___.
		expect(lemmas('acc_na_263')).not.toContain('Morava'); // Jdeme na ___.
		expect(lemmas('loc_v_256')).toContain('Praha'); // Jsem v ___.
		expect(lemmas('loc_na_264')).toContain('Morava'); // Jsme na ___.
	});
});
