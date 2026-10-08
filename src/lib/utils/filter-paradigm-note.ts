import type { Case, Number_, Paradigm, WordEntry } from '$lib/types';
import { CASE_INDEX, isParadigm } from '$lib/types';
import { matchedEndings, paradigmEndings } from './paradigm-endings';

/**
 * Paradigm `whyNotes` are terse rule lines separated by "\n":
 *
 *   hrad-type · locative sg → -ě or -u (na hradě, ve vlaku)
 *   Before -ě: k→c (rok → roce), r→ř (papír → papíře)
 *   After h/ch: -u (na břehu, o smíchu)
 *   Fleeting e drops: dárek → dárku
 *
 * Learners shouldn't have to work out which paradigm their word is or which of
 * several endings it took, so the first line is rewritten around the drilled
 * word ("park → park**u**", ending in bold). Every later line is a
 * gotcha, kept only when this word's form for this case actually shows it.
 */

export interface NoteSlot {
	case: Case;
	number: Number_;
}

/**
 * The form the learner is shown for this cell, as a one-item list (empty if
 * the cell has no form). Notes explain only this form: an accepted variant
 * (domu beside domě, svetře beside svetre) would otherwise drag in an ending
 * or alternation the shown form doesn't have.
 */
function shownForms(word: WordEntry, slot: NoteSlot): string[] {
	const primary = word.forms[slot.number][CASE_INDEX[slot.case]];
	return primary ? [primary.toLowerCase()] : [];
}

function lemmaStem(lemma: string): string {
	if (/[aoeě]$/i.test(lemma)) return lemma.slice(0, -1);
	return lemma;
}

/** The lemma with its fleeting e removed (dárek → dárk), or null if it has none. */
function fleetingStem(word: WordEntry): string | null {
	const lemma = word.lemma.toLowerCase();
	if (!/[bcčdďfghjklmnňprřsštťvzž]e[bcčdďfghjklmnňprřsštťvzž]$/.test(lemma)) return null;
	const stripped = lemma.slice(0, -2) + lemma.slice(-1);
	const genSg = (word.forms.sg[CASE_INDEX.gen] ?? '').toLowerCase();
	const datSg = (word.forms.sg[CASE_INDEX.dat] ?? '').toLowerCase();
	return genSg.startsWith(stripped) || datSg.startsWith(stripped) ? stripped : null;
}

interface WordFacts {
	lemma: string;
	/** Primary form for the drilled case — used as the example in kept gotchas. */
	form: string;
	stem: string;
	forms: string[];
	fleeting: string | null;
	/** declensionNote with spaces removed, to spot alternations it already explains. */
	ownNote: string;
}

/** `ch→š` comes before `h→z` so the h inside ch is never read as a plain h. */
const ALTERNATIONS: Array<{ token: string; from: string; to: string }> = [
	{ token: 'ch→š', from: 'ch', to: 'š' },
	{ token: 'k→c', from: 'k', to: 'c' },
	{ token: 'r→ř', from: 'r', to: 'ř' },
	{ token: 'h→z', from: 'h', to: 'z' }
];

function alternationIn(item: string): (typeof ALTERNATIONS)[number] | null {
	return ALTERNATIONS.find((alt) => item.includes(alt.token)) ?? null;
}

/** The alternation shows in this word's form (rok → roce), and the word's own
 * note doesn't already explain it. */
function alternationShows(alt: (typeof ALTERNATIONS)[number], f: WordFacts): boolean {
	if (f.ownNote.includes(alt.token)) return false;
	if (!f.stem.endsWith(alt.from)) return false;
	if (alt.from === 'h' && f.stem.endsWith('ch')) return false;
	const changed = f.stem.slice(0, -alt.from.length) + alt.to;
	return f.forms.some((form) => form.startsWith(changed));
}

/** Split on commas outside parentheses: "k→c (rok → roce), r→ř" → two items. */
function splitTopLevel(text: string): string[] {
	const items: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of text) {
		if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			items.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	items.push(current.trim());
	return items.filter(Boolean);
}

/** "After h/ch: -u (…)" — stems ending in the listed consonants take that ending. */
const AFTER_CONSONANTS = /^After ([a-zčďňřšťž]{1,2}(?:\/[a-zčďňřšťž]{1,2})*):\s*-(\S+)/;
/** "Spelling: -e after c/z/ř (…)" */
const SPELLING = /^Spelling: -(\S+) after ([a-zčďňřšťž](?:\/[a-zčďňřšťž])*)/;

/** Swap a gotcha's stock example ("(ruka → ruce)") for the drilled word's own
 * ("(kočka → kočce)"), so the learner sees the rule on the word in front of them. */
function withOwnExample(text: string, f: WordFacts): string {
	const own = `(${f.lemma} → ${f.form})`;
	const trailing = /\s*\([^)]*\)\s*$/;
	return trailing.test(text) ? text.replace(trailing, ` ${own}`) : `${text} ${own}`;
}

