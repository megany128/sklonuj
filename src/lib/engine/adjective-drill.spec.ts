import { describe, expect, it } from 'vitest';
import {
	adjectiveMatchesNoun,
	filterAdjectivesByTemplate,
	loadAdjectiveBank
} from './adjective-drill.ts';
import type { AdjectiveEntry, AdjectiveProfile, SentenceTemplate, WordEntry } from '../types.ts';

// ---------------------------------------------------------------------------
// Helpers — build minimal stubs with only the fields adjectiveMatchesNoun and
// filterAdjectivesByTemplate inspect.
// ---------------------------------------------------------------------------

const EMPTY_CASE_FORMS: [string, string, string, string, string, string, string] = [
	'',
	'',
	'',
	'',
	'',
	'',
	''
];

const EMPTY_GENDER_FORMS = { sg: EMPTY_CASE_FORMS, pl: EMPTY_CASE_FORMS };

function stubAdj(
	lemma: string,
	profile: AdjectiveProfile,
	categories: string[] = []
): AdjectiveEntry {
	return {
		lemma,
		translation: '',
		difficulty: 'A1',
		paradigmType: 'hard',
		categories,
		profile,
		forms: {
			m_anim: EMPTY_GENDER_FORMS,
			m_inanim: EMPTY_GENDER_FORMS,
			f: EMPTY_GENDER_FORMS,
			n: EMPTY_GENDER_FORMS
		}
	};
}

function stubNoun(lemma: string, categories: string[]): WordEntry {
	return {
		lemma,
		translation: '',
		gender: 'm',
		animate: false,
		paradigm: 'hrad',
		difficulty: 'A1',
		categories,
		forms: { sg: EMPTY_CASE_FORMS, pl: EMPTY_CASE_FORMS }
	};
}

// ---------------------------------------------------------------------------
// Profile compatibility — positive matches
// ---------------------------------------------------------------------------

describe('adjectiveMatchesNoun — positive (should match)', () => {
	it('1. quality adj + any noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('nový', 'quality'), stubNoun('dům', ['objects']))).toBe(
			true
		);
		expect(
			adjectiveMatchesNoun(stubAdj('nový', 'quality'), stubNoun('problém', ['abstract']))
		).toBe(true);
	});

	it('2. dimensionless adj + any noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('velký', 'dimensionless'), stubNoun('dům', ['objects']))
		).toBe(true);
		expect(
			adjectiveMatchesNoun(stubAdj('velký', 'dimensionless'), stubNoun('radost', ['abstract']))
		).toBe(true);
	});

	it('3. color + objects noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('červený', 'color'), stubNoun('auto', ['objects']))).toBe(
			true
		);
	});

	it('4. color + clothing noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('modrý', 'color'), stubNoun('šaty', ['clothing']))).toBe(
			true
		);
	});

	it('5. temperature + food noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('teplý', 'temperature'), stubNoun('polévka', ['food']))
		).toBe(true);
	});

	it('6. taste + food noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('sladký', 'taste'), stubNoun('dort', ['food']))).toBe(true);
	});

	it('7. physical_extent + objects noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('dlouhý', 'physical_extent'), stubNoun('stůl', ['objects']))
		).toBe(true);
	});

	it('8. speed + animals noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('rychlý', 'speed'), stubNoun('kůň', ['animals']))).toBe(
			true
		);
	});

	it('9. person_trait + people noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('nemocný', 'person_trait'), stubNoun('muž', ['people']))
		).toBe(true);
	});

	it('10. emotion + people noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('spokojený', 'emotion'), stubNoun('žena', ['people']))
		).toBe(true);
	});

	it('11. seasonal + clothing noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('jarní', 'seasonal'), stubNoun('bunda', ['clothing']))
		).toBe(true);
	});

	it('12. domain + event noun → true', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('historický', 'domain'), stubNoun('událost', ['event']))
		).toBe(true);
	});

	it('13. abundance + people noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('bohatý', 'abundance'), stubNoun('muž', ['people']))).toBe(
			true
		);
	});

	it('14. wealth + objects noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('drahý', 'wealth'), stubNoun('hodinky', ['objects']))).toBe(
			true
		);
	});

	it('15. nationality + any noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('český', 'nationality'), stubNoun('pivo', ['food']))).toBe(
			true
		);
		expect(
			adjectiveMatchesNoun(stubAdj('český', 'nationality'), stubNoun('problém', ['abstract']))
		).toBe(true);
	});

	it('16. ordinal + any noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('první', 'ordinal'), stubNoun('den', ['time']))).toBe(true);
		expect(adjectiveMatchesNoun(stubAdj('první', 'ordinal'), stubNoun('muž', ['people']))).toBe(
			true
		);
	});

	it('17. aesthetic + any noun → true', () => {
		expect(adjectiveMatchesNoun(stubAdj('hezký', 'aesthetic'), stubNoun('dům', ['objects']))).toBe(
			true
		);
		expect(
			adjectiveMatchesNoun(stubAdj('hezký', 'aesthetic'), stubNoun('myšlenka', ['abstract']))
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Profile compatibility — negative matches
// ---------------------------------------------------------------------------

describe('adjectiveMatchesNoun — negative (should NOT match)', () => {
	it('18. color + abstract-only noun → false', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('červený', 'color'), stubNoun('problém', ['abstract']))
		).toBe(false);
	});

	it('19. temperature + abstract-only noun → false', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('teplý', 'temperature'), stubNoun('problém', ['abstract']))
		).toBe(false);
	});

	it('20. taste + people noun → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('sladký', 'taste'), stubNoun('muž', ['people']))).toBe(
			false
		);
	});

	it('21. taste + objects noun → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('kyselý', 'taste'), stubNoun('stůl', ['objects']))).toBe(
			false
		);
	});

	it('22. physical_extent + animals noun → false', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('dlouhý', 'physical_extent'), stubNoun('kočka', ['animals']))
		).toBe(false);
	});

	it('23. speed + food noun → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('rychlý', 'speed'), stubNoun('dort', ['food']))).toBe(
			false
		);
	});

	it('24. person_trait + objects noun → false', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('nemocný', 'person_trait'), stubNoun('stůl', ['objects']))
		).toBe(false);
	});

	it('25. emotion + food noun → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('spokojený', 'emotion'), stubNoun('dort', ['food']))).toBe(
			false
		);
	});

	it('26. seasonal + abstract-only noun → false', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('jarní', 'seasonal'), stubNoun('problém', ['abstract']))
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Smart rules
// ---------------------------------------------------------------------------

