import type {
	AdjectiveEntry,
	AdjectiveGenderKey,
	Case,
	CaseForms,
	Difficulty,
	DrillQuestion,
	Number_,
	Progress,
	SentenceTemplate,
	VariantForms,
	WordEntry
} from '../types';
import { ALL_ADJECTIVE_GENDER_KEYS, CASE_INDEX, CASE_LABELS, isCase, isNumber } from '../types';
import bankData from '../data/determiner_bank.json';
import templateData from '../data/determiner_templates.json';
import { loadWordBank, pickWeightedTemplate } from './drill';
import {
	generateAdjectiveSentenceDrill,
	getAdjectiveGenderKey,
	loadAdjectiveBank,
	weightedRandomAdjective
} from './adjective-drill';

/**
 * Possessives and the demonstrative: můj, tvůj, náš, váš, ten. They agree with
 * their noun in gender, number and case as adjectives do, so they are stored
 * in the adjective shape and asked through the adjective sentence drill: a
 * sentence with the noun already in it and a blank for the determiner.
 *
 * The five are a closed class, so the bank is written out by hand rather than
 * built by the MorphoDiTa pipeline. Where two forms are standard (moje / má,
 * moji / mou) the longer, everyday one is the answer shown and the short one
 * is accepted. The vocative slot repeats the nominative and is never asked.
 *
 * The sentences have third-person subjects on purpose: with "I" or "you" as
 * the subject Czech wants svůj (Hledám svůj klíč), which this deck doesn't
 * teach.
 */

interface RawDeterminer {
	lemma: string;
	translation: string;
	difficulty: string;
	paradigmType: string;
	categories: string[];
	forms: Record<string, { sg: string[]; pl: string[] } | undefined>;
	variantForms: Record<
		string,
		{ sg?: Record<string, string[]>; pl?: Record<string, string[]> } | undefined
	>;
}

interface RawDeterminerTemplate {
	id: string;
	template: string;
	nounLemma: string;
	requiredCase: string;
	number: string;
	difficulty: string;
}

function isDifficulty(value: string): value is Difficulty {
	return value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2';
}

function toCaseForms(forms: string[], where: string): CaseForms {
	if (forms.length !== 7 || forms.some((f) => f.trim() === '')) {
		throw new Error(`${where}: expected 7 non-empty forms`);
	}
	return [forms[0], forms[1], forms[2], forms[3], forms[4], forms[5], forms[6]];
}

function toVariants(raw: Record<string, string[]> | undefined): VariantForms | undefined {
	if (!raw) return undefined;
	const out: VariantForms = {};
	for (const case_ of Object.values(CASE_INDEX)) {
		const forms = raw[String(case_)];
		if (forms && forms.length > 0) out[case_] = forms;
	}
	return out;
}

let cachedBank: AdjectiveEntry[] | null = null;

export function loadDeterminerBank(): AdjectiveEntry[] {
	if (cachedBank) return cachedBank;
	const raw: RawDeterminer[] = bankData;
	cachedBank = raw.map((entry) => {
		const { paradigmType, difficulty } = entry;
		if (paradigmType !== 'possessive' && paradigmType !== 'demonstrative') {
			throw new Error(`Determiner "${entry.lemma}": unknown type "${paradigmType}"`);
		}
		if (!isDifficulty(difficulty)) {
			throw new Error(`Determiner "${entry.lemma}": unknown difficulty "${difficulty}"`);
		}
		const formsFor = (key: AdjectiveGenderKey): { sg: CaseForms; pl: CaseForms } => {
			const forms = entry.forms[key];
			if (!forms) throw new Error(`Determiner "${entry.lemma}": no ${key} forms`);
			return {
				sg: toCaseForms(forms.sg, `${entry.lemma} ${key} sg`),
				pl: toCaseForms(forms.pl, `${entry.lemma} ${key} pl`)
			};
		};
		const variantForms: NonNullable<AdjectiveEntry['variantForms']> = {};
		for (const key of ALL_ADJECTIVE_GENDER_KEYS) {
			const variants = entry.variantForms[key];
			if (variants) {
				variantForms[key] = { sg: toVariants(variants.sg), pl: toVariants(variants.pl) };
			}
		}
		return {
			lemma: entry.lemma,
			translation: entry.translation,
			difficulty,
			paradigmType,
			categories: entry.categories,
			// Unused here: determiners are never matched to nouns by meaning.
			profile: 'quality',
			forms: {
				m_anim: formsFor('m_anim'),
				m_inanim: formsFor('m_inanim'),
				f: formsFor('f'),
				n: formsFor('n')
			},
			variantForms
		};
	});
	return cachedBank;
}