/** Returns the gotcha line as it should be shown for this word, or null to drop it. */
function pruneLine(line: string, f: WordFacts): string | null {
	if (/^Fleeting e\b/i.test(line)) {
		const stem = f.fleeting;
		if (!stem || !f.forms.some((form) => form.startsWith(stem))) return null;
		return `${line.slice(0, line.indexOf(':'))}: ${f.lemma} → ${f.form}`;
	}

	const after = AFTER_CONSONANTS.exec(line);
	if (after) {
		const consonants = after[1].split('/');
		const ending = after[2];
		return consonants.some((c) => f.stem.endsWith(c)) &&
			f.forms.some((form) => form.endsWith(ending))
			? withOwnExample(line, f)
			: null;
	}

	const spelling = SPELLING.exec(line);
	if (spelling) {
		const ending = spelling[1];
		const letters = spelling[2].split('/');
		return f.forms.some((form) => letters.some((l) => form.endsWith(l + ending)))
			? withOwnExample(line, f)
			: null;
	}

	if (/\bno ending\b/i.test(line) && /^Watch:/.test(line)) {
		return f.forms.some((form) => form === f.stem) ? withOwnExample(line, f) : null;
	}

	const colon = line.indexOf(':');
	if (colon === -1 || !ALTERNATIONS.some((alt) => line.includes(alt.token))) return line;

	// An alternation list: keep the alternations this word's form shows, plus
	// any item naming none. A list left with no alternation says nothing.
	const label = line.slice(0, colon);
	const items = splitTopLevel(line.slice(colon + 1));
	let keptAlternation = false;
	const kept: string[] = [];
	for (const item of items) {
		const alt = alternationIn(item);
		if (!alt) {
			kept.push(item);
		} else if (alternationShows(alt, f)) {
			kept.push(withOwnExample(item, f));
			keptAlternation = true;
		}
	}
	if (!keptAlternation) return null;
	return `${label}: ${kept.join(', ')}`;
}

/** "ending -ě or -u", "no ending", "no ending or -í". */
function describeEndings(endings: string[]): string {
	const parts = endings.map((e) => (e === '' ? 'no ending' : `-${e}`));
	const text = parts.join(' or ');
	return parts[0].startsWith('-') ? `ending ${text}` : text;
}

/** How the drilled word's form relates to its paradigm, for the pattern line. */
type FormKind =
	| { kind: 'ending'; ending: string }
	| { kind: 'none' }
	| { kind: 'same'; as: string }
	| { kind: 'other' };

/**
 * Rewrite the paradigm's rule line around the drilled word:
 *   "hrad-type · locative sg → -ě or -u (na hradě, ve vlaku)"
 *   → "park → park**u**" (the ending is marked bold for WhyNote)
 * "Same as <case>" rules keep that wording ("pán → pána: same as genitive").
 * Returns null when the word's form can't be described, so the original stays.
 */
function wordRuleLine(
	ruleLine: string,
	word: WordEntry,
	slot: NoteSlot
): { line: string; form: FormKind } | null {
	const primary = word.forms[slot.number][CASE_INDEX[slot.case]];
	if (!primary || !isParadigm(word.paradigm)) return null;

	const sameAs =
		/→ same as (nominative|genitive|dative|accusative|vocative|locative|instrumental)\b/.exec(
			ruleLine
		);
	const arrow = primary === word.lemma ? `${word.lemma}:` : `${word.lemma} → ${primary}:`;
	if (sameAs) {
		return { line: `${arrow} same as ${sameAs[1]}`, form: { kind: 'same', as: sameAs[1] } };
	}
	// Describe only the form we show; accepted variants (domu beside domě)
	// would add an ending the learner can't see.
	const endings = matchedEndings(word.paradigm, slot.case, slot.number, [primary]);
	// The paradigm's endings don't describe this form (lidé, chlapče): say so
	// rather than quoting a rule the word breaks.
	if (endings.length === 0) {
		return primary === word.lemma
			? null
			: { line: `${word.lemma} → ${primary}: irregular form`, form: { kind: 'other' } };
	}
	// Show the ending on the form itself, bolded ("park → park**u**"),
	// even when the form looks like the lemma (recepce → recepc**e**).
	const ending = endings
		.filter((e) => e !== '' && primary.toLowerCase().endsWith(e))
		.sort((a, b) => b.length - a.length)[0];
	if (ending) {
		const cut = primary.length - ending.length;
		return {
			line: `${word.lemma} → ${primary.slice(0, cut)}**${primary.slice(cut)}**`,
			form: { kind: 'ending', ending }
		};
	}
	const form: FormKind = endings.includes('') ? { kind: 'none' } : { kind: 'other' };
	return { line: `${arrow.slice(0, -1)}: ${describeEndings(endings)}`, form };
}

/** Plain-English gender/type of each paradigm, for the pattern line. */
const PARADIGM_KIND: Record<Paradigm, string> = {
	hrad: 'hard masculine inanimate',
	stroj: 'soft masculine inanimate',
	pán: 'hard masculine animate',
	muž: 'soft masculine animate',
	předseda: 'masculine animate in -a',
	soudce: 'masculine animate in -ce',
	žena: 'feminine in -a',
	růže: 'feminine in -e',
	píseň: 'feminine ending in a soft consonant',
	kost: 'feminine ending in a consonant',
	město: 'neuter in -o',
	moře: 'neuter in -e',
	kuře: 'neuter in -e, stem grows -et-',
	stavení: 'neuter in -í'
};

