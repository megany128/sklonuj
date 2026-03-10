export type Gender = 'm' | 'f' | 'n';

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'voc' | 'loc' | 'ins';

export type Number_ = 'sg' | 'pl';

export type Difficulty = 'A1' | 'A2' | 'B1';

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
}

export interface DrillResult {
	question: DrillQuestion;
	userAnswer: string;
	correct: boolean;
	nearMiss: boolean;
}

export interface CaseScore {
	attempts: number;
	correct: number;
}

export interface Progress {
	level: Difficulty;
	caseScores: { [caseKey: string]: CaseScore };
	lastSession: string;
}
