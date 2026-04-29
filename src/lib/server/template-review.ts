// Single source of truth for template review (admin dashboard + dump script).
// Mirrors the live drill engines (sentence/adjective/pronoun) so reviewers see
// exactly the surface form learners see, including preposition voicing and
// alternate-form selection. The only intentional difference is curriculum-level
// gating: reviewers see all templates regardless of CEFR level.
//
// Imports are relative (not $lib/...) so this module is loadable both from
// SvelteKit (server bundle) and from a plain Node runtime via tsx.

import wordBankRaw from '../data/word_bank.json';
import adjectiveBankRaw from '../data/adjective_bank.json';
import pronounBankRaw from '../data/pronoun_bank.json';
import sentenceTemplatesRaw from '../data/sentence_templates.json';
import adjectiveTemplatesRaw from '../data/adjective_templates.json';
import pronounTemplatesRaw from '../data/pronoun_templates.json';
import { applyPrepositionVoicing } from '../engine/preposition-voicing';
import type { Case, Difficulty, Gender, Number_ } from '../types';

const CASE_INDEX: Record<Case, number> = {
	nom: 0,
	gen: 1,
	dat: 2,
	acc: 3,
	voc: 4,
	loc: 5,
	ins: 6
};

export type TemplateType = 'sentence' | 'adjective' | 'pronoun';
export type ReviewStatus = 'ok' | 'needs_fix' | 'wrong';
export type FormContext = 'prep' | 'bare' | 'either';

export interface RenderedExample {
	lemma: string;
	form: string;
	filled: string;
}

export interface RenderedTemplate {
	id: string;
	type: TemplateType;
	template: string;
	requiredCase: Case;
	number: Number_;
	difficulty: Difficulty;
	trigger: string;
	why: string;
	requiredGender?: Gender;
	lemmaCategory?: string;
	semanticTags?: string[];
	excludesCategories?: string[];
	pronounCategory?: string;
	requiredPronoun?: string;
	formContext?: FormContext;
	requiredAnimate?: boolean;
	adjectiveCategories?: string[];
	candidateCount: number;
	examples: RenderedExample[];
}

interface RawSentenceTemplate {
	id: string;
	template: string;
	lemmaCategory: string;
	semanticTags?: string[];
	excludesCategories?: string[];
	requiredCase: string;
	number: string;
	requiredGender?: string;
	trigger: string;
	why: string;
	difficulty: string;
}

interface RawWordEntry {
	lemma: string;
	gender: string;
	categories: string[];
	pluralOnly?: boolean;
	forms: { sg: string[]; pl: string[] };
}

interface RawAdjectiveEntry {
	lemma: string;
	categories: string[];
	forms: {
		m_anim: { sg: string[]; pl: string[] };
		m_inanim: { sg: string[]; pl: string[] };
		f: { sg: string[]; pl: string[] };
		n: { sg: string[]; pl: string[] };
	};
}

interface RawAdjectiveTemplate {
	id: string;
	template: string;
	requiredCase: string;
	number: string;
	trigger: string;
	requiredGender: string;
	requiredAnimate: boolean;
	why: string;
	difficulty: string;
	adjectiveCategories?: string[];
}

interface RawPronounEntry {
	lemma: string;
	categories: string[];
	forms: {
		sg: Record<string, { prep: string; bare: string }> | null;
		pl: Record<string, { prep: string; bare: string }> | null;
	};
}

interface RawPronounTemplate {
	id: string;
	template: string;
	requiredCase: string;
	number: string;
	trigger: string;
	why: string;
	difficulty: string;
	// Drill engine falls back to lemmaCategory when pronounCategory is absent.
	lemmaCategory?: string;
	pronounCategory?: string;
	requiredPronoun?: string;
	formContext?: string;
}

const wordBank: RawWordEntry[] = wordBankRaw;
const adjectiveBank: RawAdjectiveEntry[] = adjectiveBankRaw;
const pronounBank: RawPronounEntry[] = pronounBankRaw;
const sentenceTemplates: RawSentenceTemplate[] = sentenceTemplatesRaw;
const adjectiveTemplates: RawAdjectiveTemplate[] = adjectiveTemplatesRaw;
const pronounTemplates: RawPronounTemplate[] = pronounTemplatesRaw;

const EXAMPLES_PER_TEMPLATE = 3;
const VALID_CASES = new Set<string>(['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins']);
const VALID_NUMBERS = new Set<string>(['sg', 'pl']);
const VALID_DIFFICULTIES = new Set<string>(['A1', 'A2', 'B1', 'B2']);
const VALID_GENDERS = new Set<string>(['m', 'f', 'n']);
const VALID_FORM_CONTEXTS = new Set<string>(['prep', 'bare', 'either']);

function isCase(value: string): value is Case {
	return VALID_CASES.has(value);
}

function isNumber(value: string): value is Number_ {
	return VALID_NUMBERS.has(value);
}

function isDifficulty(value: string): value is Difficulty {
	return VALID_DIFFICULTIES.has(value);
}

function isGender(value: string): value is Gender {
	return VALID_GENDERS.has(value);
}

