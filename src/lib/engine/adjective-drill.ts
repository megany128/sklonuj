import type {
	AdjectiveEntry,
	AdjectiveGenderKey,
	AdjectiveParadigmType,
	AdjectiveProfile,
	Case,
	CaseForms,
	CaseIndex,
	CaseScore,
	Difficulty,
	DrillQuestion,
	DrillResult,
	Gender,
	Number_,
	Progress,
	SentenceTemplate,
	VariantForms,
	WordEntry
} from '../types';
import { CASE_INDEX, isCase, isNumber } from '../types';
import adjectiveBankData from '../data/adjective_bank.json';
import adjectiveTemplateData from '../data/adjective_templates.json';
import blockedAdjNounPairsData from '../data/blocked_adj_noun_pairs.json';
import { stripDiacritics } from '../utils/diacritics';
import { getBlockedLemmaSet } from './lemma-blocks';

// Hand-curated list of adjective+noun lemma pairs that the engine should never
// surface, even when the profile/category compatibility check passes. Used for
// the long-tail of awkward combinations that don't fit any clean rule —
// season-on-season ("jarní léto"), unusual collocations, etc.
function loadBlockedAdjNounPairs(): ReadonlySet<string> {
	const raw: unknown = blockedAdjNounPairsData;
	if (!Array.isArray(raw)) {
		throw new Error('blocked_adj_noun_pairs.json must be an array');
	}
	const set = new Set<string>();
	for (const entry of raw) {
		if (
			!Array.isArray(entry) ||
			entry.length !== 2 ||
			typeof entry[0] !== 'string' ||
			typeof entry[1] !== 'string'
		) {
			throw new Error(
				'blocked_adj_noun_pairs.json entries must be [adjective_lemma, noun_lemma] pairs'
			);
		}
		set.add(`${entry[0]}|${entry[1]}`);
	}
	return set;
}

const BLOCKED_ADJ_NOUN_PAIRS = loadBlockedAdjNounPairs();

function isBlockedAdjNounPair(adjLemma: string, nounLemma: string): boolean {
	return BLOCKED_ADJ_NOUN_PAIRS.has(`${adjLemma}|${nounLemma}`);
}

// ---------------------------------------------------------------------------
// Raw JSON interfaces (pre-validation)
// ---------------------------------------------------------------------------

interface RawAdjectiveGenderForms {
	sg: unknown;
	pl: unknown;
}

