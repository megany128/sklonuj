import { describe, it, expect } from 'vitest';
import { loadWordBank } from './drill';
import { loadPronounBank, loadPronounTemplates } from './pronoun-drill';

// Decisions from a native speaker's read of the app (October 2026). The first
// form listed is the one shown as the answer; the others are still accepted.
describe('native review', () => {
	const pronoun = (lemma: string) => {
		const p = loadPronounBank().find((x) => x.lemma === lemma);
		if (!p) throw new Error(`missing pronoun ${lemma}`);
		return p;
	};

	it('shows něj before něho after a preposition, and still accepts něho', () => {
		for (const lemma of ['on', 'ono']) {
			expect(pronoun(lemma).forms.sg?.gen.prep, lemma).toBe('něj/něho');
		}
		expect(pronoun('on').forms.sg?.acc.prep).toBe('něj/něho');
	});

	it('shows mě before the bookish mne', () => {
		const ja = pronoun('já').forms.sg;
		expect(ja?.gen.prep).toBe('mě/mne');
		expect(ja?.gen.bare).toBe('mě/mne');
		expect(ja?.acc.prep).toBe('mě/mne');
	});

	it('shows dní as the genitive plural of den, with dnů accepted', () => {
		const den = loadWordBank().find((w) => w.lemma === 'den');
		expect(den?.forms.pl[1]).toBe('dní');
		expect(den?.variantForms?.pl?.[1]).toContain('dnů');
	});

	it('no longer drills se in "Ptal se na cestu", where it is part of the verb', () => {
		expect(loadPronounTemplates().some((t) => t.template === 'Ptal ___ na cestu.')).toBe(false);
	});
});
