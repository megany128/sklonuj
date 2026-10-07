import type { Case, DrillQuestion, Paradigm, WordEntry } from '$lib/types';
import { CASE_INDEX } from '$lib/types';

/**
 * Hints a learner can open one at a time before answering. Each step gives
 * away a little more, and the last still leaves the ending to them:
 *
 *   clue   — what in the sentence decides the case ("o (about) + topic")
 *   case   — the case the blank needs (fill-in only; form drills name it,
 *            and it's skipped when the learner already picked a single case)
 *   like   — the paradigm's model word in that slot ("declines like hrad → hradě")
 *   start  — the first letters of the answer ("hrad…")
 */
export type DrillHint =
	| { kind: 'clue'; text: string }
	| { kind: 'case'; case: Case; plural: boolean; clue: string | null }
	| { kind: 'like'; model: string; form: string }
	| { kind: 'start'; prefix: string };

const FORM_PRODUCTION_TEMPLATES = new Set([
	'_form_production',
	'_pronoun_form_production',
	'_adj_form_production'
]);

/** The cue part of a template's `why` ("o (about) + topic → locative" → "o (about) + topic"). */
export function whyClue(q: DrillQuestion): string | null {
	if (FORM_PRODUCTION_TEMPLATES.has(q.template.id)) return null;
	const first = q.template.why.split('\n')[0];
	const arrow = first.indexOf('→');
	if (arrow <= 0) return null;
	const clue = first.slice(0, arrow).trim();
	return clue || null;
}

function lemmaOf(q: DrillQuestion): string {
	if (q.wordCategory === 'adjective') return q.adjective?.lemma ?? q.word.lemma;
	if (q.wordCategory === 'pronoun') return q.pronoun?.lemma ?? q.word.lemma;
	return q.word.lemma;
}

/** Letters of `answer` to reveal: what it shares with the lemma, at least
 * one letter, and never the whole answer. Null when there is nothing to hold back. */
function startPrefix(answer: string, lemma: string): string | null {
	if (answer.length < 2) return null;
	const a = answer.toLowerCase();
	const l = lemma.toLowerCase();
	let shared = 0;
	while (shared < a.length && shared < l.length && a[shared] === l[shared]) shared++;
	const reveal = Math.min(Math.max(shared, 1), answer.length - 1);
	return answer.slice(0, reveal);
}

export function drillHints(
	q: DrillQuestion,
	modelWord: (paradigm: Paradigm) => WordEntry | undefined,
	/** The learner is drilling one case, so naming it gives nothing away. */
	caseKnown = false
): DrillHint[] {
	const clue = whyClue(q);
	if (q.drillType === 'case_identification') {
		return clue ? [{ kind: 'clue', text: clue }] : [];
	}

	const hints: DrillHint[] = [];
	if (q.drillType === 'sentence_fill_in' && !caseKnown) {
		const plural =
			q.number === 'pl' && !(q.wordCategory === 'pronoun' && q.pronoun?.forms.sg === null);
		hints.push({ kind: 'case', case: q.case, plural, clue });
	}

	if (q.wordCategory !== 'adjective' && q.wordCategory !== 'pronoun') {
		const model = modelWord(q.word.paradigm);
		const form = model?.forms[q.number][CASE_INDEX[q.case]];
		if (model && form && model.lemma !== q.word.lemma) {
			hints.push({ kind: 'like', model: model.lemma, form });
		}
	}

	const answer = q.correctAnswer.split('/')[0].trim();
	const prefix = startPrefix(answer, lemmaOf(q));
	if (prefix) hints.push({ kind: 'start', prefix });
	return hints;
}

/**
 * Where a template's trigger (preposition or other cue word) sits in `text`:
 * the last whole-word match, so the one nearest a following blank wins.
 * Accepts slash variants ("s/se"), the "+ case" suffix pronoun templates
 * carry ("k + dative"), and runtime voicing (k → ke, v → ve, s → se, z → ze).
 */
export function findTrigger(text: string, trigger: string): { start: number; end: number } | null {
	const token = trigger.split('+')[0].trim().toLowerCase();
	if (!token || token.includes(' ')) return null;
	const variants = new Set<string>();
	for (const v of token.split('/')) {
		const word = v.trim();
		if (!word) continue;
		variants.add(word);
		if (/^[kvsz]$/.test(word)) variants.add(`${word}e`);
	}
	const lower = text.toLowerCase();
	let best: { start: number; end: number } | null = null;
	const wordRe = /[\p{L}]+/gu;
	for (const match of lower.matchAll(wordRe)) {
		if (variants.has(match[0]) && match.index !== undefined) {
			best = { start: match.index, end: match.index + match[0].length };
		}
	}
	return best;
}
