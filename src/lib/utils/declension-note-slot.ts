import type { Case, Number_ } from '$lib/types';
import { CASE_INDEX } from '$lib/types';
import type { NoteSlot } from './filter-paradigm-note';

/**
 * A word's `declensionNote` covers several cases at once:
 *
 *   Genitive sg: -a (hřbitova)
 *   Dative hřbitovu, locative na hřbitově
 *
 * Shown under a genitive question, the dative/locative clause is noise. This
 * keeps the clauses that name the drilled case and number, plus the ones that
 * name none (fleeting e, "Takes na", "Diminutive of …"), which apply to every
 * case. A clause with no label of its own inherits the one before it in its
 * line ("Nominative pl: -é (ředitelé), like other -tel agent nouns").
 */

const ALL_CASES: readonly Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

const CASE_WORDS: Record<string, Case> = {
	nom: 'nom',
	nominative: 'nom',
	gen: 'gen',
	genitive: 'gen',
	dat: 'dat',
	dative: 'dat',
	acc: 'acc',
	accusative: 'acc',
	voc: 'voc',
	vocative: 'voc',
	loc: 'loc',
	locative: 'loc',
	ins: 'ins',
	instrumental: 'ins'
};

const NUMBER_WORDS: Record<string, Number_> = {
	sg: 'sg',
	singular: 'sg',
	pl: 'pl',
	plural: 'pl'
};

/** Which cases and numbers a clause is about; null fields mean "any". */
interface Scope {
	cases: Case[] | null;
	numbers: Number_[] | null;
}

const ANY: Scope = { cases: null, numbers: null };

interface Clause {
	text: string;
	/** The separator that preceded it in the line ("" for the first). */
	sep: string;
}

/** Split on commas and semicolons outside parentheses, keeping which one it was. */
function splitClauses(line: string): Clause[] {
	const out: Clause[] = [];
	let depth = 0;
	let current = '';
	let sep = '';
	for (const ch of line) {
		if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		if ((ch === ',' || ch === ';') && depth === 0) {
			if (current.trim()) out.push({ text: current.trim(), sep });
			current = '';
			sep = ch;
		} else {
			current += ch;
		}
	}
	if (current.trim()) out.push({ text: current.trim(), sep });
	return out;
}

function isLabelToken(token: string): boolean {
	return token in CASE_WORDS || token in NUMBER_WORDS;
}

/**
 * The case/number labels a clause carries. With a colon only the label before
 * it counts, so a form after it ("Genitive pl: dat") is never read as a label —
 * unless that label names none, when the words leading the rest are the label
 * ("Mixes píseň and kost: gen sg lodě"). Parenthesised examples never count;
 * "outside nom/acc" means every other case.
 */
function scopeOf(clause: string): Scope | null {
	const plain = clause.replace(/\([^)]*\)/g, ' ').toLowerCase();
	const colon = plain.indexOf(':');
	let tokens = (colon === -1 ? plain : plain.slice(0, colon)).split(/[\s/]+/);
	if (colon !== -1 && !tokens.some(isLabelToken)) {
		const rest = plain
			.slice(colon + 1)
			.trim()
			.split(/[\s/]+/);
		const end = rest.findIndex((t) => !isLabelToken(t));
		tokens = end === -1 ? rest : rest.slice(0, end);
	}
	const cases = new Set<Case>();
	const numbers = new Set<Number_>();
	let outside = false;
	for (const token of tokens) {
		if (token === 'outside') outside = true;
		const c = CASE_WORDS[token];
		if (c) cases.add(c);
		const n = NUMBER_WORDS[token];
		if (n) numbers.add(n);
	}
	if (cases.size === 0 && numbers.size === 0) return null;
	return {
		cases: cases.size === 0 ? null : outside ? ALL_CASES.filter((c) => !cases.has(c)) : [...cases],
		numbers: numbers.size === 0 ? null : [...numbers]
	};
}

/** Both scopes together; "any" absorbs the other. */
function union(a: Scope, b: Scope): Scope {
	return {
		cases: a.cases && b.cases ? [...new Set([...a.cases, ...b.cases])] : null,
		numbers: a.numbers && b.numbers ? [...new Set([...a.numbers, ...b.numbers])] : null
	};
}

function matches(scope: Scope, slot: NoteSlot): boolean {
	return (
		(scope.cases === null || scope.cases.includes(slot.case)) &&
		(scope.numbers === null || scope.numbers.includes(slot.number))
	);
}

/** "Also accepted in both: …" and "Not kost-style …" cover every case the line above did. */
const CONTINUATION = /^(also|not)\b/i;

/** The word's forms, so unlabelled examples can be told apart by number. */
export interface NoteForms {
	sg: readonly string[];
	pl: readonly string[];
}

function wordsOf(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.filter(Boolean);
}

interface FormSets {
	/** Forms only the singular has, minus the lemma (which names the word). */
	singular: Set<string>;
	/** Forms only the plural has (trička is both gen sg and nom pl, so neither). */
	plural: Set<string>;
	vocative: string;
}

function formSets(forms: NoteForms): FormSets {
	const sg = new Set(forms.sg.map((f) => f.toLowerCase()).filter(Boolean));
	const pl = new Set(forms.pl.map((f) => f.toLowerCase()).filter(Boolean));
	const lemma = (forms.sg[0] ?? '').toLowerCase();
	return {
		singular: new Set([...sg].filter((f) => !pl.has(f) && f !== lemma)),
		plural: new Set([...pl].filter((f) => !sg.has(f))),
		vocative: (forms.sg[CASE_INDEX.voc] ?? '').toLowerCase()
	};
}

