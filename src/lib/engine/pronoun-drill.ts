import type {
	Case,
	CaseForms,
	CaseScore,
	Difficulty,
	DrillQuestion,
	Gender,
	Number_,
	PronounCaseForm,
	PronounCaseForms,
	PronounEntry,
	PronounFormContext,
	Progress,
	SentenceTemplate,
	WordEntry
} from '../types';
import { isCase, isNumber } from '../types';
import pronounBankData from '../data/pronoun_bank.json';
import pronounTemplateData from '../data/pronoun_templates.json';

// ---------------------------------------------------------------------------
// Raw JSON interfaces (pre-validation)
// ---------------------------------------------------------------------------

interface RawPronounCaseForm {
	prep: string;
	bare: string;
}

type RawPronounCaseForms = Record<string, RawPronounCaseForm>;

interface RawPronounEntry {
	lemma: string;
	translation: string;
	gender: string | null;
	difficulty: string;
	categories: string[];
	forms: {
		sg: RawPronounCaseForms | null;
		pl: RawPronounCaseForms | null;
	};
	notes: Record<string, string | undefined>;
}

interface RawPronounTemplate {
	id: string;
	template: string;
	requiredCase: string;
	number: string;
	trigger: string;
	why: string;
	difficulty: string;
	pronounCategory?: string;
	requiredPronoun?: string;
	formContext?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_GENDERS = new Set<string>(['m', 'f', 'n']);
const VALID_DIFFICULTIES = new Set<string>(['A1', 'A2', 'B1', 'B2']);
const ALL_CASES_ORDERED: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
const VALID_FORM_CONTEXTS = new Set<string>(['prep', 'bare', 'either']);

function isGender(value: string): value is Gender {
	return VALID_GENDERS.has(value);
}

function isDifficulty(value: string): value is Difficulty {
	return VALID_DIFFICULTIES.has(value);
}

function isFormContext(value: string): value is PronounFormContext {
	return VALID_FORM_CONTEXTS.has(value);
}

function validatePronounCaseForms(raw: RawPronounCaseForms, lemma: string): PronounCaseForms {
	const result: Partial<Record<Case, PronounCaseForm>> = {};
	for (const c of ALL_CASES_ORDERED) {
		const entry = raw[c];
		if (!entry || typeof entry.prep !== 'string' || typeof entry.bare !== 'string') {
			throw new Error(`Missing or invalid case form "${c}" for pronoun "${lemma}"`);
		}
		result[c] = { prep: entry.prep, bare: entry.bare };
	}
	return result as PronounCaseForms;
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

let cachedPronounBank: PronounEntry[] | null = null;
let cachedPronounTemplates: SentenceTemplate[] | null = null;

// ---------------------------------------------------------------------------
// 1. loadPronounBank
// ---------------------------------------------------------------------------

export function loadPronounBank(): PronounEntry[] {
	if (cachedPronounBank) return cachedPronounBank;

	const rawEntries: RawPronounEntry[] = pronounBankData;
	cachedPronounBank = rawEntries.map((entry) => {
		if (!isDifficulty(entry.difficulty)) {
			throw new Error(`Invalid difficulty "${entry.difficulty}" for pronoun "${entry.lemma}"`);
		}

		let gender: Gender | null = null;
		if (entry.gender !== null) {
			if (!isGender(entry.gender)) {
				throw new Error(`Invalid gender "${entry.gender}" for pronoun "${entry.lemma}"`);
			}
			gender = entry.gender;
		}

		let sg: PronounCaseForms | null = null;
		let pl: PronounCaseForms | null = null;

		if (entry.forms.sg !== null) {
			sg = validatePronounCaseForms(entry.forms.sg, entry.lemma);
		}
		if (entry.forms.pl !== null) {
			pl = validatePronounCaseForms(entry.forms.pl, entry.lemma);
		}

		if (sg === null && pl === null) {
			throw new Error(`Pronoun "${entry.lemma}" has neither sg nor pl forms`);
		}

		// Filter out undefined values from notes
		const notes: Record<string, string> = {};
		for (const [key, value] of Object.entries(entry.notes)) {
			if (value !== undefined) {
				notes[key] = value;
			}
		}

		const pronoun: PronounEntry = {
			lemma: entry.lemma,
			translation: entry.translation,
			gender,
			difficulty: entry.difficulty,
			categories: entry.categories,
			forms: { sg, pl },
			notes
		};
		return pronoun;
	});

	return cachedPronounBank;
}

// ---------------------------------------------------------------------------
// 2. loadPronounTemplates
// ---------------------------------------------------------------------------

export function loadPronounTemplates(): SentenceTemplate[] {
	if (cachedPronounTemplates) return cachedPronounTemplates;

	const rawEntries: RawPronounTemplate[] = pronounTemplateData;
	cachedPronounTemplates = rawEntries.map((entry) => {
		if (!isCase(entry.requiredCase)) {
			throw new Error(
				`Invalid requiredCase "${entry.requiredCase}" in pronoun template "${entry.id}"`
			);
		}
		if (!isNumber(entry.number)) {
			throw new Error(`Invalid number "${entry.number}" in pronoun template "${entry.id}"`);
		}
		if (!isDifficulty(entry.difficulty)) {
			throw new Error(`Invalid difficulty "${entry.difficulty}" in pronoun template "${entry.id}"`);
		}

		const mapped: SentenceTemplate = {
			id: entry.id,
			template: entry.template,
			lemmaCategory: entry.pronounCategory ?? 'pronoun',
			requiredCase: entry.requiredCase,
			number: entry.number,
			trigger: entry.trigger,
			why: entry.why,
			difficulty: entry.difficulty
		};

		if (entry.pronounCategory) {
			mapped.pronounCategory = entry.pronounCategory;
		}
		if (entry.requiredPronoun) {
			mapped.requiredPronoun = entry.requiredPronoun;
		}
		if (entry.formContext && isFormContext(entry.formContext)) {
			mapped.formContext = entry.formContext;
		}

		return mapped;
	});

	return cachedPronounTemplates;
}

/**
 * Split a potentially slash-separated form string into individual forms.
 * e.g. "mne/mně" -> ["mne", "mně"]
 */
function splitForms(value: string): string[] {
	if (value === '') return [];
	return value.split('/').map((f) => f.trim());
}

// ---------------------------------------------------------------------------
// Helper: look up pronoun form
// ---------------------------------------------------------------------------

function getPronounForm(
	pronoun: PronounEntry,
	case_: Case,
	number_: Number_
): PronounCaseForm | null {
	const caseForms = number_ === 'sg' ? pronoun.forms.sg : pronoun.forms.pl;
	if (!caseForms) return null;
	return caseForms[case_];
}

// ---------------------------------------------------------------------------
// 8. makePlaceholderWord
// ---------------------------------------------------------------------------

export function makePlaceholderWord(pronoun: PronounEntry): WordEntry {
	const emptyCaseForms: CaseForms = ['', '', '', '', '', '', ''];
	const gender: Gender = pronoun.gender ?? 'm';
	// Placeholder: pronouns don't have noun paradigms; 'pán' is arbitrary but required by WordEntry type
	return {
		lemma: pronoun.lemma,
		translation: pronoun.translation,
		gender,
		animate: false,
		paradigm: 'pán',
		difficulty: pronoun.difficulty,
		categories: pronoun.categories,
		forms: {
			sg: [...emptyCaseForms] as CaseForms,
			pl: [...emptyCaseForms] as CaseForms
		}
	};
}

// ---------------------------------------------------------------------------
// Placeholder template for bare form-production drills
// ---------------------------------------------------------------------------

const PRONOUN_PLACEHOLDER_TEMPLATE: SentenceTemplate = {
	id: '_pronoun_form_production',
	template: '___',
	lemmaCategory: 'pronoun',
	requiredCase: 'nom',
	number: 'sg',
	trigger: '',
	why: 'Pure pronoun form recall drill.',
	difficulty: 'A1'
};

// ---------------------------------------------------------------------------
// 3. generatePronounFormProduction
// ---------------------------------------------------------------------------

export function generatePronounFormProduction(
	pronoun: PronounEntry,
	case_: Case,
	number_: Number_
): DrillQuestion | null {
	const form = getPronounForm(pronoun, case_, number_);
	if (!form) return null;

	const prepForms = splitForms(form.prep);
	const bareForms = splitForms(form.bare);

	// Skip standalone form-production when no bare form exists (e.g. locative, and
	// instrumental for personal pronouns). The prep-only forms (mně, tobě, něm, ní,
	// mnou, ...) are ungrammatical without a preposition; presenting them as a
	// standalone answer would teach learners to use n-forms / long forms in
	// contexts where they cannot occur.
	if (bareForms.length === 0) return null;

	const correctAnswer = bareForms[0];

	// acceptedAnswers includes all prep and bare forms (the engine still accepts
	// bank-listed prep variants in case the learner types one).
	const acceptedAnswers = [...prepForms, ...bareForms];

	return {
		word: makePlaceholderWord(pronoun),
		template: { ...PRONOUN_PLACEHOLDER_TEMPLATE, requiredCase: case_, number: number_ },
		correctAnswer,
		case: case_,
		number: number_,
		drillType: 'form_production',
		wordCategory: 'pronoun',
		pronoun,
		acceptedAnswers,
		expectedFormContext: 'either'
	};
}

// ---------------------------------------------------------------------------
// 4. generatePronounSentenceDrill
// ---------------------------------------------------------------------------

export function generatePronounSentenceDrill(
	template: SentenceTemplate,
	pronoun: PronounEntry
): DrillQuestion | null {
	const form = getPronounForm(pronoun, template.requiredCase, template.number);
	if (!form) return null;

	const prepForms = splitForms(form.prep);
	const bareForms = splitForms(form.bare);
	const formContext: PronounFormContext = template.formContext ?? 'either';

	let correctAnswer: string;
	let acceptedAnswers: string[];

	switch (formContext) {
		case 'prep': {
			if (prepForms.length === 0) return null;
			correctAnswer = prepForms[0];
			acceptedAnswers = [...prepForms];
			break;
		}
		case 'bare': {
			if (bareForms.length === 0) return null;
			correctAnswer = bareForms[0];
			acceptedAnswers = [...bareForms];
			break;
		}
		case 'either': {
			if (prepForms.length === 0 && bareForms.length === 0) return null;
			correctAnswer = prepForms.length > 0 ? prepForms[0] : bareForms[0];
			acceptedAnswers = [...prepForms, ...bareForms];
			break;
		}
	}

	return {
		word: makePlaceholderWord(pronoun),
		template,
		correctAnswer,
		case: template.requiredCase,
		number: template.number,
		drillType: 'sentence_fill_in',
		wordCategory: 'pronoun',
		pronoun,
		acceptedAnswers,
		expectedFormContext: formContext
	};
}

// ---------------------------------------------------------------------------
// 5. getPronounCandidates
// ---------------------------------------------------------------------------

export function getPronounCandidates(
	template: SentenceTemplate,
	progress: Progress,
	chapterPronounLemmas?: string[]
): PronounEntry[] {
	const bank = loadPronounBank();

	// If template specifies a required pronoun, return only that one
	if (template.requiredPronoun) {
		const required = template.requiredPronoun;
		const match = bank.filter(
			(p) => p.lemma === required || p.lemma.split('/').some((part) => part === required)
		);
		return match;
	}

	const unlockedDifficulties = getUnlockedDifficulties(progress.level);
	const category = template.pronounCategory ?? template.lemmaCategory;

	let candidates = bank.filter(
		(p) => p.categories.includes(category) && unlockedDifficulties.includes(p.difficulty)
	);

	if (chapterPronounLemmas) {
		candidates = candidates.filter(
			(p) =>
				chapterPronounLemmas.includes(p.lemma) ||
				chapterPronounLemmas.some((lemma) => p.lemma.split('/').some((part) => part === lemma))
		);
	}

	return candidates;
}

/**
 * Get all difficulty levels unlocked at or below the given level.
 */
function getUnlockedDifficulties(level: Difficulty): Difficulty[] {
	const order: Difficulty[] = ['A1', 'A2', 'B1', 'B2'];
	const idx = order.indexOf(level);
	return order.slice(0, idx + 1);
}

// ---------------------------------------------------------------------------
// 6. weightedRandomPronoun
// ---------------------------------------------------------------------------

export function weightedRandomPronoun(
	candidates: PronounEntry[],
	progress: Progress,
	case_: Case,
	number_: Number_
): PronounEntry {
	if (candidates.length === 0) {
		throw new Error('weightedRandomPronoun called with empty candidates array');
	}

	const weights = candidates.map((pronoun) => {
		const paradigmKey = `pronoun_${pronoun.lemma}_${case_}_${number_}`;
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
