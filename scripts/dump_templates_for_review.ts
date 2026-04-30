#!/usr/bin/env -S node --experimental-strip-types
/**
 * Dump all sentence/adjective/pronoun templates as a markdown checklist for
 * native-speaker review.
 *
 * Output: audit/templates_review.md (gitignored).
 *
 * Reuses the same rendering logic as the in-browser admin dashboard
 * (`src/lib/server/template-review.ts`) so both surfaces produce identical
 * matches and surface forms — including preposition voicing.
 *
 * Reviewer workflow:
 *   pnpm audit:templates
 *   open audit/templates_review.md
 *   tick the checkbox for OK templates, leave a comment under bad ones.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	getAllRenderedTemplates,
	getTemplateCounts,
	type RenderedTemplate,
	type TemplateType
} from '../src/lib/server/template-review.ts';
import type { Case } from '../src/lib/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_DIR = join(REPO_ROOT, 'audit');
const OUT_FILE = join(OUT_DIR, 'templates_review.md');

const CASE_LABEL: Record<Case, string> = {
	nom: 'Nominative',
	gen: 'Genitive',
	dat: 'Dative',
	acc: 'Accusative',
	voc: 'Vocative',
	loc: 'Locative',
	ins: 'Instrumental'
};
const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
const DIFFICULTY_ORDER = ['A1', 'A2', 'B1', 'B2'];

/**
 * Cap on the "All lemmas" inline list per template. Beyond this, the list
 * becomes a single thousand-entry comma blob and is unscannable on paper —
 * reviewers should use the dashboard chip grid instead.
 */
const MAX_INLINE_LEMMAS = 50;

function caseDifficultyKey(t: RenderedTemplate): string {
	return `${t.requiredCase}/${t.difficulty}`;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const item of items) {
		const key = keyFn(item);
		const arr = out.get(key);
		if (arr) arr.push(item);
		else out.set(key, [item]);
	}
	return out;
}

function sortGroupKeys(keys: Iterable<string>): string[] {
	return [...keys].sort((a, b) => {
		const [caseA, diffA] = a.split('/');
		const [caseB, diffB] = b.split('/');
		const ci = CASE_ORDER.indexOf(caseA as Case) - CASE_ORDER.indexOf(caseB as Case);
		if (ci !== 0) return ci;
		return DIFFICULTY_ORDER.indexOf(diffA) - DIFFICULTY_ORDER.indexOf(diffB);
	});
}

function renderMeta(t: RenderedTemplate): string {
	const meta: string[] = [
		`case=${t.requiredCase}`,
		`number=${t.number}`,
		`difficulty=${t.difficulty}`
	];
	if (t.lemmaCategory) meta.push(`category=${t.lemmaCategory}`);
	if (t.semanticTags && t.semanticTags.length > 0) meta.push(`tags=${t.semanticTags.join(',')}`);
	if (t.excludesCategories && t.excludesCategories.length > 0)
		meta.push(`excludes=${t.excludesCategories.join(',')}`);
	if (t.requiredGender) meta.push(`gender=${t.requiredGender}`);
	if (t.requiredAnimate !== undefined) meta.push(`animate=${t.requiredAnimate}`);
	if (t.pronounCategory) meta.push(`pronounCat=${t.pronounCategory}`);
	if (t.requiredPronoun) meta.push(`pronoun=${t.requiredPronoun}`);
	if (t.formContext) meta.push(`formContext=${t.formContext}`);
	if (t.adjectiveCategories && t.adjectiveCategories.length > 0)
		meta.push(`adjCats=${t.adjectiveCategories.join(',')}`);
	return meta.join(' · ');
}

function renderSection(title: string, templates: RenderedTemplate[]): string {
	const lines: string[] = [];
	lines.push(`# ${title}`, '');
	lines.push(`Total: **${templates.length}** templates`, '');
	const groups = groupBy(templates, caseDifficultyKey);
	for (const key of sortGroupKeys(groups.keys())) {
		const [caseName, diff] = key.split('/');
		const items = groups.get(key) ?? [];
		const label = CASE_LABEL[caseName as Case] ?? caseName;
		lines.push(`## ${label} · ${diff} (${items.length})`, '');
		for (const t of items) {
			lines.push(`- [ ] **${t.id}**`);
			lines.push(`      Template: \`${t.template}\``);
			if (t.trigger) lines.push(`      Trigger: \`${t.trigger}\``);
			lines.push(`      Meta: ${renderMeta(t)}`);
			lines.push(`      Why: ${t.why}`);
			if (t.examples.length === 0) {
				lines.push(`      ⚠️ **NO MATCHING LEMMAS** — template never fires.`);
			} else {
				lines.push(`      Examples (${t.candidates.length} total candidates):`);
				for (const ex of t.examples) {
					// Bold the inflected form inside the rendered (voiced) sentence.
					const filledBold = ex.filled.replace(ex.form, `**${ex.form}**`);
					lines.push(`        - ${ex.lemma} → "${filledBold}"`);
				}
				if (t.candidates.length <= MAX_INLINE_LEMMAS) {
					lines.push(`      All lemmas: ${t.candidates.join(', ')}`);
				} else {
					const shown = t.candidates.slice(0, MAX_INLINE_LEMMAS);
					const remaining = t.candidates.length - MAX_INLINE_LEMMAS;
					lines.push(
						`      First ${MAX_INLINE_LEMMAS} lemmas: ${shown.join(', ')}, …+${remaining} more (use admin dashboard)`
					);
				}
			}
			lines.push('');
		}
	}
	return lines.join('\n');
}

function bucketByType(all: RenderedTemplate[]): Record<TemplateType, RenderedTemplate[]> {
	const out: Record<TemplateType, RenderedTemplate[]> = {
		sentence: [],
		adjective: [],
		pronoun: []
	};
	for (const t of all) out[t.type].push(t);
	return out;
}

function main(): void {
	mkdirSync(OUT_DIR, { recursive: true });
	const all = getAllRenderedTemplates();
	const buckets = bucketByType(all);
	const sections: string[] = [];
	sections.push('# Skloňuj template review', '');
	sections.push('Generated by `pnpm audit:templates`. Tick the checkbox for OK templates;');
	sections.push('flag bad ones with a comment beneath. Examples are deterministic, so');
	sections.push('re-running the script preserves your checkmarks.', '');
	sections.push('Examples are rendered with preposition voicing applied (k → ke, v → ve, s → se,');
	sections.push('z → ze) — what you see is what learners see.', '');
	sections.push(
		'Block individual (template, lemma) pairs via the admin dashboard at',
		'`/admin/audit/templates` — chip click. The "All lemmas" list under each',
		'template is the complete set the drill engine pairs with that template;',
		'reviewers can call out bad lemmas by name in the comment beneath.',
		''
	);
	sections.push(`Generated: ${new Date().toISOString()}`, '');
	sections.push('---', '');
	sections.push(renderSection('Sentence templates', buckets.sentence));
	sections.push('---', '');
	sections.push(renderSection('Adjective templates', buckets.adjective));
	sections.push('---', '');
	sections.push(renderSection('Pronoun templates', buckets.pronoun));
	writeFileSync(OUT_FILE, sections.join('\n'), 'utf-8');
	const counts = getTemplateCounts();
	console.log(`Wrote ${OUT_FILE}`);
	console.log(
		`  Sentence: ${counts.sentence}, Adjective: ${counts.adjective}, Pronoun: ${counts.pronoun}`
	);
}

main();