const PARENS = /\s*\([^)]*\)/g;

/**
 * Rewrite one unlabelled stretch for a plural question. A general rule shown
 * with singular examples ("Fleeting e: leden → ledna, v lednu", "Latin neuter:
 * -um drops before endings (centra, centru)") still explains the plural, so
 * the rule stays and its examples become this word's own plural form
 * ("Fleeting e: leden → lednech"). A stretch whose singular forms are only
 * the vocative ("endearment: kočičko") says nothing about the plural and is
 * dropped. Returns the text unchanged when it isn't singular-only.
 */
function forPlural(text: string, sets: FormSets, lemma: string, form: string): string | null {
	const words = wordsOf(text);
	const quotedSingular = words.filter((w) => sets.singular.has(w));
	if (quotedSingular.length === 0 || words.some((w) => sets.plural.has(w))) return text;
	if (quotedSingular.every((w) => w === sets.vocative)) return null;
	if (!form) return null;
	const own = `${lemma} → ${form}`;
	const quotesForm = (part: string) =>
		/→/.test(part) || wordsOf(part).some((w) => sets.singular.has(w) || w === lemma);
	const colon = text.indexOf(':');
	if (colon !== -1) {
		const label = text.slice(0, colon).trim();
		const rest = text
			.slice(colon + 1)
			.replace(PARENS, '')
			.trim();
		// "Fleeting e: leden → ledna, …" lists examples; "Latin neuter: -um
		// drops before endings (…)" states a rule and keeps it.
		return quotesForm(rest) || rest === '' ? `${label}: ${own}` : `${label}: ${rest} (${own})`;
	}
	const rule = text.replace(PARENS, '').trim();
	// "Hard chmelu, chmelem" is all examples with no rule to keep.
	return quotesForm(rule) ? null : `${rule} (${own})`;
}

interface KeptClause extends Clause {
	/** The clause names a number, its own or one it inherits in its line. */
	labelled: boolean;
	/** It was the first clause of its line, so it already starts the sentence. */
	leads: boolean;
}

/** Give the ";"-separated stretches that name no number and only quote
 * singular forms their plural reading (see `forPlural`). */
function pluralizeExamples(clauses: KeptClause[], forms: NoteForms, slot: NoteSlot): KeptClause[] {
	const sets = formSets(forms);
	const lemma = forms.sg[0] || forms.pl[0] || '';
	const form = forms.pl[CASE_INDEX[slot.case]] ?? '';
	const segments: KeptClause[][] = [];
	for (const clause of clauses) {
		if (segments.length === 0 || clause.sep === ';') segments.push([clause]);
		else segments[segments.length - 1].push(clause);
	}
	const out: KeptClause[] = [];
	for (const seg of segments) {
		if (seg.some((c) => c.labelled)) {
			out.push(...seg);
			continue;
		}
		const text = seg.map((c, i) => (i === 0 ? c.text : `${c.sep} ${c.text}`)).join('');
		const rewritten = forPlural(text, sets, lemma, form);
		if (rewritten === text) out.push(...seg);
		else if (rewritten !== null) {
			out.push({ text: rewritten, sep: seg[0].sep, labelled: false, leads: seg[0].leads });
		}
	}
	return out;
}

/**
 * A case label without a number ("Dative hřbitovu, locative na hřbitově")
 * means the number the note last named ("Genitive sg: -a" the line before),
 * so a plural question doesn't get singular forms. With the word's `forms`,
 * a plural question also swaps unlabelled singular-only examples for the
 * word's own plural form (see `forPlural`).
 */
export function declensionNoteForSlot(
	note: string,
	slot: NoteSlot,
	forms?: NoteForms
): string | null {
	const kept: string[] = [];
	let prevLineScope: Scope = ANY;
	let lastNumbers: Number_[] | null = null;
	for (const line of note.split('\n')) {
		let scope: Scope = CONTINUATION.test(line) ? prevLineScope : ANY;
		let lineScope: Scope | null = null;
		const clauses = splitClauses(line);
		let keptClauses: KeptClause[] = [];
		for (const [i, clause] of clauses.entries()) {
			let own = scopeOf(clause.text);
			if (own?.numbers) lastNumbers = own.numbers;
			else if (own?.cases && lastNumbers) {
				own = { cases: own.cases, numbers: lastNumbers };
			}
			if (own) {
				scope = own;
				lineScope = lineScope ? union(lineScope, own) : own;
			}
			if (matches(scope, slot)) {
				keptClauses.push({ ...clause, labelled: scope.numbers !== null, leads: i === 0 });
			}
		}
		prevLineScope = lineScope ?? scope;
		if (forms && slot.number === 'pl') keptClauses = pluralizeExamples(keptClauses, forms, slot);
		if (keptClauses.length === 0) continue;
		let text = keptClauses.map((c, i) => (i === 0 ? c.text : `${c.sep} ${c.text}`)).join('');
		// A clause that now starts the line was mid-sentence ("locative v lese").
		if (!keptClauses[0].leads) text = text.charAt(0).toUpperCase() + text.slice(1);
		kept.push(text);
	}
	return kept.length > 0 ? kept.join('\n') : null;
}
