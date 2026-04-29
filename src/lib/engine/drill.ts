import type {
	Case,
	CaseForms,
	CaseIndex,
	CaseScore,
	Difficulty,
	DrillQuestion,
	DrillResult,
	Gender,
	MultiStepQuestion,
	Number_,
	Paradigm,
	Progress,
	SentenceTemplate,
	VariantForms,
	WordEntry
} from '../types';
import { CASE_INDEX, isCase, isNumber } from '../types';
import wordBankData from '../data/word_bank.json';
import templateData from '../data/sentence_templates.json';
import curriculumData from '../data/curriculum.json';
import { stripDiacritics } from '../utils/diacritics';
import { checkAdjectiveAnswer as checkAdjectiveAnswerImpl } from './adjective-drill';

export interface CurriculumLevel {
	unlocked_cases: string[];
	unlocked_difficulty: string[];
	adjectives_unlocked: boolean;
	plural_unlocked: boolean | string;
	pronouns_unlocked: boolean;
}

const curriculum: Record<string, CurriculumLevel> = curriculumData;

const VALID_GENDERS = new Set<string>(['m', 'f', 'n']);
const VALID_PARADIGMS = new Set<string>([
	'hrad',
	'stroj',
	'pán',
	'muž',
	'předseda',
	'žena',
	'růže',
	'píseň',
	'kost',
	'město',
	'moře',
	'kuře',
	'stavení',
	'soudce'
]);
const VALID_DIFFICULTIES = new Set<string>(['A1', 'A2', 'B1', 'B2']);
function isGender(value: string): value is Gender {
	return VALID_GENDERS.has(value);
}

function isParadigm(value: string): value is Paradigm {
	return VALID_PARADIGMS.has(value);
}

function isDifficulty(value: string): value is Difficulty {
	return VALID_DIFFICULTIES.has(value);
}

function isCaseForms(value: unknown): value is CaseForms {
	return Array.isArray(value) && value.length === 7 && value.every((v) => typeof v === 'string');
}

/** Shape of a single word_bank.json entry before validation. */
interface RawWordBankEntry {
	lemma: string;
	translation: string;
	gender: string;
	animate: boolean;
	paradigm: string;
	difficulty: string;
	categories: string[];
	pluralOnly?: boolean;
	irregular?: boolean;
	forms: {
		sg: unknown;
		pl: unknown;
	};
	variantForms?: Record<string, Record<string, string[] | undefined> | undefined>;
}

/** Shape of a single sentence_templates.json entry before validation. */
interface RawTemplateEntry {
	id: string;
	template: string;
	lemmaCategory: string;
	semanticTags?: string[];
	excludesCategories?: string[];
	requiredCase: string;
	number: string;
	trigger: string;
	requiredGender?: string;
	why: string;
	difficulty: string;
}

let cachedWordBank: WordEntry[] | null = null;
let cachedTemplates: SentenceTemplate[] | null = null;

export function loadWordBank(): WordEntry[] {
	if (cachedWordBank) return cachedWordBank;
	const rawEntries: RawWordBankEntry[] = wordBankData;
	cachedWordBank = rawEntries.map((entry) => {
		if (!isGender(entry.gender)) {
			throw new Error(`Invalid gender "${entry.gender}" for word "${entry.lemma}"`);
		}
		if (!isParadigm(entry.paradigm)) {
			throw new Error(`Invalid paradigm "${entry.paradigm}" for word "${entry.lemma}"`);
		}
		if (!isDifficulty(entry.difficulty)) {
			throw new Error(`Invalid difficulty "${entry.difficulty}" for word "${entry.lemma}"`);
		}
		if (!isCaseForms(entry.forms.sg)) {
			throw new Error(`Invalid sg forms for word "${entry.lemma}"`);
		}
		if (!isCaseForms(entry.forms.pl)) {
			throw new Error(`Invalid pl forms for word "${entry.lemma}"`);
		}

		const base: WordEntry = {
			lemma: entry.lemma,
			translation: entry.translation,
			gender: entry.gender,
			animate: entry.animate,
			paradigm: entry.paradigm,
			difficulty: entry.difficulty,
			categories: entry.categories,
			forms: {
				sg: entry.forms.sg,
				pl: entry.forms.pl
			}
		};

		if (entry.pluralOnly) {
			base.pluralOnly = true;
		}

		if (entry.irregular) {
			base.irregular = true;
		}

		if (entry.variantForms) {
			const vf = entry.variantForms;
			function toCaseIndex(n: number): CaseIndex {
				if (n === 0 || n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) {
					return n;
				}
				throw new Error(`Invalid case index ${n}`);
			}
			const parsed: { sg?: VariantForms; pl?: VariantForms } = {};
			if (vf.sg) {
				const sgVariants: VariantForms = {};
				for (const [k, v] of Object.entries(vf.sg)) {
					if (v) sgVariants[toCaseIndex(Number(k))] = v;
				}
				parsed.sg = sgVariants;
			}
			if (vf.pl) {
				const plVariants: VariantForms = {};
				for (const [k, v] of Object.entries(vf.pl)) {
					if (v) plVariants[toCaseIndex(Number(k))] = v;
				}
				parsed.pl = plVariants;
			}
			base.variantForms = parsed;
		}
		return base;
	});
	return cachedWordBank;
}