describe('adjectiveMatchesNoun — smart rules', () => {
	it('27. seasonal + season noun (léto) → false (season-on-season)', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('jarní', 'seasonal'), stubNoun('léto', ['season', 'time']))
		).toBe(false);
	});

	it('28. domain + feeling noun (radost) → false (domain×feeling rule)', () => {
		expect(
			adjectiveMatchesNoun(
				stubAdj('historický', 'domain'),
				stubNoun('radost', ['abstract', 'feeling'])
			)
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Ban list
// ---------------------------------------------------------------------------

describe('adjectiveMatchesNoun — ban list', () => {
	it('29. dlouhý + srdce → false', () => {
		expect(
			adjectiveMatchesNoun(stubAdj('dlouhý', 'physical_extent'), stubNoun('srdce', ['body']))
		).toBe(false);
	});

	it('30. sladký + ocet → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('sladký', 'taste'), stubNoun('ocet', ['food']))).toBe(
			false
		);
	});

	it('31. jarní + minulost → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('jarní', 'seasonal'), stubNoun('minulost', ['era']))).toBe(
			false
		);
	});

	it('32. bohatý + had → false', () => {
		expect(adjectiveMatchesNoun(stubAdj('bohatý', 'abundance'), stubNoun('had', ['animals']))).toBe(
			false
		);
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('adjectiveMatchesNoun — edge cases', () => {
	it('33. noun with multiple categories, one matching → true', () => {
		// "abstract" doesn't match color, but "objects" does
		expect(
			adjectiveMatchesNoun(stubAdj('červený', 'color'), stubNoun('kniha', ['objects', 'readable']))
		).toBe(true);
	});

	it('34. noun with only misc category + narrow profile (taste) → false', () => {
		// misc is not in the taste compat list
		expect(adjectiveMatchesNoun(stubAdj('sladký', 'taste'), stubNoun('věc', ['misc']))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// filterAdjectivesByTemplate
// ---------------------------------------------------------------------------

describe('filterAdjectivesByTemplate', () => {
	const personAdj = stubAdj('nemocný', 'person_trait', ['person']);
	const objectAdj = stubAdj('červený', 'color', ['object']);
	const universalAdj = stubAdj('nový', 'quality', ['universal']);
	const candidates = [personAdj, objectAdj, universalAdj];

	it('35. template with adjectiveCategories ["person"] returns only person adjectives', () => {
		const template: SentenceTemplate = {
			id: 'test_person',
			template: '{adj} {noun}',
			lemmaCategory: 'adjective',
			requiredCase: 'nom',
			number: 'sg',
			trigger: '',
			why: '',
			difficulty: 'A1',
			adjectiveCategories: ['person']
		};
		const result = filterAdjectivesByTemplate(candidates, template);
		expect(result).toHaveLength(1);
		expect(result[0].lemma).toBe('nemocný');
	});

	it('36. template with adjectiveCategories ["universal", "object"] returns matching adjectives', () => {
		const template: SentenceTemplate = {
			id: 'test_multi',
			template: '{adj} {noun}',
			lemmaCategory: 'adjective',
			requiredCase: 'nom',
			number: 'sg',
			trigger: '',
			why: '',
			difficulty: 'A1',
			adjectiveCategories: ['universal', 'object']
		};
		const result = filterAdjectivesByTemplate(candidates, template);
		expect(result).toHaveLength(2);
		const lemmas = result.map((a) => a.lemma);
		expect(lemmas).toContain('červený');
		expect(lemmas).toContain('nový');
	});
});

// ---------------------------------------------------------------------------
// loadAdjectiveBank smoke test
// ---------------------------------------------------------------------------

describe('loadAdjectiveBank', () => {
	it('returns non-empty array with expected shape', () => {
		const bank = loadAdjectiveBank();
		expect(bank.length).toBeGreaterThan(0);
		const first = bank[0];
		expect(first).toHaveProperty('lemma');
		expect(first).toHaveProperty('profile');
		expect(first).toHaveProperty('categories');
		expect(first).toHaveProperty('forms');
	});
});
