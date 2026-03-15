export type Gender = 'm' | 'f' | 'n';

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'voc' | 'loc' | 'ins';

export type Number_ = 'sg' | 'pl';

export type Difficulty = 'A1' | 'A2' | 'B1';

export type DrillType = 'form_production' | 'case_identification' | 'sentence_fill_in';

export const CASE_LABELS: Record<Case, string> = {
	nom: 'Nominative',
	gen: 'Genitive',
	dat: 'Dative',
	acc: 'Accusative',
	voc: 'Vocative',
	loc: 'Locative',
	ins: 'Instrumental'
};

export const CASE_COLORS: Record<Case, { bg: string; dark: string }> = {
	nom: {
		bg: 'bg-slate-100 text-slate-700',
		dark: 'dark:bg-slate-800 dark:text-slate-300'
	},
	gen: {
		bg: 'bg-brand-100 text-brand-700',
		dark: 'dark:bg-brand-900 dark:text-brand-300'
	},
	dat: {
		bg: 'bg-emerald-100 text-emerald-700',
		dark: 'dark:bg-emerald-900 dark:text-emerald-300'
	},
	acc: {
		bg: 'bg-amber-100 text-amber-700',
		dark: 'dark:bg-amber-900 dark:text-amber-300'
	},
	voc: {
		bg: 'bg-purple-100 text-purple-700',
		dark: 'dark:bg-purple-900 dark:text-purple-300'
	},
	loc: {
		bg: 'bg-rose-100 text-rose-700',
		dark: 'dark:bg-rose-900 dark:text-rose-300'
	},
	ins: {
		bg: 'bg-sky-100 text-sky-700',
		dark: 'dark:bg-sky-900 dark:text-sky-300'
	}
};

export type Paradigm =
	| 'hrad'
	| 'stroj'
	| 'pán'
	| 'muž'
	| 'předseda'
	| 'žena'
	| 'růže'
	| 'kost'
	| 'město'
	| 'moře'
	| 'kuře'
	| 'stavení';

export type CaseForms = [string, string, string, string, string, string, string];

export const CASE_INDEX: Record<Case, number> = {
	nom: 0,
	gen: 1,
	dat: 2,
	acc: 3,
	voc: 4,
	loc: 5,
	ins: 6
} as const;

export interface WordEntry {
	lemma: string;
	translation: string;
	gender: Gender;
	animate: boolean;
	paradigm: Paradigm;
	difficulty: Difficulty;
	categories: string[];
	forms: {
		sg: CaseForms;
		pl: CaseForms;
	};
}

export interface SentenceTemplate {
	id: string;
	template: string;
	lemmaCategory: string;
	requiredCase: Case;
	number: Number_;
	trigger: string;
	why: string;
	difficulty: Difficulty;
}

export interface DrillQuestion {
	word: WordEntry;
	template: SentenceTemplate;
	correctAnswer: string;
	case: Case;
	number: Number_;
	drillType: DrillType;
}

export interface DrillResult {
	question: DrillQuestion;
	userAnswer: string;
	correct: boolean;
	nearMiss: boolean;
}

export interface DrillSettings {
	selectedCases: Case[];
	selectedDrillTypes: DrillType[];
	numberMode: 'sg' | 'pl' | 'both';
	showWordHint: boolean;
}

export const ALL_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

export const ALL_DRILL_TYPES: DrillType[] = [
	'form_production',
	'case_identification',
	'sentence_fill_in'
];

export const DRILL_TYPE_LABELS: Record<DrillType, string> = {
	form_production: 'Form Production',
	case_identification: 'Case Identification',
	sentence_fill_in: 'Sentence Fill-In'
};

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
