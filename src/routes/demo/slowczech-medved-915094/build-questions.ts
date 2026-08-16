/**
 * Turns the curated demo package into real engine `DrillQuestion`s.
 * Pure functions, no Svelte — unit-tested in build-questions.spec.ts.
 */
import type {
	Case,
	DrillQuestion,
	Number_,
	SentenceTemplate,
	VariantForms,
	WordEntry
} from '$lib/types';
import { CASE_INDEX } from '$lib/types';
import { filterParadigmNotes } from '$lib/utils/filter-paradigm-note';
import paradigmsData from '$lib/data/paradigms.json';
import {
	generateCaseIdentification,
	generateFormProduction,
	generateSentenceDrill,
	loadWordBank
} from '$lib/engine/drill';
import type { DemoItem, DemoPackage, DemoSectionDef } from './content';

export interface BuiltQuestion {
	item: DemoItem;
	question: DrillQuestion;
	/** Notes for DrillCard's `paradigmNotes` prop, keyed `${case}_${number}`. */
	paradigmNotes: Record<string, string>;
	/** Case buttons for case_identification; the full set otherwise. */
	caseOptions: Case[];
	source: 'verbatim' | 'inspired' | null;
}

export interface BuiltSection {
	def: DemoSectionDef;
	questions: BuiltQuestion[];
}

const ALL_CASES_ORDERED: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

/** Look a lemma up in the demo's local words first, then the real bank. */
export function resolveWord(lemma: string, localWords: WordEntry[]): WordEntry | null {
	const local = localWords.find((w) => w.lemma === lemma);
	if (local) return local;
	return loadWordBank().find((w) => w.lemma === lemma) ?? null;
}

/**
 * Clone a WordEntry with a per-slot override: `form` becomes the primary
 * (displayed, spoken, graded) answer; the previous primary and any
 * `acceptAlso` spellings stay accepted as variants. The engine and DrillCard
 * both read `word.forms` / `word.variantForms`, so this is the single place
 * that keeps them consistent — no engine changes needed.
 */
export function withFormOverride(
	word: WordEntry,
	number: Number_,
	case_: Case,
	form: string,
	acceptAlso: string[] = []
): WordEntry {
	const idx = CASE_INDEX[case_];
	const forms = { sg: [...word.forms.sg], pl: [...word.forms.pl] } as WordEntry['forms'];
	const previous = forms[number][idx];
	forms[number][idx] = form;

	const existing: VariantForms = { ...(word.variantForms?.[number] ?? {}) };
	const merged = new Set<string>([...(existing[idx] ?? []), ...acceptAlso]);
	if (previous) merged.add(previous);
	merged.delete(form);
	const slotVariants = [...merged];
	const numberVariants: VariantForms = { ...existing };
	if (slotVariants.length > 0) numberVariants[idx] = slotVariants;
	else delete numberVariants[idx];

	return {
		...word,
		forms,
		variantForms: { ...(word.variantForms ?? {}), [number]: numberVariants }
	};
}

function toTemplate(item: DemoItem, template: string): SentenceTemplate {
	return {
		id: `demo_${item.id}`,
		template,
		lemmaCategory: 'any',
		requiredCase: item.case,
		number: item.number,
		trigger: '',
		why: item.why,
		difficulty: 'A2'
	};
}

function paradigmNotesFor(word: WordEntry, item: DemoItem): Record<string, string> {
	const key = `${item.case}_${item.number}`;
	if (item.kind === 'form') {
		// Form-recall cards suppress template.why, so the sentence-specific
		// explanation travels through paradigmNotes instead.
		return { [key]: item.why };
	}
	// Sentence / identify cards: template.why carries the sentence-specific
	// explanation; the paradigm note adds the general rule underneath.
	if (word.irregular) return {};
	const entry = paradigmsData.find((p) => p.id === word.paradigm);
	if (!entry?.whyNotes) return {};
	const filtered = filterParadigmNotes({ ...entry.whyNotes }, word);
	return filtered[key] ? { [key]: filtered[key] } : {};
}

export function buildQuestion(item: DemoItem, localWords: WordEntry[]): BuiltQuestion {
	const base = resolveWord(item.lemma, localWords);
	if (!base) throw new Error(`demo item ${item.id}: lemma "${item.lemma}" not found`);
	const word = item.overrideForm
		? withFormOverride(base, item.number, item.case, item.overrideForm, item.acceptAlso)
		: item.acceptAlso && item.acceptAlso.length > 0
			? withFormOverride(
					base,
					item.number,
					item.case,
					base.forms[item.number][CASE_INDEX[item.case]],
					item.acceptAlso
				)
			: base;

	let question: DrillQuestion | null;
	let caseOptions: Case[] = ALL_CASES_ORDERED;
	let source: BuiltQuestion['source'] = null;
	switch (item.kind) {
		case 'sentence':
			question = generateSentenceDrill(toTemplate(item, item.template), word);
			source = item.source;
			break;
		case 'identify':
			question = generateCaseIdentification(toTemplate(item, item.template), word);
			caseOptions = item.caseOptions;
			source = item.source;
			break;
		case 'form':
			question = generateFormProduction(word, item.case, item.number);
			break;
	}
	if (!question) {
		throw new Error(
			`demo item ${item.id}: no ${item.case} ${item.number} form for "${item.lemma}"`
		);
	}
	return { item, question, paradigmNotes: paradigmNotesFor(word, item), caseOptions, source };
}

export function buildPackage(pkg: DemoPackage): BuiltSection[] {
	const byId = new Map<string, DemoItem>();
	for (const section of pkg.sections) {
		for (const item of section.items) {
			if (byId.has(item.id)) throw new Error(`duplicate demo item id ${item.id}`);
			byId.set(item.id, item);
		}
	}
	return pkg.sections.map((def) => {
		const items = [...def.items];
		for (const id of def.reuse ?? []) {
			const reused = byId.get(id);
			if (!reused) throw new Error(`section ${def.id} reuses unknown item ${id}`);
			items.push(reused);
		}
		return { def, questions: items.map((item) => buildQuestion(item, pkg.localWords)) };
	});
}