const CASE_NAME: Record<Case, string> = {
	nom: 'nominative',
	gen: 'genitive',
	dat: 'dative',
	acc: 'accusative',
	voc: 'vocative',
	loc: 'locative',
	ins: 'instrumental'
};

/**
 * Name the pattern behind the form, so the learner can apply it elsewhere:
 *   "Pattern: stroj (soft masculine inanimate). Genitive singular ends in -e:
 *    stroj → stroje."
 * The model word's own form is quoted only when it shows the same ending; a
 * paradigm with several endings for the slot lists them and says which one
 * this word takes ("…ends in -u, -ě or -e; park takes -u.").
 */
function patternLine(
	word: WordEntry,
	slot: NoteSlot,
	form: FormKind,
	model: WordEntry | undefined
): string | null {
	if (!isParadigm(word.paradigm) || form.kind === 'other') return null;
	const p = word.paradigm;
	const slotName = `${CASE_NAME[slot.case]} ${slot.number === 'sg' ? 'singular' : 'plural'}`;
	const head = `Pattern: ${p} (${PARADIGM_KIND[p]}). ${slotName.charAt(0).toUpperCase()}${slotName.slice(1)}`;
	const modelForm =
		model && model.lemma !== word.lemma ? model.forms[slot.number][CASE_INDEX[slot.case]] : '';
	const example = (fits: boolean) => (modelForm && fits ? `: ${p} → ${modelForm}` : '');

	if (form.kind === 'same') {
		return `${head} is the same as the ${form.as}${example(true)}.`;
	}
	const all = paradigmEndings(p, slot.case, slot.number);
	if (form.kind === 'none') {
		return all.length > 1
			? `${head} has no ending or ${all
					.filter((e) => e !== '')
					.map((e) => `-${e}`)
					.join(' or ')}; ${word.lemma} has none.`
			: `${head} has no ending${example(true)}.`;
	}
	const listed = all.filter((e) => e !== '').map((e) => `-${e}`);
	if (all.length > 1) {
		const others =
			all.length === 2
				? listed.join(' or ')
				: `${listed.slice(0, -1).join(', ')} or ${listed.at(-1)}`;
		return `${head} ends in ${others}; ${word.lemma} takes -${form.ending}.`;
	}
	return `${head} ends in -${form.ending}${example(modelForm.toLowerCase().endsWith(form.ending))}.`;
}

/**
 * Tailor one paradigm note to the drilled word: rewrite the rule line around
 * the word's own form, name the pattern behind it, and keep only the gotchas
 * its form for this case actually shows. `model` is the paradigm's model word
 * (stroj for formulář), quoted in the pattern line when it shows the ending.
 */
export function filterParadigmNote(
	note: string,
	word: WordEntry,
	slot: NoteSlot,
	model?: WordEntry
): string {
	const lines = note.split('\n');
	const facts: WordFacts = {
		lemma: word.lemma,
		form: word.forms[slot.number][CASE_INDEX[slot.case]] || word.lemma,
		stem: lemmaStem(word.lemma.toLowerCase()),
		forms: shownForms(word, slot),
		fleeting: fleetingStem(word),
		ownNote: (word.declensionNote ?? '').replace(/\s+/g, '')
	};

	const rule = wordRuleLine(lines[0], word, slot);
	const kept: string[] = [rule?.line ?? lines[0]];
	const pattern = rule ? patternLine(word, slot, rule.form, model) : null;
	if (pattern) kept.push(pattern);
	const own = ` (${facts.lemma} → ${facts.form})`;
	let ownShown = false;
	for (const line of lines.slice(1)) {
		let pruned = pruneLine(line, facts);
		if (!pruned) continue;
		// Show the word's own example once; a second gotcha on the same form
		// would only repeat it.
		if (pruned.endsWith(own)) {
			if (ownShown) pruned = pruned.slice(0, -own.length);
			ownShown = true;
		}
		kept.push(pruned);
	}
	return kept.join('\n');
}

const CASE_KEY = /^(nom|gen|dat|acc|voc|loc|ins)_(sg|pl)$/;

function parseSlot(key: string): NoteSlot | null {
	const match = CASE_KEY.exec(key);
	if (!match) return null;
	const c = match[1];
	const n = match[2];
	const cases: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
	const found = cases.find((x) => x === c);
	if (!found) return null;
	return { case: found, number: n === 'pl' ? 'pl' : 'sg' };
}

/** Tailor every case note of a paradigm to `word`; `model` is the paradigm's
 * model word, quoted in each pattern line. */
export function filterParadigmNotes(
	notes: Record<string, string>,
	word: WordEntry,
	model?: WordEntry
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, val] of Object.entries(notes)) {
		const slot = parseSlot(key);
		out[key] = slot ? filterParadigmNote(val, word, slot, model) : val;
	}
	return out;
}