export function loadTemplates(): SentenceTemplate[] {
	if (cachedTemplates) return cachedTemplates;
	const rawEntries: RawTemplateEntry[] = templateData;
	cachedTemplates = rawEntries.map((entry) => {
		if (!isCase(entry.requiredCase)) {
			throw new Error(`Invalid requiredCase "${entry.requiredCase}" in template "${entry.id}"`);
		}
		if (!isNumber(entry.number)) {
			throw new Error(`Invalid number "${entry.number}" in template "${entry.id}"`);
		}
		if (!isDifficulty(entry.difficulty)) {
			throw new Error(`Invalid difficulty "${entry.difficulty}" in template "${entry.id}"`);
		}
		const mapped: SentenceTemplate = {
			id: entry.id,
			template: entry.template,
			lemmaCategory: entry.lemmaCategory,
			semanticTags: entry.semanticTags,
			requiredCase: entry.requiredCase,
			number: entry.number,
			trigger: entry.trigger,
			why: entry.why,
			difficulty: entry.difficulty
		};
		if (entry.requiredGender && isGender(entry.requiredGender)) {
			mapped.requiredGender = entry.requiredGender;
		}
		if (entry.excludesCategories && entry.excludesCategories.length > 0) {
			mapped.excludesCategories = entry.excludesCategories;
		}
		return mapped;
	});
	return cachedTemplates;
}

export function getCandidates(template: SentenceTemplate, progress: Progress): WordEntry[] {
	const wordBank = loadWordBank();
	const level = curriculum[progress.level];
	if (!level) {
		// Unknown level — fall back to the first curriculum level if available, else return no candidates
		const firstKey = Object.keys(curriculum)[0];
		if (!firstKey) return [];
		if (!isDifficulty(firstKey)) return [];
		if (firstKey === progress.level) return [];
		return getCandidates(template, { ...progress, level: firstKey });
	}

	// Check curriculum constraints: is the template's case unlocked?
	if (!level.unlocked_cases.includes(template.requiredCase)) return [];

	// Check curriculum constraints: is the template's number allowed?
	if (template.number === 'pl') {
		if (!level.plural_unlocked) return [];
		if (level.plural_unlocked === 'sg_first') {
			// Only show plural templates if the user has >= 60% accuracy on the singular form of the same case
			const sgKey = `${template.requiredCase}_sg`;
			const sgScore: CaseScore | undefined = progress.caseScores[sgKey];
			const sgAccuracy = sgScore && sgScore.attempts > 0 ? sgScore.correct / sgScore.attempts : 0;
			if (sgAccuracy < 0.6) return [];
		}
	}

	const unlockedDifficulties = level.unlocked_difficulty;

	// Check curriculum constraints: is the template's difficulty unlocked?
	if (!unlockedDifficulties.includes(template.difficulty)) return [];

	const categoryMatches = wordBank.filter(
		(word) =>
			word.categories.includes(template.lemmaCategory) &&
			unlockedDifficulties.includes(word.difficulty)
	);

	// If template has semantic tags, only return words that match at least one tag.
	// Return empty if no words match — caller should skip this template.
	const tags = template.semanticTags;
	let filtered = categoryMatches;
	if (tags && tags.length > 0) {
		filtered = filtered.filter((word) => tags.some((tag) => word.categories.includes(tag)));
	}

	// If template requires a specific gender, filter by it.
	if (template.requiredGender) {
		filtered = filtered.filter((word) => word.gender === template.requiredGender);
	}

	// Exclude words whose categories overlap with the template's excludesCategories.
	const excluded = template.excludesCategories;
	if (excluded && excluded.length > 0) {
		filtered = filtered.filter((word) => !word.categories.some((c) => excluded.includes(c)));
	}

	return filtered;
}