function normalizeFormContext(value: string | undefined): FormContext {
	// Drill engine: `template.formContext ?? 'either'`.
	if (value && VALID_FORM_CONTEXTS.has(value)) {
		if (value === 'prep') return 'prep';
		if (value === 'bare') return 'bare';
		return 'either';
	}
	return 'either';
}

/**
 * Split a slash-separated form ("mě/mne") into individual forms.
 * Mirrors `splitForms` in pronoun-drill.ts so the audit picks the same
 * displayed form learners would see.
 */
function splitForms(value: string): string[] {
	if (value === '') return [];
	return value.split('/').map((f) => f.trim());
}

/** Match drill engine's lemma matching for `requiredPronoun` (supports slash-lemmas). */
function pronounLemmaMatches(lemma: string, required: string): boolean {
	if (lemma === required) return true;
	return lemma.split('/').some((part) => part === required);
}

// ─── Sentence candidates ─────────────────────────────────────────────────

function getSentenceCandidates(t: RawSentenceTemplate): RawWordEntry[] {
	let matches = wordBank.filter((w) => w.categories.includes(t.lemmaCategory));
	if (t.semanticTags && t.semanticTags.length > 0) {
		const tags = t.semanticTags;
		matches = matches.filter((w) => tags.some((tag) => w.categories.includes(tag)));
	}
	if (t.requiredGender && isGender(t.requiredGender)) {
		const required = t.requiredGender;
		matches = matches.filter((w) => w.gender === required);
	}
	if (t.excludesCategories && t.excludesCategories.length > 0) {
		const excluded = t.excludesCategories;
		matches = matches.filter((w) => !w.categories.some((c) => excluded.includes(c)));
	}
	if (!isCase(t.requiredCase) || !isNumber(t.number)) return [];
	const caseIdx = CASE_INDEX[t.requiredCase];
	const num = t.number;
	matches = matches.filter((w) => {
		if (num === 'sg' && w.pluralOnly) return false;
		const form = w.forms[num]?.[caseIdx];
		return typeof form === 'string' && form.trim().length > 0;
	});
	return matches;
}

// ─── Adjective candidates ────────────────────────────────────────────────

function adjectiveFormKey(t: RawAdjectiveTemplate): 'm_anim' | 'm_inanim' | 'f' | 'n' {
	if (t.requiredGender === 'm') return t.requiredAnimate ? 'm_anim' : 'm_inanim';
	if (t.requiredGender === 'f') return 'f';
	if (t.requiredGender === 'n') return 'n';
	return 'm_anim';
}

function getAdjectiveCandidates(t: RawAdjectiveTemplate): RawAdjectiveEntry[] {
	let matches = adjectiveBank;
	if (t.adjectiveCategories && t.adjectiveCategories.length > 0) {
		const cats = t.adjectiveCategories;
		matches = matches.filter((a) => cats.some((c) => a.categories.includes(c)));
	}
	if (!isCase(t.requiredCase) || !isNumber(t.number)) return [];
	const caseIdx = CASE_INDEX[t.requiredCase];
	const formKey = adjectiveFormKey(t);
	const num = t.number;
	matches = matches.filter((a) => {
		const form = a.forms[formKey]?.[num]?.[caseIdx];
		return typeof form === 'string' && form.trim().length > 0;
	});
	return matches;
}

// ─── Pronoun candidates ──────────────────────────────────────────────────

/**
 * Pick the displayed pronoun form for a given (case, number, formContext).
 * Mirrors `generatePronounSentenceDrill` in pronoun-drill.ts: picks the first
 * split form for the requested context, falls back to the other context when
 * formContext is 'either'. Returns null when no form is available.
 */
function pickPronounForm(
	pronoun: RawPronounEntry,
	case_: Case,
	num: Number_,
	formContext: FormContext
): string | null {
	const block = pronoun.forms[num];
	if (!block) return null;
	const caseBlock = block[case_];
	if (!caseBlock) return null;
	const prep = splitForms(caseBlock.prep);
	const bare = splitForms(caseBlock.bare);
	if (formContext === 'prep') return prep[0] ?? null;
	if (formContext === 'bare') return bare[0] ?? null;
	return prep[0] ?? bare[0] ?? null;
}

function getPronounCandidates(t: RawPronounTemplate): RawPronounEntry[] {
	if (!isCase(t.requiredCase) || !isNumber(t.number)) return [];
	const num = t.number;
	const caseName = t.requiredCase;
	const formContext = normalizeFormContext(t.formContext);

	// Drill engine: requiredPronoun short-circuits and matches against
	// slash-separated lemmas too (e.g. "on/ona/ono" matches "on").
	if (t.requiredPronoun) {
		const required = t.requiredPronoun;
		return pronounBank.filter(
			(p) =>
				pronounLemmaMatches(p.lemma, required) &&
				pickPronounForm(p, caseName, num, formContext) !== null
		);
	}

	// Drill engine: category = pronounCategory ?? lemmaCategory.
	const category = t.pronounCategory ?? t.lemmaCategory;
	let matches = pronounBank;
	if (category) {
		matches = matches.filter((p) => p.categories.includes(category));
	}
	matches = matches.filter((p) => pickPronounForm(p, caseName, num, formContext) !== null);
	return matches;
}

