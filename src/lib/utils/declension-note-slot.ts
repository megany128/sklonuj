import type { Case, Number_ } from '$lib/types';
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

/**
 * An unlabelled stretch of a note ("Fleeting e: leden → ledna, v lednu,
 * lednem", "Declines like město: trička, tričku") is about the singular when
 * the only forms of the word it quotes are singular ones. One that also quotes
 * a plural-only form ("den → dne, dnu (pl dny, dnů)") covers both.
 */
function quotesOnlySingular(text: string, forms: NoteForms): boolean {
	const sg = new Set(forms.sg.map((f) => f.toLowerCase()).filter(Boolean));
	const pl = new Set(forms.pl.map((f) => f.toLowerCase()).filter(Boolean));
	// Forms both numbers share (trička: gen sg and nom pl) prove nothing either way.
	const plural = new Set([...pl].filter((f) => !sg.has(f)));
	const singular = new Set([...sg].filter((f) => !pl.has(f) && f !== forms.sg[0].toLowerCase()));
	const words = wordsOf(text);
	return words.some((w) => singular.has(w)) && !words.some((w) => plural.has(w));
}

interface KeptClause extends Clause {
	/** The clause names a number, its own or one it inherits in its line. */
	labelled: boolean;
}

/** Drop the ";"-separated stretches that name no number and only quote
 * singular forms ("Genitive dne in phrases like během dne"). */
function dropSingularOnly(clauses: KeptClause[], forms: NoteForms): KeptClause[] {
	const segments: KeptClause[][] = [];
	for (const clause of clauses) {
		if (segments.length === 0 || clause.sep === ';') segments.push([clause]);
		else segments[segments.length - 1].push(clause);
	}
	return segments
		.filter(
			(seg) =>
				seg.some((c) => c.labelled) || !quotesOnlySingular(seg.map((c) => c.text).join(' '), forms)
		)
		.flat();
}

/**
 * A case label without a number ("Dative hřbitovu, locative na hřbitově")
 * means the number the note last named ("Genitive sg: -a" the line before),
 * so a plural question doesn't get singular forms. With the word's `forms`,
 * a plural question also drops unlabelled examples that are all singular.
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
		for (const clause of clauses) {
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
				keptClauses.push({ ...clause, labelled: scope.numbers !== null });
			}
		}
		prevLineScope = lineScope ?? scope;
		if (forms && slot.number === 'pl') keptClauses = dropSingularOnly(keptClauses, forms);
		if (keptClauses.length === 0) continue;
		const first = keptClauses[0];
		let text = keptClauses.map((c, i) => (i === 0 ? c.text : `${c.sep} ${c.text}`)).join('');
		// A clause that now starts the line was mid-sentence ("locative v lese").
		if (first.text !== clauses[0].text || first.sep !== clauses[0].sep) {
			text = text.charAt(0).toUpperCase() + text.slice(1);
		}
		kept.push(text);
	}
	return kept.length > 0 ? kept.join('\n') : null;
}