const PLACEHOLDER_TEMPLATE: SentenceTemplate = {
	id: '_form_production',
	template: '___',
	lemmaCategory: '',
	requiredCase: 'nom',
	number: 'sg',
	trigger: '',
	why: 'Pure form recall drill.',
	difficulty: 'A1'
};

/** Check if a word has a non-empty form for the given case and number. */
export function hasValidForm(word: WordEntry, case_: Case, number_: Number_): boolean {
	if (word.pluralOnly && number_ === 'sg') return false;
	const form = word.forms[number_][CASE_INDEX[case_]];
	return typeof form === 'string' && form.trim().length > 0;
}

export function generateFormProduction(
	word: WordEntry,
	case_: Case,
	number_: Number_
): DrillQuestion | null {
	const correctAnswer = word.forms[number_][CASE_INDEX[case_]];
	if (!correctAnswer || correctAnswer.trim().length === 0) return null;
	return {
		word,
		template: PLACEHOLDER_TEMPLATE,
		correctAnswer,
		case: case_,
		number: number_,
		drillType: 'form_production'
	};
}

export function generateCaseIdentification(
	template: SentenceTemplate,
	word: WordEntry
): DrillQuestion {
	return {
		word,
		template,
		correctAnswer: template.requiredCase,
		case: template.requiredCase,
		number: template.number,
		drillType: 'case_identification'
	};
}

export function generateSentenceDrill(
	template: SentenceTemplate,
	word: WordEntry
): DrillQuestion | null {
	const correctAnswer = word.forms[template.number][CASE_INDEX[template.requiredCase]];
	if (!correctAnswer || correctAnswer.trim().length === 0) return null;
	return {
		word,
		template,
		correctAnswer,
		case: template.requiredCase,
		number: template.number,
		drillType: 'sentence_fill_in'
	};
}

export function generateMultiStepQuestion(
	word: WordEntry,
	template: SentenceTemplate,
	showCaseStep: boolean
): MultiStepQuestion | null {
	const correctForm = word.forms[template.number][CASE_INDEX[template.requiredCase]];
	if (!correctForm || correctForm.trim().length === 0) return null;
	return {
		word,
		template,
		case: template.requiredCase,
		number: template.number,
		correctParadigm: word.paradigm,
		correctCase: template.requiredCase,
		correctForm,
		showCaseStep
	};
}

// Re-export for callers that import stripDiacritics from this module
export { stripDiacritics };

/** Collect all accepted forms for a question: primary + variant forms. */
function getAllAcceptedForms(question: DrillQuestion): string[] {
	const primary = question.correctAnswer;
	const forms = [primary];
	const variants = question.word.variantForms;
	if (variants) {
		const numberVariants = variants[question.number];
		if (numberVariants) {
			const caseIdx = CASE_INDEX[question.case];
			const alts = numberVariants[caseIdx];
			if (alts) {
				forms.push(...alts);
			}
		}
	}
	return forms;
}

/**
 * Whether a near-miss (diacritic-only) answer counts as correct at this level.
 * A1/A2: lenient — correct, flagged as near-miss.
 * B1/B2: strict — wrong, still flagged as near-miss for feedback.
 */
function nearMissIsCorrect(level: Difficulty): boolean {
	return level === 'A1' || level === 'A2';
}