// ─── Rendering ───────────────────────────────────────────────────────────

function fill(template: string, form: string): string {
	// Apply preposition voicing first (k -> ke, v -> ve, etc) so reviewers see
	// the same surface form learners do; then substitute the form into the blank.
	return applyPrepositionVoicing(template, form).replace('___', form);
}

function renderSentenceTemplate(t: RawSentenceTemplate): RenderedTemplate | null {
	if (!isCase(t.requiredCase)) return null;
	if (!isNumber(t.number)) return null;
	if (!isDifficulty(t.difficulty)) return null;
	const candidates = getSentenceCandidates(t);
	const caseIdx = CASE_INDEX[t.requiredCase];
	const num = t.number;
	const examples: RenderedExample[] = candidates.slice(0, EXAMPLES_PER_TEMPLATE).map((w) => {
		const form = w.forms[num][caseIdx];
		return { lemma: w.lemma, form, filled: fill(t.template, form) };
	});
	const out: RenderedTemplate = {
		id: t.id,
		type: 'sentence',
		template: t.template,
		requiredCase: t.requiredCase,
		number: num,
		difficulty: t.difficulty,
		trigger: t.trigger,
		why: t.why,
		lemmaCategory: t.lemmaCategory,
		candidateCount: candidates.length,
		examples
	};
	if (t.semanticTags) out.semanticTags = t.semanticTags;
	if (t.excludesCategories) out.excludesCategories = t.excludesCategories;
	if (t.requiredGender && isGender(t.requiredGender)) out.requiredGender = t.requiredGender;
	return out;
}

function renderAdjectiveTemplate(t: RawAdjectiveTemplate): RenderedTemplate | null {
	if (!isCase(t.requiredCase)) return null;
	if (!isNumber(t.number)) return null;
	if (!isDifficulty(t.difficulty)) return null;
	if (!isGender(t.requiredGender)) return null;
	const candidates = getAdjectiveCandidates(t);
	const caseIdx = CASE_INDEX[t.requiredCase];
	const formKey = adjectiveFormKey(t);
	const num = t.number;
	const examples: RenderedExample[] = candidates.slice(0, EXAMPLES_PER_TEMPLATE).map((a) => {
		const form = a.forms[formKey][num][caseIdx];
		return { lemma: a.lemma, form, filled: fill(t.template, form) };
	});
	const out: RenderedTemplate = {
		id: t.id,
		type: 'adjective',
		template: t.template,
		requiredCase: t.requiredCase,
		number: num,
		difficulty: t.difficulty,
		trigger: t.trigger,
		why: t.why,
		requiredGender: t.requiredGender,
		requiredAnimate: t.requiredAnimate,
		candidateCount: candidates.length,
		examples
	};
	if (t.adjectiveCategories) out.adjectiveCategories = t.adjectiveCategories;
	return out;
}

function renderPronounTemplate(t: RawPronounTemplate): RenderedTemplate | null {
	if (!isCase(t.requiredCase)) return null;
	if (!isNumber(t.number)) return null;
	if (!isDifficulty(t.difficulty)) return null;
	const candidates = getPronounCandidates(t);
	const num = t.number;
	const caseName = t.requiredCase;
	const formContext = normalizeFormContext(t.formContext);
	const examples: RenderedExample[] = candidates.slice(0, EXAMPLES_PER_TEMPLATE).map((p) => {
		const form = pickPronounForm(p, caseName, num, formContext) ?? '';
		return { lemma: p.lemma, form, filled: fill(t.template, form) };
	});
	const out: RenderedTemplate = {
		id: t.id,
		type: 'pronoun',
		template: t.template,
		requiredCase: caseName,
		number: num,
		difficulty: t.difficulty,
		trigger: t.trigger,
		why: t.why,
		formContext,
		candidateCount: candidates.length,
		examples
	};
	if (t.pronounCategory) out.pronounCategory = t.pronounCategory;
	if (t.requiredPronoun) out.requiredPronoun = t.requiredPronoun;
	return out;
}

let cache: RenderedTemplate[] | null = null;

export function getAllRenderedTemplates(): RenderedTemplate[] {
	if (cache) return cache;
	const out: RenderedTemplate[] = [];
	for (const t of sentenceTemplates) {
		const r = renderSentenceTemplate(t);
		if (r) out.push(r);
	}
	for (const t of adjectiveTemplates) {
		const r = renderAdjectiveTemplate(t);
		if (r) out.push(r);
	}
	for (const t of pronounTemplates) {
		const r = renderPronounTemplate(t);
		if (r) out.push(r);
	}
	cache = out;
	return out;
}

/** Counts for each template type — used by the dump script header. */
export function getTemplateCounts(): { sentence: number; adjective: number; pronoun: number } {
	return {
		sentence: sentenceTemplates.length,
		adjective: adjectiveTemplates.length,
		pronoun: pronounTemplates.length
	};
}