interface RawAdjectiveEntry {
	lemma: string;
	translation: string;
	difficulty: string;
	paradigmType: string;
	categories: string[];
	profile: string;
	forms: Record<string, RawAdjectiveGenderForms>;
	variantForms?: Record<string, Record<string, Record<string, string[] | undefined> | undefined>>;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_DIFFICULTIES = new Set<string>(['A1', 'A2', 'B1', 'B2']);
const VALID_PARADIGM_TYPES = new Set<string>(['hard', 'soft']);
const VALID_GENDER_KEYS = new Set<string>(['m_anim', 'm_inanim', 'f', 'n']);
const VALID_ADJECTIVE_PROFILES = new Set<string>([
	'quality',
	'dimensionless',
	'physical_extent',
	'color',
	'temperature',
	'taste',
	'wealth',
	'abundance',
	'seasonal',
	'domain',
	'nationality',
	'ordinal',
	'aesthetic',
	'speed',
	'person_trait',
	'emotion'
]);

function isAdjectiveProfile(value: string): value is AdjectiveProfile {
	return VALID_ADJECTIVE_PROFILES.has(value);
}

function isDifficulty(value: string): value is Difficulty {
	return VALID_DIFFICULTIES.has(value);
}

function isAdjectiveParadigmType(value: string): value is AdjectiveParadigmType {
	return VALID_PARADIGM_TYPES.has(value);
}

function isAdjectiveGenderKey(value: string): value is AdjectiveGenderKey {
	return VALID_GENDER_KEYS.has(value);
}

function isCaseForms(value: unknown): value is CaseForms {
	return Array.isArray(value) && value.length === 7 && value.every((v) => typeof v === 'string');
}

function toCaseIndex(n: number): CaseIndex {
	if (n === 0 || n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) {
		return n;
	}
	throw new Error(`Invalid case index ${n}`);
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedAdjectiveBank: AdjectiveEntry[] | null = null;
let cachedAdjectiveTemplates: SentenceTemplate[] | null = null;

// ---------------------------------------------------------------------------
// 1. loadAdjectiveBank
// ---------------------------------------------------------------------------

export function loadAdjectiveBank(): AdjectiveEntry[] {
	if (cachedAdjectiveBank) return cachedAdjectiveBank;

	const rawEntries: RawAdjectiveEntry[] = adjectiveBankData;
	cachedAdjectiveBank = rawEntries.map((entry) => {
		if (!isDifficulty(entry.difficulty)) {
			throw new Error(`Invalid difficulty "${entry.difficulty}" for adjective "${entry.lemma}"`);
		}
		if (!isAdjectiveParadigmType(entry.paradigmType)) {
			throw new Error(
				`Invalid paradigmType "${entry.paradigmType}" for adjective "${entry.lemma}"`
			);
		}

		function validateGenderForms(
			gk: AdjectiveGenderKey,
			lemma: string
		): { sg: CaseForms; pl: CaseForms } {
			const rawGender = entry.forms[gk];
			if (!rawGender) {
				throw new Error(`Missing gender key "${gk}" for adjective "${lemma}"`);
			}
			if (!isCaseForms(rawGender.sg)) {
				throw new Error(`Invalid sg forms for "${gk}" in adjective "${lemma}"`);
			}
			if (!isCaseForms(rawGender.pl)) {
				throw new Error(`Invalid pl forms for "${gk}" in adjective "${lemma}"`);
			}
			return { sg: rawGender.sg, pl: rawGender.pl };
		}

		const forms: Record<AdjectiveGenderKey, { sg: CaseForms; pl: CaseForms }> = {
			m_anim: validateGenderForms('m_anim', entry.lemma),
			m_inanim: validateGenderForms('m_inanim', entry.lemma),
			f: validateGenderForms('f', entry.lemma),
			n: validateGenderForms('n', entry.lemma)
		};

		if (!isAdjectiveProfile(entry.profile)) {
			throw new Error(`Invalid profile "${entry.profile}" for adjective "${entry.lemma}"`);
		}

		const adjective: AdjectiveEntry = {
			lemma: entry.lemma,
			translation: entry.translation,
			difficulty: entry.difficulty,
			paradigmType: entry.paradigmType,
			categories: entry.categories,
			profile: entry.profile,
			forms
		};

		// Parse variant forms if present
		if (entry.variantForms) {
			const vf: Partial<Record<AdjectiveGenderKey, { sg?: VariantForms; pl?: VariantForms }>> = {};
			for (const [gk, genderVariants] of Object.entries(entry.variantForms)) {
				if (!isAdjectiveGenderKey(gk) || !genderVariants) continue;
				const parsed: { sg?: VariantForms; pl?: VariantForms } = {};
				if (genderVariants.sg) {
					const sgVariants: VariantForms = {};
					for (const [k, v] of Object.entries(genderVariants.sg)) {
						if (v) sgVariants[toCaseIndex(Number(k))] = v;
					}
					parsed.sg = sgVariants;
				}
				if (genderVariants.pl) {
					const plVariants: VariantForms = {};
					for (const [k, v] of Object.entries(genderVariants.pl)) {
						if (v) plVariants[toCaseIndex(Number(k))] = v;
					}
					parsed.pl = plVariants;
				}
				vf[gk] = parsed;
			}
			adjective.variantForms = vf;
		}

		return adjective;
	});

	return cachedAdjectiveBank;
}

// ---------------------------------------------------------------------------
// 2. loadAdjectiveTemplates
// ---------------------------------------------------------------------------

interface RawAdjectiveTemplate {
	id: string;
	template: string;
	requiredCase: string;
	number: string;
	trigger: string;
	requiredGender?: string;
	requiredAnimate?: boolean;
	adjectiveCategories?: string[];
	why: string;
	difficulty: string;
}

export function loadAdjectiveTemplates(): SentenceTemplate[] {
	if (cachedAdjectiveTemplates) return cachedAdjectiveTemplates;

	const rawEntries: RawAdjectiveTemplate[] = adjectiveTemplateData;
	cachedAdjectiveTemplates = rawEntries.map((entry) => {
		if (!isCase(entry.requiredCase)) {
			throw new Error(
				`Invalid requiredCase "${entry.requiredCase}" in adjective template "${entry.id}"`
			);
		}
		if (!isNumber(entry.number)) {
			throw new Error(`Invalid number "${entry.number}" in adjective template "${entry.id}"`);
		}
		if (!isDifficulty(entry.difficulty)) {
			throw new Error(
				`Invalid difficulty "${entry.difficulty}" in adjective template "${entry.id}"`
			);
		}

		const mapped: SentenceTemplate = {
			id: entry.id,
			template: entry.template,
			lemmaCategory: 'adjective',
			requiredCase: entry.requiredCase,
			number: entry.number,
			trigger: entry.trigger,
			why: entry.why,
			difficulty: entry.difficulty
		};

		if (entry.requiredGender) {
			const g = entry.requiredGender;
			if (g === 'm' || g === 'f' || g === 'n') {
				mapped.requiredGender = g;
			}
		}
		if (typeof entry.requiredAnimate === 'boolean') {
			mapped.requiredAnimate = entry.requiredAnimate;
		}
		if (Array.isArray(entry.adjectiveCategories) && entry.adjectiveCategories.length > 0) {
			mapped.adjectiveCategories = entry.adjectiveCategories;
		}

		return mapped;
	});

	return cachedAdjectiveTemplates;
}

// ---------------------------------------------------------------------------
// 3. getAdjectiveGenderKey — map noun gender+animacy to adjective gender key
// ---------------------------------------------------------------------------

export function getAdjectiveGenderKey(word: WordEntry): AdjectiveGenderKey {
	if (word.gender === 'm') {
		return word.animate ? 'm_anim' : 'm_inanim';
	}
	if (word.gender === 'f') return 'f';
	return 'n';
}

export function genderKeyFromGenderAnimate(gender: Gender, animate: boolean): AdjectiveGenderKey {
	if (gender === 'm') return animate ? 'm_anim' : 'm_inanim';
	if (gender === 'f') return 'f';
	return 'n';
}

// ---------------------------------------------------------------------------
// 4. getAdjectiveForm — look up a specific form
// ---------------------------------------------------------------------------

export function getAdjectiveForm(
	adj: AdjectiveEntry,
	genderKey: AdjectiveGenderKey,
	case_: Case,
	number_: Number_
): string | null {
	const genderForms = adj.forms[genderKey];
	if (!genderForms) return null;
	const form = genderForms[number_][CASE_INDEX[case_]];
	return form && form.trim().length > 0 ? form : null;
}

// ---------------------------------------------------------------------------
// 5. getAllAdjectiveAcceptedForms — primary + variant forms
// ---------------------------------------------------------------------------

export function getAllAdjectiveAcceptedForms(
	adj: AdjectiveEntry,
	genderKey: AdjectiveGenderKey,
	case_: Case,
	number_: Number_
): string[] {
	const primary = getAdjectiveForm(adj, genderKey, case_, number_);
	if (!primary) return [];
	const forms = [primary];

	const variants = adj.variantForms?.[genderKey];
	if (variants) {
		const numberVariants = variants[number_];
		if (numberVariants) {
			const caseIdx = CASE_INDEX[case_];
			const alts = numberVariants[caseIdx];
			if (alts) forms.push(...alts);
		}
	}

	return forms;
}

// ---------------------------------------------------------------------------
// 7. generateAdjectiveSentenceDrill — sentence fill-in with adjective blank
// ---------------------------------------------------------------------------

export function generateAdjectiveSentenceDrill(
	template: SentenceTemplate,
	adj: AdjectiveEntry,
	word: WordEntry
): DrillQuestion | null {
	const genderKey = getAdjectiveGenderKey(word);
	const correctAnswer = getAdjectiveForm(adj, genderKey, template.requiredCase, template.number);
	if (!correctAnswer) return null;

	const acceptedAnswers = getAllAdjectiveAcceptedForms(
		adj,
		genderKey,
		template.requiredCase,
		template.number
	);

	return {
		word,
		template,
		correctAnswer,
		case: template.requiredCase,
		number: template.number,
		drillType: 'sentence_fill_in',
		wordCategory: 'adjective',
		adjective: adj,
		acceptedAnswers
	};
}

// ---------------------------------------------------------------------------
// 7b. generateAdjectiveFormProduction — no sentence context, just lemma + target case/gender/number
// ---------------------------------------------------------------------------

export function generateAdjectiveFormProduction(
	adj: AdjectiveEntry,
	genderKey: AdjectiveGenderKey,
	case_: Case,
	number_: Number_,
	word: WordEntry
): DrillQuestion | null {
	// Skip nominative — it is the lemma form (trivial for hard paradigm adj.)
	if (case_ === 'nom' && number_ === 'sg') return null;

	const correctAnswer = getAdjectiveForm(adj, genderKey, case_, number_);
	if (!correctAnswer) return null;

	const acceptedAnswers = getAllAdjectiveAcceptedForms(adj, genderKey, case_, number_);

	// Build a synthetic template so the rest of the pipeline can work uniformly
	const syntheticTemplate: SentenceTemplate = {
		id: '_adj_form_production',
		template: `{adj} (${adj.lemma})`,
		lemmaCategory: 'general',
		requiredCase: case_,
		number: number_,
		trigger: '',
		why: `Decline the adjective "${adj.lemma}" to match the ${genderKey.replace('_', ' ')} noun "${word.lemma}" in the required case and number.`,
		difficulty: adj.difficulty
	};

	return {
		word,
		template: syntheticTemplate,
		correctAnswer,
		case: case_,
		number: number_,
		drillType: 'form_production',
		wordCategory: 'adjective',
		adjective: adj,
		acceptedAnswers
	};
}

// ---------------------------------------------------------------------------
// 8. checkAdjectiveAnswer
// ---------------------------------------------------------------------------

export function checkAdjectiveAnswer(
	question: DrillQuestion,
	userAnswer: string,
	level: Difficulty = 'A1'
): DrillResult | null {
	if (!question.adjective || !question.acceptedAnswers) return null;

	const trimmedUser = userAnswer.trim().toLowerCase();
	const trimmedCorrect = question.correctAnswer.trim().toLowerCase();

	if (trimmedCorrect === '') {
		console.warn(
			`[adjective-drill] Skipping question with empty correct answer: adj="${question.adjective.lemma}", case=${question.case}, number=${question.number}`
		);
		return null;
	}

	// Exact match against any accepted form
	for (const form of question.acceptedAnswers) {
		if (trimmedUser === form.trim().toLowerCase()) {
			return { question, userAnswer, correct: true, nearMiss: false };
		}
	}

	// Accidental case detection — check if the user's answer matches a different case
	const adj = question.adjective;
	const genderKey = getAdjectiveGenderKey(question.word);
	const ALL_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
	const numbers: Number_[] = question.number === 'sg' ? ['sg', 'pl'] : ['pl', 'sg'];
	let accidentalCase: { case: Case; number: Number_ } | undefined;

	outer: for (const num of numbers) {
		for (const c of ALL_CASES) {
			if (c === question.case && num === question.number) continue;
			const allForms = getAllAdjectiveAcceptedForms(adj, genderKey, c, num);
			for (const f of allForms) {
				if (f && trimmedUser === f.trim().toLowerCase()) {
					accidentalCase = { case: c, number: num };
					break outer;
				}
			}
		}
	}

	if (accidentalCase) {
		return { question, userAnswer, correct: false, nearMiss: false, accidentalCase };
	}

	// Near-miss (diacritics only). At A1/A2 lenient (correct + flag); at B1/B2 strict.
	const strippedUser = stripDiacritics(trimmedUser);
	const lenient = level === 'A1' || level === 'A2';
	for (const form of question.acceptedAnswers) {
		const stripped = stripDiacritics(form.trim().toLowerCase());
		if (strippedUser === stripped) {
			return { question, userAnswer, correct: lenient, nearMiss: true };
		}
	}

	return { question, userAnswer, correct: false, nearMiss: false };
}

// ---------------------------------------------------------------------------
// 9. weightedRandomAdjective — pick adjective weighted by weakness
// ---------------------------------------------------------------------------

export function weightedRandomAdjective(
	candidates: AdjectiveEntry[],
	progress: Progress,
	case_: Case,
	number_: Number_,
	word: WordEntry
): AdjectiveEntry {
	if (candidates.length === 0) {
		throw new Error('weightedRandomAdjective called with empty candidates array');
	}

	const genderKey = getAdjectiveGenderKey(word);
	const weights = candidates.map((adj) => {
		const paradigmKey = adjectiveParadigmKey(adj.lemma, genderKey, case_, number_);
		const score: CaseScore | undefined = progress.paradigmScores[paradigmKey];
		const rawAccuracy = score && score.attempts > 0 ? score.correct / score.attempts : 0;
		const accuracy = Math.min(rawAccuracy, 1);
		return 1 / (accuracy + 0.1);
	});

	const totalWeight = weights.reduce((sum, w) => sum + w, 0);
	let random = Math.random() * totalWeight;

	for (let i = 0; i < candidates.length; i++) {
		random -= weights[i];
		if (random <= 0) {
			return candidates[i];
		}
	}

	return candidates[candidates.length - 1];
}

// ---------------------------------------------------------------------------
// 10. getAdjectiveCandidates — filter by difficulty
// ---------------------------------------------------------------------------

export function getAdjectiveCandidates(unlockedDifficulties: string[]): AdjectiveEntry[] {
	const bank = loadAdjectiveBank();
	return bank.filter((adj) => unlockedDifficulties.includes(adj.difficulty));
}

// ---------------------------------------------------------------------------
// Noun-aware adjective compatibility (profile-driven)
// ---------------------------------------------------------------------------

const PERSON_NOUN_CATEGORIES: readonly string[] = [
	'people',
	'family',
	'profession',
	'nationality',
	'animals'
];

// Per-profile lists of noun categories that the adjective can meaningfully
// modify. `null` means "any noun" (broad applicability — abstract, time, mass,
// concrete, person all accepted). All other profiles must match at least one
// listed noun category.
//
// Curated to avoid awkward pairings like "krátký alkohol" (mass noun, no
// physical extent) or "modrý problém" (abstract). The lists are conservative
// for narrow profiles (taste, temperature, physical_extent) so any pair the
// engine surfaces should sound natural to a native speaker.
const PROFILE_NOUN_COMPAT: Record<AdjectiveProfile, readonly string[] | null> = {
	// Broad — apply to anything (concrete, abstract, person, time, mass).
	quality: null,
	dimensionless: null,
	nationality: null,
	ordinal: null,
	aesthetic: null,
	// Wealth (drahý/levný) — price/value, applies broadly except to body parts.
	wealth: [
		'misc',
		'people',
		'family',
		'profession',
		'nationality',
		'animals',
		'objects',
		'clothing',
		'transportation',
		'vehicle',
		'readable',
		'food',
		'sliceable',
		'weighable',
		'meal',
		'mealtime',
		'places',
		'v_place',
		'na_place',
		'gathering',
		'event',
		'quiet_event',
		'travel',
		'abstract',
		'time',
		'duration',
		'nature'
	],
	// Domain (historický/vědecký/politický/společenský) — applies to topics,
	// events, eras, places, people/professions, written/abstract things.
	// `family` excluded: "politický strýc" (political uncle) is awkward.
	// Time restricted to `era`: calendar_unit (prosinec/minuta) doesn't pair.
	domain: [
		'abstract',
		'event',
		'gathering',
		'quiet_event',
		'era',
		'places',
		'v_place',
		'na_place',
		'readable',
		'profession',
		'people',
		'nationality',
		'travel',
		'mealtime'
	],
	// Abundance (bohatý/chudý) — describes richness/poverty in a non-price
	// sense. Applies to people, places, abstract qualities, food (rich-flavored),
	// nature (bohatá příroda), events. NOT to small objects ("chudá lžíce" odd)
	// nor to body parts/calendar units.
	abundance: [
		'people',
		'family',
		'profession',
		'nationality',
		'animals',
		'places',
		'v_place',
		'na_place',
		'abstract',
		'era',
		'food',
		'sliceable',
		'weighable',
		'meal',
		'mealtime',
		'nature',
		'event',
		'gathering',
		'quiet_event',
		'travel',
		'readable'
	],
	// Person-restricted.
	person_trait: PERSON_NOUN_CATEGORIES,
	emotion: PERSON_NOUN_CATEGORIES,
	// Speed: people, animals, things that move.
	speed: ['people', 'family', 'profession', 'nationality', 'animals', 'transportation', 'vehicle'],
	// Physical extent: countable concrete things + time/duration (dlouhý čas).
	// Excludes plain `food` (catches mass items like mléko, voda); countable
	// foods come in via `sliceable`/`meal`.
	physical_extent: [
		'objects',
		'body',
		'clothing',
		'transportation',
		'vehicle',
		'readable',
		'nature',
		'places',
		'v_place',
		'na_place',
		'sliceable',
		'gathering',
		'duration',
		'time',
		'event',
		'quiet_event',
		'travel',
		'mealtime',
		'meal'
	],
	// Color: things with surfaces / appearance. `readable` is intentionally
	// excluded — abstract texts (zákon, smlouva, pravidlo) lack color; physical
	// printed items (kniha, časopis) carry `objects` and still match here.
	color: [
		'objects',
		'clothing',
		'transportation',
		'vehicle',
		'body',
		'food',
		'sliceable',
		'weighable',
		'meal',
		'nature',
		'places',
		'v_place',
		'na_place',
		'animals'
	],
	// Temperature: food/drinks, body, places, weather (in nature), clothing,
	// physical objects (cold table). `gathering`/`event` excluded — "warm
	// protest" / "cold meeting" don't pair literally.
	temperature: [
		'food',
		'body',
		'nature',
		'places',
		'v_place',
		'na_place',
		'clothing',
		'objects',
		'sliceable',
		'meal',
		'weighable'
	],
	// Taste: food only.
	taste: ['food', 'sliceable', 'weighable', 'meal', 'mealtime'],
	// Seasonal: time-of-year-relevant things. Uses fine-grained `weather` and
	// `flora` sub-tags instead of bare `nature` so "jarní léto" (season + season)
	// and "jarní zima" (mutual seasons via shared `nature`/`time`) don't surface.
	seasonal: [
		'calendar_unit',
		'holiday',
		'era',
		'weather',
		'flora',
		'mealtime',
		'clothing',
		'event',
		'gathering',
		'duration',
		'travel',
		'places',
		'v_place',
		'na_place',
		'food'
	]
};

/**
 * Whether an adjective is semantically compatible with a given noun, based on
 * the adjective's `profile` and the noun's `categories`.
 *
 * The profile is the single source of truth for category-level compatibility.
 * On top of that, two narrowing rules apply:
 *   1. `blocked_adj_noun_pairs.json` — explicit ban list for awkward
 *      collocations the rule system can't catch.
 *   2. Season-on-season — `seasonal` adjectives (jarní, etc.) never pair with
 *      season nouns (jaro, léto, podzim, zima): "jarní léto" is nonsensical.
 */
export function adjectiveMatchesNoun(adj: AdjectiveEntry, word: WordEntry): boolean {
	if (isBlockedAdjNounPair(adj.lemma, word.lemma)) return false;
	// Block season-on-season pairings (e.g. "jarní léto").
	if (adj.profile === 'seasonal' && word.categories.includes('season')) return false;
	const allowed = PROFILE_NOUN_COMPAT[adj.profile];
	if (allowed === null) return true; // broad profile
	const nounCats = word.categories;
	for (const c of nounCats) {
		if (allowed.includes(c)) return true;
	}
	return false;
}

/** Filter adjective candidates to only those semantically compatible with a template. */
export function filterAdjectivesByTemplate(
	candidates: AdjectiveEntry[],
	template: SentenceTemplate
): AdjectiveEntry[] {
	const allowed = template.adjectiveCategories;
	let filtered =
		allowed && allowed.length > 0
			? candidates.filter((adj) => adj.categories.some((c) => allowed.includes(c)))
			: candidates;
	// Drop lemmas a reviewer has flagged via the admin dashboard.
	const blocked = getBlockedLemmaSet('adjective', template.id);
	if (blocked.size > 0) {
		filtered = filtered.filter((adj) => !blocked.has(adj.lemma));
	}
	return filtered;
}

// ---------------------------------------------------------------------------
// 11. adjectiveParadigmKey — progress tracking key
// ---------------------------------------------------------------------------

export function adjectiveParadigmKey(
	adjLemma: string,
	genderKey: AdjectiveGenderKey,
	case_: Case,
	number_: Number_
): string {
	return `adj_${adjLemma}_${genderKey}_${case_}_${number_}`;
}