export function checkAnswer(
	question: DrillQuestion,
	userAnswer: string,
	level: Difficulty = 'A1'
): DrillResult | null {
	const trimmedUser = userAnswer.trim().toLowerCase();
	const trimmedCorrect = question.correctAnswer.trim().toLowerCase();

	// Guard: if the correct answer is empty (data issue), log a warning and signal
	// the caller to skip this question by returning null.
	if (trimmedCorrect === '') {
		console.warn(
			`[drill] Skipping question with empty correct answer: word="${question.word.lemma}", case=${question.case}, number=${question.number}`
		);
		return null;
	}

	// Delegate adjective questions to the adjective-specific checker
	if (question.wordCategory === 'adjective') {
		return checkAdjectiveAnswerImpl(question, userAnswer, level);
	}

	// Delegate pronoun questions to the pronoun-specific checker
	if (question.wordCategory === 'pronoun' && question.acceptedAnswers) {
		const accepted = question.acceptedAnswers;

		// Exact match
		for (const form of accepted) {
			if (trimmedUser === form.trim().toLowerCase()) {
				return { question, userAnswer, correct: true, nearMiss: false };
			}
		}

		// Accidental case detection for pronouns — must run BEFORE diacritics check
		// so that e.g. "ní" (gen/dat) is not mistaken for a near-miss of "ni" (acc),
		// and "mne" (gen) is not mistaken for a near-miss of "mně" (dat).
		if (question.pronoun) {
			const pronoun = question.pronoun;
			const ALL_PRONOUN_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
			const numbers: Number_[] = question.number === 'sg' ? ['sg', 'pl'] : ['pl', 'sg'];
			let accidentalCase: { case: Case; number: Number_ } | undefined;

			outer: for (const num of numbers) {
				const caseForms = num === 'sg' ? pronoun.forms.sg : pronoun.forms.pl;
				if (!caseForms) continue;
				for (const c of ALL_PRONOUN_CASES) {
					if (c === question.case && num === question.number) continue;
					const form = caseForms[c];
					const prepForms = form.prep
						? form.prep.split('/').map((f) => f.trim().toLowerCase())
						: [];
					const bareForms = form.bare
						? form.bare.split('/').map((f) => f.trim().toLowerCase())
						: [];
					const allForms = [...prepForms, ...bareForms];
					for (const f of allForms) {
						if (f && trimmedUser === f) {
							accidentalCase = { case: c, number: num };
							break outer;
						}
					}
				}
			}

			if (accidentalCase) {
				return { question, userAnswer, correct: false, nearMiss: false, accidentalCase };
			}
		}

		// Near-miss (diacritics) — only reached if not an exact match for another case
		const strippedUser = stripDiacritics(trimmedUser);
		for (const form of accepted) {
			const stripped = stripDiacritics(form.trim().toLowerCase());
			if (strippedUser === stripped) {
				return {
					question,
					userAnswer,
					correct: nearMissIsCorrect(level),
					nearMiss: true
				};
			}
		}

		return { question, userAnswer, correct: false, nearMiss: false };
	}

	// For case identification, do an exact match on the case abbreviation
	if (question.drillType === 'case_identification') {
		const correct = trimmedUser === trimmedCorrect;
		return { question, userAnswer, correct, nearMiss: false };
	}

	// Collect all accepted forms (primary + variants)
	const acceptedForms = getAllAcceptedForms(question);

	// Check exact match against any accepted form
	for (const form of acceptedForms) {
		if (trimmedUser === form.trim().toLowerCase()) {
			return { question, userAnswer, correct: true, nearMiss: false };
		}
	}

	// Check near-miss (diacritics only) against any accepted form. Run this
	// before accidental-case so a typo on the right answer (e.g. "dome" for
	// loc-sg "domě") is preferred over an accidental match against an
	// unrelated form (in this example "dome" also happens to be voc-sg).
	const strippedUser = stripDiacritics(trimmedUser);
	for (const form of acceptedForms) {
		const strippedForm = stripDiacritics(form.trim().toLowerCase());
		if (strippedUser === strippedForm) {
			return {
				question,
				userAnswer,
				correct: nearMissIsCorrect(level),
				nearMiss: true
			};
		}
	}

	// Detect accidental case: check if the wrong answer matches another case form
	const ALL_CASES_ORDERED: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
	const numbers: Number_[] = [question.number, question.number === 'sg' ? 'pl' : 'sg'];
	let accidentalCase: { case: Case; number: Number_ } | undefined;

	outer: for (const num of numbers) {
		for (const c of ALL_CASES_ORDERED) {
			if (c === question.case && num === question.number) continue;
			const form = question.word.forms[num][CASE_INDEX[c]];
			if (form && trimmedUser === form.trim().toLowerCase()) {
				accidentalCase = { case: c, number: num };
				break outer;
			}
			// Also check variant forms
			const variants = question.word.variantForms;
			if (variants) {
				const numVariants = variants[num];
				if (numVariants) {
					const alts = numVariants[CASE_INDEX[c]];
					if (alts?.some((alt) => trimmedUser === alt.trim().toLowerCase())) {
						accidentalCase = { case: c, number: num };
						break outer;
					}
				}
			}
		}
	}

	return { question, userAnswer, correct: false, nearMiss: false, accidentalCase };
}

