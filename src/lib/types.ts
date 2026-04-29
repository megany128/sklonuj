export type Gender = 'm' | 'f' | 'n';

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'voc' | 'loc' | 'ins';

export type Number_ = 'sg' | 'pl';

export type Difficulty = 'A1' | 'A2' | 'B1' | 'B2';

export type DrillType =
	| 'form_production'
	| 'case_identification'
	| 'sentence_fill_in'
	| 'multi_step';

export const CASE_LABELS: Record<Case, string> = {
	nom: 'Nominative',
	gen: 'Genitive',
	dat: 'Dative',
	acc: 'Accusative',
	voc: 'Vocative',
	loc: 'Locative',
	ins: 'Instrumental'
};

/** Short abbreviations for mobile pill display (e.g. "1. N") */
export const CASE_SHORT_LABELS: Record<Case, string> = {
	nom: 'Nom',
	gen: 'Gen',
	dat: 'Dat',
	acc: 'Acc',
	voc: 'Voc',
	loc: 'Loc',
	ins: 'Ins'
};

export const CASE_HEX: Record<Case, string> = {
	nom: '#8f7e86',
	gen: '#5d8cdc',
	dat: '#e89a02',
	acc: '#14b160',
	voc: '#a777e0',
	loc: '#da5e5e',
	ins: '#e34994'
};

export const CASE_COLORS: Record<Case, { bg: string; text: string; border: string }> = {
	nom: { bg: 'bg-case-nom', text: 'text-case-nom', border: 'border-case-nom' },
	gen: { bg: 'bg-case-gen', text: 'text-case-gen', border: 'border-case-gen' },
	dat: { bg: 'bg-case-dat', text: 'text-case-dat', border: 'border-case-dat' },
	acc: { bg: 'bg-case-acc', text: 'text-case-acc', border: 'border-case-acc' },
	voc: { bg: 'bg-case-voc', text: 'text-case-voc', border: 'border-case-voc' },
	loc: { bg: 'bg-case-loc', text: 'text-case-loc', border: 'border-case-loc' },
	ins: { bg: 'bg-case-ins', text: 'text-case-ins', border: 'border-case-ins' }
};

export const CASE_NUMBER: Record<Case, number> = {
	nom: 1,
	gen: 2,
	dat: 3,
	acc: 4,
	voc: 5,
	loc: 6,
	ins: 7
};

export type Paradigm =
	| 'hrad'
	| 'stroj'
	| 'pán'
	| 'muž'
	| 'předseda'
	| 'žena'
	| 'růže'
	| 'píseň'
	| 'kost'
	| 'město'
	| 'moře'
	| 'kuře'
	| 'stavení'
	| 'soudce';

export const ALL_PARADIGMS: Paradigm[] = [
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
];

const PARADIGM_SET: ReadonlySet<string> = new Set<string>(ALL_PARADIGMS);

export function isParadigm(value: string): value is Paradigm {
	return PARADIGM_SET.has(value);
}

export type CaseForms = [string, string, string, string, string, string, string];

export type CaseIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const CASE_INDEX: Record<Case, CaseIndex> = {
	nom: 0,
	gen: 1,
	dat: 2,
	acc: 3,
	voc: 4,
	loc: 5,
	ins: 6
} as const;

/**
 * Variant forms for a given number (sg or pl).
 * Keys are case indices (0-6), values are arrays of alternate accepted forms.
 * E.g. { 2: ["pánu"] } means dative (index 2) also accepts "pánu".
 */
export type VariantForms = Partial<Record<CaseIndex, string[]>>;

export interface WordEntry {
	lemma: string;
	translation: string;
	gender: Gender;
	animate: boolean;
	paradigm: Paradigm;
	difficulty: Difficulty;
	categories: string[];
	pluralOnly?: boolean;
	irregular?: boolean;
	forms: {
		sg: CaseForms;
		pl: CaseForms;
	};
	variantForms?: {
		sg?: VariantForms;
		pl?: VariantForms;
	};
}

export interface SentenceTemplate {
	id: string;
	template: string;
	lemmaCategory: string;
	semanticTags?: string[];
	/** Words with any of these categories are excluded as candidates. */
	excludesCategories?: string[];
	requiredCase: Case;
	number: Number_;
	trigger: string;
	requiredGender?: Gender;
	requiredAnimate?: boolean;
	why: string;
	difficulty: Difficulty;
	// Adjective template fields (optional)
	adjectiveCategories?: string[];
	// Pronoun template fields (optional)
	pronounCategory?: string;
	requiredPronoun?: string;
	formContext?: PronounFormContext;
}

export interface DrillQuestion {
	word: WordEntry;
	template: SentenceTemplate;
	correctAnswer: string;
	case: Case;
	number: Number_;
	drillType: DrillType;
	// Word category — determines which answer checking path to use
	wordCategory?: 'noun' | 'pronoun' | 'adjective';
	// Pronoun fields (optional — only set for pronoun drills)
	pronoun?: PronounEntry;
	acceptedAnswers?: string[];
	expectedFormContext?: PronounFormContext;
	// Adjective fields (optional — only set for adjective drills)
	adjective?: AdjectiveEntry;
}

