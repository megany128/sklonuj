/**
 * Which spacing cells a question pool can actually drill, per case, for the
 * spaced case pick (`pickWeightedCase`). Only slots with a valid form count —
 * a paradigm with no vocative or no singular would otherwise sit at the
 * "never seen" weight forever and inflate that case. Each builder makes one
 * pass over its pool for all cases at once.
 */
import type {
	AdjectiveEntry,
	AdjectiveGenderKey,
	Case,
	Number_,
	PronounEntry,
	WordEntry
} from '../types.ts';
import { getAdjectiveGenderKey } from './adjective-drill.ts';
import { hasValidForm } from './drill.ts';
import { getPronounForm } from './pronoun-drill.ts';
import { adjectiveCellKey, caseCellKey, nounCellKey, pronounCellKey } from './spacing.ts';

/**
 * Which cells the question being generated will advance: a production drill
 * moves paradigm × case × number cells, a case-identification drill moves
 * the case's recognition cell. Only those cells should weigh the case pick —
 * a cell the current drill type can never advance would sit at the "never
 * seen" weight forever and skew every pick.
 */
export type CellKind = 'production' | 'recognition';

function recognitionCells(case_: Case, numbers: readonly Number_[], drillable: boolean): string[] {
	return drillable ? numbers.map((number_) => caseCellKey(case_, number_)) : [];
}

/**
 * Noun cells per case: production cells (paradigm × number) with a valid
 * form, or the case's recognition cell when at least one word is drillable.
 */
export function nounCellsByCase(
	words: readonly WordEntry[],
	cases: readonly Case[],
	numbers: readonly Number_[],
	kind: CellKind
): Map<Case, string[]> {
	const found = new Map<Case, Set<string>>(cases.map((c) => [c, new Set<string>()]));
	for (const w of words) {
		for (const [c, set] of found) {
			for (const number_ of numbers) {
				if (hasValidForm(w, c, number_)) set.add(nounCellKey(w.paradigm, c, number_));
			}
		}
	}
	const out = new Map<Case, string[]>();
	for (const [c, set] of found) {
		out.set(c, kind === 'production' ? [...set] : recognitionCells(c, numbers, set.size > 0));
	}
	return out;
}

/** Adjective cells (type × gender × number) the adjectives and nouns can form. */
export function adjectiveCellsByCase(
	adjectives: readonly AdjectiveEntry[],
	nouns: readonly WordEntry[],
	cases: readonly Case[],
	numbers: readonly Number_[]
): Map<Case, string[]> {
	const types = [...new Set(adjectives.map((a) => a.paradigmType))];
	const slots = new Map<Case, Map<Number_, Set<AdjectiveGenderKey>>>(
		cases.map((c) => [c, new Map(numbers.map((n) => [n, new Set<AdjectiveGenderKey>()]))])
	);
	for (const w of nouns) {
		const gender = getAdjectiveGenderKey(w);
		for (const [c, byNumber] of slots) {
			for (const [number_, genders] of byNumber) {
				if (hasValidForm(w, c, number_)) genders.add(gender);
			}
		}
	}
	const out = new Map<Case, string[]>();
	for (const [c, byNumber] of slots) {
		const keys: string[] = [];
		for (const [number_, genders] of byNumber) {
			for (const gender of genders) {
				for (const type of types) keys.push(adjectiveCellKey(type, gender, c, number_));
			}
		}
		out.set(c, keys);
	}
	return out;
}

/**
 * Pronoun cells per case: production cells (lemma × number) with a form, or
 * the case's recognition cell when at least one pronoun is drillable.
 */
export function pronounCellsByCase(
	pronouns: readonly PronounEntry[],
	cases: readonly Case[],
	numbers: readonly Number_[],
	kind: CellKind
): Map<Case, string[]> {
	const out = new Map<Case, string[]>();
	for (const c of cases) {
		const keys: string[] = [];
		for (const number_ of numbers) {
			for (const pronoun of pronouns) {
				if (getPronounForm(pronoun, c, number_) !== null) {
					keys.push(pronounCellKey(pronoun.lemma, c, number_));
				}
			}
		}
		out.set(c, kind === 'production' ? keys : recognitionCells(c, numbers, keys.length > 0));
	}
	return out;
}

/**
 * Memoise a template pool-size function by template id, so a case-preference
 * filter and the weighted template pick don't each rescan the word bank.
 */
export function cachedPoolSize<T extends { id: string }>(
	poolSize: (t: T) => number
): (t: T) => number {
	const sizes = new Map<string, number>();
	return (t) => {
		const cached = sizes.get(t.id);
		if (cached !== undefined) return cached;
		const size = poolSize(t);
		sizes.set(t.id, size);
		return size;
	};
}