export function checkMultiStepForm(
	question: MultiStepQuestion,
	userForm: string,
	level: Difficulty = 'A1'
): { correct: boolean; nearMiss: boolean } {
	const trimmedUser = userForm.trim().toLowerCase();
	const trimmedCorrect = question.correctForm.trim().toLowerCase();

	if (trimmedCorrect === '') {
		return { correct: false, nearMiss: false };
	}

	// Collect accepted forms: primary + variants
	const acceptedForms = [question.correctForm];
	const variants = question.word.variantForms;
	if (variants) {
		const numberVariants = variants[question.number];
		if (numberVariants) {
			const caseIdx = CASE_INDEX[question.case];
			const alts = numberVariants[caseIdx];
			if (alts) {
				acceptedForms.push(...alts);
			}
		}
	}

	// Exact match
	for (const form of acceptedForms) {
		if (trimmedUser === form.trim().toLowerCase()) {
			return { correct: true, nearMiss: false };
		}
	}

	// Near-miss (diacritics only)
	const strippedUser = stripDiacritics(trimmedUser);
	for (const form of acceptedForms) {
		const strippedForm = stripDiacritics(form.trim().toLowerCase());
		if (strippedUser === strippedForm) {
			return { correct: nearMissIsCorrect(level), nearMiss: true };
		}
	}

	return { correct: false, nearMiss: false };
}

/**
 * Czech preposition voicing rules.
 * Certain prepositions gain an extra vowel before specific consonant clusters:
 *   k -> ke, s -> se, v -> ve, z -> ze
 *
 * This function takes a sentence template string and the declined form that
 * fills the blank, and returns the template with voicing applied to the
 * preposition immediately before the blank.
 */
export function applyPrepositionVoicing(template: string, filledForm: string): string {
	if (filledForm.length === 0) return template;

	const lower = filledForm.toLowerCase();
	const firstChar = lower[0];
	const firstTwo = lower.slice(0, 2);

	// Detect consonant cluster: first two chars are both consonants (not vowels)
	const vowels = new Set('aeiouyáéíóúůý');
	const isCluster = lower.length >= 2 && !vowels.has(lower[0]) && !vowels.has(lower[1]);

	// k -> ke: before k, g, or consonant clusters starting with k/g/mn/vz/vš/dv
	function needsKe(): boolean {
		if (firstChar === 'k' || firstChar === 'g') return true;
		if (isCluster) {
			if (
				['mn', 'vz', 'vš', 'dv', 'dn', 'sp', 'sk', 'st', 'sv', 'šk', 'šp', 'št'].some(
					(cl) => firstTwo === cl
				)
			)
				return true;
		}
		return false;
	}

	// s -> se: before s, z, š, ž, or consonant clusters starting with those + mn/vz/dv
	function needsSe(): boolean {
		if ('szšž'.includes(firstChar)) return true;
		if (isCluster) {
			if (['mn', 'vz', 'vš', 'dv', 'ct', 'čt'].some((cl) => firstTwo === cl)) return true;
		}
		return false;
	}

	// v -> ve: before v, f, or consonant clusters starting with those + sp/st/sk/šk/zd/zn/mn/jm
	// Also covers lexicalized cases: "ve městě" (mě-), "ve všech" (vš-), "ve vzduchu" (vz-).
	function needsVe(): boolean {
		if (firstChar === 'v' || firstChar === 'f') return true;
		if (isCluster) {
			if (
				[
					'sp',
					'st',
					'sk',
					'šk',
					'zd',
					'zn',
					'dn',
					'dv',
					'sv',
					'šp',
					'št',
					'ct',
					'čt',
					'mn',
					'jm',
					'mě',
					'vš',
					'vz'
				].some((cl) => firstTwo === cl)
			)
				return true;
		}
		return false;
	}

	// z -> ze: before s, z, š, ž, or consonant clusters
	function needsZe(): boolean {
		if ('szšž'.includes(firstChar)) return true;
		if (isCluster) {
			if (['dv', 'dn', 'vz', 'vš', 'mn', 'ct', 'čt'].some((cl) => firstTwo === cl)) return true;
		}
		return false;
	}

	// Replace the preposition immediately before the blank (___) in the template
	// Pattern: word boundary + preposition + space + ___
	return template
		.replace(/\bk ___/g, needsKe() ? 'ke ___' : 'k ___')
		.replace(/\bs ___/g, needsSe() ? 'se ___' : 's ___')
		.replace(/\bv ___/g, needsVe() ? 've ___' : 'v ___')
		.replace(/\bz ___/g, needsZe() ? 'ze ___' : 'z ___');
}

export function weightedRandom(
	candidates: WordEntry[],
	progress: Progress,
	case_: Case,
	number_: Number_
): WordEntry {
	if (candidates.length === 0) {
		throw new Error('weightedRandom called with empty candidates array');
	}

	const weights = candidates.map((word) => {
		const paradigmKey = `${word.paradigm}_${case_}_${number_}`;
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