let cachedDeclinable: AdjectiveEntry[] | null = null;

/**
 * Adjectives and determiners together: every word with an adjective-shaped
 * table. Declension charts and the word lookup read this, so a determiner
 * question can show its table like any adjective.
 */
export function loadDeclinableBank(): AdjectiveEntry[] {
	cachedDeclinable ??= [...loadAdjectiveBank(), ...loadDeterminerBank()];
	return cachedDeclinable;
}

const GENDER_LABELS: Record<AdjectiveGenderKey, string> = {
	m_anim: 'masc. animate',
	m_inanim: 'masc. inanimate',
	f: 'feminine',
	n: 'neuter'
};

export interface DeterminerTemplate {
	id: string;
	template: SentenceTemplate;
	/** The noun written into the sentence, which the determiner agrees with. */
	noun: WordEntry;
}

let cachedTemplates: DeterminerTemplate[] | null = null;

export function loadDeterminerTemplates(): DeterminerTemplate[] {
	if (cachedTemplates) return cachedTemplates;
	const nouns = new Map(loadWordBank().map((w) => [w.lemma, w]));
	const raw: RawDeterminerTemplate[] = templateData;
	cachedTemplates = raw.map((entry) => {
		const { requiredCase, number, difficulty } = entry;
		if (!isCase(requiredCase) || requiredCase === 'voc') {
			throw new Error(`Determiner template "${entry.id}": bad case "${requiredCase}"`);
		}
		if (!isNumber(number)) {
			throw new Error(`Determiner template "${entry.id}": bad number "${number}"`);
		}
		if (!isDifficulty(difficulty)) {
			throw new Error(`Determiner template "${entry.id}": bad difficulty "${difficulty}"`);
		}
		const noun = nouns.get(entry.nounLemma);
		if (!noun) {
			throw new Error(`Determiner template "${entry.id}": no noun "${entry.nounLemma}"`);
		}
		const nounForm = noun.forms[number][CASE_INDEX[requiredCase]];
		const template: SentenceTemplate = {
			id: entry.id,
			template: entry.template,
			lemmaCategory: 'general',
			requiredCase,
			number,
			trigger: '',
			why: `agrees with ${nounForm} · ${GENDER_LABELS[getAdjectiveGenderKey(noun)]} · ${CASE_LABELS[requiredCase].toLowerCase()} ${number}`,
			difficulty,
			nounLemma: entry.nounLemma,
			topics: ['determiners']
		};
		return { id: entry.id, template, noun };
	});
	return cachedTemplates;
}

/** Just the sentences, for counting and filtering alongside the noun templates. */
export function determinerSentenceTemplates(): SentenceTemplate[] {
	return loadDeterminerTemplates().map((t) => t.template);
}

export interface DeterminerPick {
	cases: readonly Case[];
	numbers: readonly Number_[];
	difficulties: readonly string[];
	progress: Progress;
	recentTemplateIds: readonly string[];
	random?: () => number;
}

/**
 * The next determiner question: a sentence the filters allow (recently seen
 * ones last), then the determiner whose cell is most due, as adjectives are
 * picked. Null when the filters leave no sentence.
 */
export function pickDeterminerQuestion(pick: DeterminerPick): DrillQuestion | null {
	const random = pick.random ?? Math.random;
	const eligible = loadDeterminerTemplates().filter(
		({ template }) =>
			pick.cases.includes(template.requiredCase) &&
			pick.numbers.includes(template.number) &&
			pick.difficulties.includes(template.difficulty)
	);
	const chosen = pickWeightedTemplate(eligible, () => 1, pick.recentTemplateIds, random);
	if (!chosen) return null;
	const { template, noun } = chosen;
	const determiners = loadDeterminerBank().filter((d) => pick.difficulties.includes(d.difficulty));
	if (determiners.length === 0) return null;
	const determiner = weightedRandomAdjective(
		determiners,
		pick.progress,
		template.requiredCase,
		template.number,
		noun,
		Date.now(),
		random
	);
	const question = generateAdjectiveSentenceDrill(template, determiner, noun);
	if (!question) return null;
	// Where the short form is standard too, say so: a learner who typed "mou"
	// and sees "moji" as the answer should know both are right.
	const others = (question.acceptedAnswers ?? []).filter((f) => f !== question.correctAnswer);
	if (others.length === 0) return question;
	return {
		...question,
		template: { ...template, why: `${template.why}\nAlso correct: ${others.join(', ')}` }
	};
}
