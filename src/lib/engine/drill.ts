import type {
	Case,
	CaseForms,
	CaseScore,
	DrillQuestion,
	DrillResult,
	Number_,
	Progress,
	SentenceTemplate,
	WordEntry
} from '../types.ts';
import { CASE_INDEX } from '../types.ts';
import wordBankData from '../data/word_bank.json';
import templateData from '../data/sentence_templates.json';
import curriculumData from '../data/curriculum.json';

interface CurriculumLevel {
	unlocked_cases: string[];
	unlocked_difficulty: string[];
	adjectives_unlocked: boolean;
	plural_unlocked: boolean | string;
}

const curriculum: Record<string, CurriculumLevel> = curriculumData;

export function loadWordBank(): WordEntry[] {
	return wordBankData.map((entry) => ({
		...entry,
		gender: entry.gender as WordEntry['gender'],
		paradigm: entry.paradigm as WordEntry['paradigm'],
		difficulty: entry.difficulty as WordEntry['difficulty'],
		forms: {
			sg: entry.forms.sg as CaseForms,
			pl: entry.forms.pl as CaseForms
		}
	}));
}

export function loadTemplates(): SentenceTemplate[] {
	return templateData.map((entry) => ({
		...entry,
		requiredCase: entry.requiredCase as SentenceTemplate['requiredCase'],
		number: entry.number as SentenceTemplate['number'],
		difficulty: entry.difficulty as SentenceTemplate['difficulty']
	}));
}

export function getCandidates(template: SentenceTemplate, progress: Progress): WordEntry[] {
	const wordBank = loadWordBank();
	const level = curriculum[progress.level];
	const unlockedDifficulties = level.unlocked_difficulty;

	return wordBank.filter(
		(word) =>
			word.categories.includes(template.lemmaCategory) &&
			unlockedDifficulties.includes(word.difficulty)
	);
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

export function generateFormProduction(
	word: WordEntry,
	case_: Case,
	number_: Number_
): DrillQuestion {
	const correctAnswer = word.forms[number_][CASE_INDEX[case_]];
	return {
		word,
		template: PLACEHOLDER_TEMPLATE,
		correctAnswer,
		case: case_,
		number: number_
	};
}

export function generateSentenceDrill(template: SentenceTemplate, word: WordEntry): DrillQuestion {
	const correctAnswer = word.forms[template.number][CASE_INDEX[template.requiredCase]];
	return {
		word,
		template,
		correctAnswer,
		case: template.requiredCase,
		number: template.number
	};
}

const DIACRITICS_MAP: Record<string, string> = {
	ě: 'e',
	š: 's',
	č: 'c',
	ř: 'r',
	ž: 'z',
	ý: 'y',
	á: 'a',
	í: 'i',
	é: 'e',
	ú: 'u',
	ů: 'u',
	ď: 'd',
	ť: 't',
	ň: 'n',
	Ě: 'E',
	Š: 'S',
	Č: 'C',
	Ř: 'R',
	Ž: 'Z',
	Ý: 'Y',
	Á: 'A',
	Í: 'I',
	É: 'E',
	Ú: 'U',
	Ů: 'U',
	Ď: 'D',
	Ť: 'T',
	Ň: 'N'
};

function stripDiacritics(s: string): string {
	let result = '';
	for (const ch of s) {
		result += DIACRITICS_MAP[ch] ?? ch;
	}
	return result;
}

export function checkAnswer(question: DrillQuestion, userAnswer: string): DrillResult {
	const trimmedUser = userAnswer.trim().toLowerCase();
	const trimmedCorrect = question.correctAnswer.trim().toLowerCase();

	if (trimmedUser === trimmedCorrect) {
		return { question, userAnswer, correct: true, nearMiss: false };
	}

	const strippedUser = stripDiacritics(trimmedUser);
	const strippedCorrect = stripDiacritics(trimmedCorrect);

	if (strippedUser === strippedCorrect) {
		return { question, userAnswer, correct: false, nearMiss: true };
	}

	return { question, userAnswer, correct: false, nearMiss: false };
}

export function weightedRandom(
	candidates: WordEntry[],
	progress: Progress,
	case_: Case,
	number_: Number_
): WordEntry {
	const key = `${case_}_${number_}`;
	const scores = progress.caseScores;

	const score: CaseScore | undefined = scores[key];
	const accuracy = score && score.attempts > 0 ? score.correct / score.attempts : 0;
	const weight = 1 / (accuracy + 0.1);
	const weights = candidates.map(() => weight);

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