export interface DrillResult {
	question: DrillQuestion;
	userAnswer: string;
	correct: boolean;
	nearMiss: boolean;
	accidentalCase?: { case: Case; number: Number_ };
}

export interface MultiStepQuestion {
	word: WordEntry;
	template: SentenceTemplate;
	case: Case;
	number: Number_;
	correctParadigm: Paradigm;
	correctCase: Case;
	correctForm: string;
	/** Whether case step should be shown (false when only 1 case enabled) */
	showCaseStep: boolean;
	/** Adjective to decline (optional — only present when adjective step is included) */
	adjective?: AdjectiveEntry;
	/** The primary correct adjective form */
	correctAdjectiveForm?: string;
	/** All accepted adjective forms (primary + variants) */
	acceptedAdjectiveForms?: string[];
}

export interface MultiStepResult {
	question: MultiStepQuestion;
	paradigmCorrect: boolean;
	caseCorrect: boolean | null; // null if step was skipped
	formCorrect: boolean;
	formNearMiss: boolean;
	userParadigm: Paradigm;
	userCase: Case | null;
	userForm: string;
	/** Whether adjective form was correct (null/undefined if no adjective step) */
	adjectiveCorrect?: boolean | null;
	adjectiveNearMiss?: boolean;
	userAdjectiveForm?: string;
}

export interface DrillSettings {
	selectedCases: Case[];
	selectedDrillTypes: DrillType[];
	numberMode: 'sg' | 'pl' | 'both';
	contentMode?: ContentMode;
	wordMode?: WordMode;
}

export type PronounFormContext = 'prep' | 'bare' | 'either';

export interface PronounCaseForm {
	prep: string; // form used after prepositions
	bare: string; // enclitic/standalone form; empty string if none exists
}

export type PronounCaseForms = Record<Case, PronounCaseForm>;

export interface PronounEntry {
	lemma: string;
	translation: string;
	gender: Gender | null;
	difficulty: Difficulty;
	categories: string[];
	forms: {
		sg: PronounCaseForms | null;
		pl: PronounCaseForms | null;
	};
	notes: Record<string, string>;
}

export type ContentMode = 'nouns' | 'pronouns' | 'both';

export type WordMode = 'nouns' | 'adjectives' | 'both';

// --- Adjective types ---

export type AdjectiveGenderKey = 'm_anim' | 'm_inanim' | 'f' | 'n';

export type AdjectiveParadigmType = 'hard' | 'soft';

export interface AdjectiveEntry {
	lemma: string;
	translation: string;
	difficulty: Difficulty;
	paradigmType: AdjectiveParadigmType;
	categories: string[];
	forms: Record<AdjectiveGenderKey, { sg: CaseForms; pl: CaseForms }>;
	variantForms?: Partial<Record<AdjectiveGenderKey, { sg?: VariantForms; pl?: VariantForms }>>;
}

export const ALL_ADJECTIVE_GENDER_KEYS: AdjectiveGenderKey[] = ['m_anim', 'm_inanim', 'f', 'n'];

export const ADJECTIVE_GENDER_LABELS: Record<AdjectiveGenderKey, string> = {
	m_anim: 'Masculine Animate',
	m_inanim: 'Masculine Inanimate',
	f: 'Feminine',
	n: 'Neuter'
};

export const ALL_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

const CASE_SET: ReadonlySet<string> = new Set<string>(ALL_CASES);

export function isCase(value: string): value is Case {
	return CASE_SET.has(value);
}

const NUMBER_SET: ReadonlySet<string> = new Set<string>(['sg', 'pl']);

export function isNumber(value: string): value is Number_ {
	return NUMBER_SET.has(value);
}

export const ALL_DRILL_TYPES: DrillType[] = [
	'form_production',
	'case_identification',
	'sentence_fill_in',
	'multi_step'
];

export const DRILL_TYPE_LABELS: Record<DrillType, string> = {
	form_production: 'Form Production',
	case_identification: 'Case Identification',
	sentence_fill_in: 'Sentence Fill-In',
	multi_step: 'Full Analysis'
};

export interface KzkPreposition {
	prep: string;
	case: Case;
}

export interface KzkChapter {
	id: string;
	label: string;
	subtitle: string;
	unlockedCases: Case[];
	pluralUnlocked: boolean;
	newPrepositions: KzkPreposition[];
	coreLemmas: string[];
	corePronounLemmas?: string[];
}

export interface KzkBook {
	label: string;
	chapters: KzkChapter[];
}

export interface KzkChaptersConfig {
	kzk1: KzkBook;
	kzk2: KzkBook;
}

export interface CaseScore {
	attempts: number;
	correct: number;
}

export interface Progress {
	level: Difficulty;
	caseScores: { [caseKey: string]: CaseScore };
	paradigmScores: { [paradigmKey: string]: CaseScore };
	lastSession: string;
}
