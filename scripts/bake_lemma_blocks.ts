#!/usr/bin/env -S node --experimental-strip-types
/**
 * Bake the per-template lemma blocks from Supabase into a static JSON snapshot
 * (src/lib/data/lemma_blocks.json) that the drill engine reads at build time.
 *
 * Reads `template_lemma_blocks` via a service-role client (RLS is enabled, no
 * client policies, so the server side is the only path in). Groups rows by
 * (template_type, template_id) and unions the lemmas across all reviewers.
 *
 * Workflow:
 *   pnpm audit:bake-blocks                # writes src/lib/data/lemma_blocks.json
 *   git diff src/lib/data/lemma_blocks.json   # eyeball the change
 *   git commit && deploy
 *
 * Env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (loaded via Node's --env-file=.env
 * flag, wired up in package.json's audit:bake-blocks script).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_FILE = join(REPO_ROOT, 'src/lib/data/lemma_blocks.json');

type TemplateType = 'sentence' | 'adjective' | 'pronoun';
const TEMPLATE_TYPES = new Set<string>(['sentence', 'adjective', 'pronoun']);

function isTemplateType(value: unknown): value is TemplateType {
	return typeof value === 'string' && TEMPLATE_TYPES.has(value);
}

interface BlockRow {
	templateId: string;
	templateType: TemplateType;
	lemma: string;
	reviewerId: string;
}

function parseRow(raw: unknown): BlockRow | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.template_id !== 'string') return null;
	if (!isTemplateType(r.template_type)) return null;
	if (typeof r.lemma !== 'string') return null;
	if (typeof r.reviewer_id !== 'string') return null;
	return {
		templateId: r.template_id,
		templateType: r.template_type,
		lemma: r.lemma,
		reviewerId: r.reviewer_id
	};
}

interface BakedSnapshot {
	sentence: Record<string, string[]>;
	adjective: Record<string, string[]>;
	pronoun: Record<string, string[]>;
}

function sortObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
	const sorted: Record<string, T> = {};
	for (const k of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
		sorted[k] = obj[k];
	}
	return sorted;
}

async function main(): Promise<void> {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
		console.error('Run via `pnpm audit:bake-blocks` (which loads .env).');
		process.exit(1);
	}

	const client = createClient(supabaseUrl, serviceRoleKey);

	// Only honor blocks created by reviewers who are *currently* admins. If a
	// reviewer's is_admin was revoked, their old blocks should not bake.
	const { data: adminProfiles, error: adminError } = await client
		.from('profiles')
		.select('id')
		.eq('is_admin', true);
	if (adminError) {
		console.error('Failed to load admin profile list:', adminError);
		process.exit(1);
	}
	const currentAdminIds = new Set<string>();
	if (Array.isArray(adminProfiles)) {
		for (const raw of adminProfiles) {
			if (typeof raw !== 'object' || raw === null) continue;
			const r = raw as Record<string, unknown>;
			if (typeof r.id === 'string') currentAdminIds.add(r.id);
		}
	}

	const { data, error } = await client
		.from('template_lemma_blocks')
		.select('template_id, template_type, lemma, reviewer_id');

	if (error) {
		console.error('Failed to read template_lemma_blocks:', error);
		process.exit(1);
	}

	const grouped: BakedSnapshot = { sentence: {}, adjective: {}, pronoun: {} };
	const seen: Record<TemplateType, Map<string, Set<string>>> = {
		sentence: new Map(),
		adjective: new Map(),
		pronoun: new Map()
	};

	let skippedNonAdmin = 0;
	if (Array.isArray(data)) {
		for (const raw of data) {
			const row = parseRow(raw);
			if (!row) continue;
			if (!currentAdminIds.has(row.reviewerId)) {
				skippedNonAdmin += 1;
				continue;
			}
			const bucket = seen[row.templateType];
			const set = bucket.get(row.templateId);
			if (set) set.add(row.lemma);
			else bucket.set(row.templateId, new Set([row.lemma]));
		}
	}

	for (const type of ['sentence', 'adjective', 'pronoun'] as const) {
		const bucket: Record<string, string[]> = {};
		for (const [templateId, lemmaSet] of seen[type]) {
			bucket[templateId] = [...lemmaSet].sort((a, b) => a.localeCompare(b));
		}
		grouped[type] = sortObjectKeys(bucket);
	}

	writeFileSync(OUT_FILE, JSON.stringify(grouped, null, 2) + '\n', 'utf-8');
	const totals = {
		sentence: Object.keys(grouped.sentence).length,
		adjective: Object.keys(grouped.adjective).length,
		pronoun: Object.keys(grouped.pronoun).length
	};
	console.log(`Wrote ${OUT_FILE}`);
	console.log(
		`  Templates with blocks — sentence: ${totals.sentence}, adjective: ${totals.adjective}, pronoun: ${totals.pronoun}`
	);
	if (skippedNonAdmin > 0) {
		console.log(
			`  Skipped ${skippedNonAdmin} block row(s) from non-admin reviewers (is_admin = false).`
		);
	}
}

void main();
