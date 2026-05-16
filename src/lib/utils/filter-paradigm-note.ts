import type { Case, Number_, WordEntry } from '$lib/types';
import { CASE_INDEX } from '$lib/types';

function lemmaStem(lemma: string): string {
	if (/[aoe]$/i.test(lemma)) return lemma.slice(0, -1);
	return lemma;
}

function hasFleetingE(word: WordEntry): boolean {
	const lemma = word.lemma;
	if (!/[bcčdďfghjklmnňprřsštťvzž]e[bcčdďfghjklmnňprřsštťvzž]$/i.test(lemma)) return false;
	const stripped = (lemma.slice(0, -2) + lemma.slice(-1)).toLowerCase();
	const genSg = (word.forms.sg[CASE_INDEX.gen] ?? '').toLowerCase();
	const datSg = (word.forms.sg[CASE_INDEX.dat] ?? '').toLowerCase();
	return genSg.startsWith(stripped) || datSg.startsWith(stripped);
}

function splitSentences(text: string): string[] {
	// Protect abbreviations whose internal period would otherwise split the sentence.
	const protectedText = text
		.replace(/\be\.g\./gi, 'e__DOT__g__DOT__')
		.replace(/\bi\.e\./gi, 'i__DOT__e__DOT__');
	const matches = protectedText.match(/[^.!?]+[.!?]+/g);
	if (!matches) return [text];
	return matches.map((s) => s.replace(/__DOT__/g, '.').trim()).filter(Boolean);
}

interface LemmaTraits {
	endsK: boolean;
	endsR: boolean;
	endsH: boolean;
	endsCh: boolean;
	fleeting: boolean;
}

/** Trim irrelevant alternations inside a single sentence in place — drop
 * "k→c", "r→ř", "h/ch take -u", "ch→š" sub-clauses that the lemma doesn't
 * exercise. Returns null if the whole sentence becomes empty after pruning. */
function pruneSentence(sentence: string, t: LemmaTraits): string | null {
	let s = sentence;

	// Strip "k→c (...)", "r→ř (...)", "h→z (...)", "ch→š (...)" alternation
	// fragments when the lemma doesn't end in that consonant. The fragments
	// appear as comma-separated lists inside "Watch out: ..." or "Before -ě: ..."
	// sentences, so we treat each as an optional comma-prefixed unit.
	const alternations: Array<{ pattern: RegExp; keep: boolean }> = [
		{ pattern: /(,\s*)?k→c(\s*\([^)]*\))?/g, keep: t.endsK },
		{ pattern: /(,\s*)?r→ř(\s*\([^)]*\))?/g, keep: t.endsR },
		{ pattern: /(,\s*)?h→z(\s*\([^)]*\))?/g, keep: t.endsH },
		{ pattern: /(,\s*)?ch→š(\s*\([^)]*\))?/g, keep: t.endsCh }
	];
	for (const { pattern, keep } of alternations) {
		if (!keep) s = s.replace(pattern, '');
	}

	// "; nouns with h/ch take -u instead (e.g. břehu, smíchu)" — only relevant
	// if lemma stem ends in h or ch.
	if (!t.endsH && !t.endsCh) {
		s = s.replace(/;\s*nouns with h\/ch take -u instead(\s*\([^)]*\))?/gi, '');
	}

	// Clean up dangling punctuation/whitespace left by removals.
	s = s.replace(/:\s*[,;]+\s*/g, ': ');
	s = s.replace(/,\s*,/g, ',');
	s = s.replace(/\s*,\s*\./g, '.');
	s = s.replace(/\s*;\s*\./g, '.');
	s = s.replace(/\s{2,}/g, ' ').trim();

	// If a "Watch out: ..." or "Before -ě: ..." preamble survived but lost all
	// its alternations, drop the whole sentence — the preamble alone has no
	// information.
	if (/^(Watch out:|Before -ě:)\s*\.?$/i.test(s)) return null;
	if (/^(Watch out: some consonants change before -[^:]*:\s*\.?)$/i.test(s)) return null;
	if (/^Before -ě:\s*\.?$/i.test(s)) return null;

	return s;
}

/**
 * Trim "Watch out / Before -ě / fleeting e" clauses from a paradigm note when
 * they don't apply to the specific word being drilled. Always keeps the first
 * sentence (the main rule).
 */
export function filterParadigmNote(
	note: string,
	word: WordEntry,
	_case: Case,
	_number: Number_
): string {
	const sentences = splitSentences(note);
	if (sentences.length <= 1) return note;

	const stem = lemmaStem(word.lemma.toLowerCase());
	const lastCh = stem.slice(-1);
	const lastTwo = stem.slice(-2);
	const traits: LemmaTraits = {
		endsK: lastCh === 'k',
		endsR: lastCh === 'r',
		endsH: lastCh === 'h' && lastTwo !== 'ch',
		endsCh: lastTwo === 'ch',
		fleeting: hasFleetingE(word)
	};

	const kept: string[] = [sentences[0]];
	for (let i = 1; i < sentences.length; i++) {
		const s = sentences[i];

		// Fleeting-e clause
		if (/fleeting e|-ek\/-ec/i.test(s)) {
			if (traits.fleeting) kept.push(s);
			continue;
		}

		// Sentences referencing consonant alternation or h/ch -u choice:
		// prune sub-clauses individually rather than dropping wholesale.
		if (
			/Before -ě:/i.test(s) ||
			/Watch out.*consonants change/i.test(s) ||
			/h\/ch take -u/i.test(s) ||
			/After these soft consonants/i.test(s)
		) {
			const pruned = pruneSentence(s, traits);
			if (pruned) kept.push(pruned);
			continue;
		}

		kept.push(s);
	}

	return kept.join(' ');
}

export function filterParadigmNotes(
	notes: Record<string, string>,
	word: WordEntry
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, val] of Object.entries(notes)) {
		const m = key.match(/^(nom|gen|dat|acc|voc|loc|ins)_(sg|pl)$/);
		if (!m) {
			out[key] = val;
			continue;
		}
		out[key] = filterParadigmNote(val, word, m[1] as Case, m[2] as Number_);
	}
	return out;
}
