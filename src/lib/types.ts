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
	semanticTags?: string[];
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
