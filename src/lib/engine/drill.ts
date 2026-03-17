import type {
	Case,
	CaseForms,
	CaseScore,
	Difficulty,
	DrillQuestion,
	DrillResult,
	Number_,
	Progress,
	SentenceTemplate,
	VariantForms,
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

let cachedWordBank: WordEntry[] | null = null;
let cachedTemplates: SentenceTemplate[] | null = null;

export function loadWordBank(): WordEntry[] {
	if (cachedWordBank) return cachedWordBank;
	cachedWordBank = wordBankData.map((entry) => {
		const base: WordEntry = {
			...entry,
			gender: entry.gender as WordEntry['gender'],
			paradigm: entry.paradigm as WordEntry['paradigm'],
			difficulty: entry.difficulty as WordEntry['difficulty'],
			forms: {
				sg: entry.forms.sg as CaseForms,
				pl: entry.forms.pl as CaseForms
			}
		};
		const raw = entry as Record<string, unknown>;
		if (raw.variantForms) {
			const vf = raw.variantForms as Record<string, Record<string, string[]>>;
			const parsed: { sg?: VariantForms; pl?: VariantForms } = {};
			if (vf.sg) {
				const sgVariants: VariantForms = {};
				for (const [k, v] of Object.entries(vf.sg)) {
					sgVariants[Number(k)] = v;
				}
				parsed.sg = sgVariants;
			}
			if (vf.pl) {
				const plVariants: VariantForms = {};
				for (const [k, v] of Object.entries(vf.pl)) {
					plVariants[Number(k)] = v;
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
	cachedTemplates = templateData.map((entry) => ({
		...entry,
		requiredCase: entry.requiredCase as SentenceTemplate['requiredCase'],
		number: entry.number as SentenceTemplate['number'],
		difficulty: entry.difficulty as SentenceTemplate['difficulty']
	}));
	return cachedTemplates;
}

export function getCandidates(template: SentenceTemplate, progress: Progress): WordEntry[] {
	const wordBank = loadWordBank();
	const level = curriculum[progress.level];
	const unlockedDifficulties = level.unlocked_difficulty;

	const categoryMatches = wordBank.filter(
		(word) =>
			word.categories.includes(template.lemmaCategory) &&
			unlockedDifficulties.includes(word.difficulty)
	);

	// If template has semantic tags, only return words that match at least one tag.
	// Return empty if no words match — caller should skip this template.
	const tags = template.semanticTags;
	if (tags && tags.length > 0) {
		return categoryMatches.filter((word) => tags.some((tag) => word.categories.includes(tag)));
	}

	return categoryMatches;
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
	const form = word.forms[number_][CASE_INDEX[case_]];
	return typeof form === 'string' && form.trim().length > 0;
}

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

export function generateSentenceDrill(template: SentenceTemplate, word: WordEntry): DrillQuestion {
	const correctAnswer = word.forms[template.number][CASE_INDEX[template.requiredCase]];
	return {
		word,
		template,
		correctAnswer,
		case: template.requiredCase,
		number: template.number,
		drillType: 'sentence_fill_in'
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

export function checkAnswer(
	question: DrillQuestion,
	userAnswer: string,
	level: Difficulty = 'A1'
): DrillResult {
	const trimmedUser = userAnswer.trim().toLowerCase();
	const trimmedCorrect = question.correctAnswer.trim().toLowerCase();

	// Guard: if the correct answer is empty (data issue), always mark as correct to avoid frustration
	if (trimmedCorrect === '') {
		return { question, userAnswer, correct: true, nearMiss: false };
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

	// Check near-miss (diacritics only) against any accepted form
	const strippedUser = stripDiacritics(trimmedUser);
	for (const form of acceptedForms) {
		const strippedForm = stripDiacritics(form.trim().toLowerCase());
		if (strippedUser === strippedForm) {
			// At B1/B2, missing diacritics are marked wrong; at A1/A2, they are a near miss (correct but flagged)
			const strictDiacritics = level === 'B1' || level === 'B2';
			if (strictDiacritics) {
				return { question, userAnswer, correct: false, nearMiss: true };
			}
			return { question, userAnswer, correct: true, nearMiss: true };
		}
	}

	return { question, userAnswer, correct: false, nearMiss: false };
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
	const lower = filledForm.toLowerCase();
	const firstChar = lower[0] ?? '';
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

	// v -> ve: before v, f, or consonant clusters starting with those + sp/st/sk/šk/zd/zn
	function needsVe(): boolean {
		if (firstChar === 'v' || firstChar === 'f') return true;
		if (isCluster) {
			if (
				['sp', 'st', 'sk', 'šk', 'zd', 'zn', 'dn', 'dv', 'sv', 'šp', 'št', 'ct', 'čt'].some(
					(cl) => firstTwo === cl
				)
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
	const weights = candidates.map((word) => {
		const paradigmKey = `${word.paradigm}_${case_}_${number_}`;
		const score: CaseScore | undefined = progress.paradigmScores[paradigmKey];
		const accuracy = score && score.attempts > 0 ? score.correct / score.attempts : 0;
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
