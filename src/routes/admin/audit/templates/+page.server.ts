import { error } from '@sveltejs/kit';
import { createAdminWriteClient, requireAdmin } from '$lib/server/admin';
import { getAllRenderedTemplates } from '$lib/server/template-review';
import lemmaBlocksData from '$lib/data/lemma_blocks.json';
import type { Case, Difficulty } from '$lib/types';
import type { PageServerLoad } from './$types';
import {
	TEMPLATE_TYPE_FILTERS,
	REVIEW_FILTER_VALUES,
	type GroupVm,
	type PageVm,
	type ReviewFilter,
	type ReviewRow,
	type TemplateRowVm,
	isReviewStatus,
	isTemplateType
} from './types';
import type { RenderedTemplate, TemplateType } from '$lib/server/template-review';

const CASE_ORDER: Record<Case, number> = {
	nom: 0,
	gen: 1,
	dat: 2,
	acc: 3,
	voc: 4,
	loc: 5,
	ins: 6
};
const NUMBER_ORDER: Record<'sg' | 'pl', number> = { sg: 0, pl: 1 };
const DIFFICULTY_ORDER: Record<Difficulty, number> = { A1: 0, A2: 1, B1: 2, B2: 3 };
const TYPE_ORDER: Record<TemplateType, number> = { sentence: 0, adjective: 1, pronoun: 2 };

/**
 * Group key + label for the "what is this template matched to?" axis.
 * Sentence: lemmaCategory (+ semanticTags as narrowing suffix).
 * Adjective: adjectiveCategories joined, or 'any' when unconstrained.
 * Pronoun: pronounCategory ?? lemmaCategory ?? requiredPronoun ?? 'any'.
 * The label drops the type (rendered as a chip in the UI instead).
 */
function getGroupKey(t: RenderedTemplate): { key: string; label: string } {
	if (t.type === 'sentence') {
		const base = t.lemmaCategory ?? 'other';
		const tagSuffix =
			t.semanticTags && t.semanticTags.length > 0 ? ` · +${t.semanticTags.join('+')}` : '';
		const label = `${base}${tagSuffix}`;
		return { key: `sentence::${label}`, label };
	}
	if (t.type === 'adjective') {
		const cats =
			t.adjectiveCategories && t.adjectiveCategories.length > 0
				? t.adjectiveCategories.join('+')
				: 'any adjective';
		return { key: `adjective::${cats}`, label: cats };
	}
	const label = t.pronounCategory ?? t.lemmaCategory ?? t.requiredPronoun ?? 'any pronoun';
	return { key: `pronoun::${label}`, label };
}

const CASE_SET: ReadonlySet<string> = new Set<Case>([
	'nom',
	'gen',
	'dat',
	'acc',
	'voc',
	'loc',
	'ins'
]);
const DIFFICULTY_SET: ReadonlySet<string> = new Set<Difficulty>(['A1', 'A2', 'B1', 'B2']);
const TYPE_FILTER_SET: ReadonlySet<string> = new Set<string>(TEMPLATE_TYPE_FILTERS);
const REVIEW_FILTER_SET: ReadonlySet<string> = new Set<string>(REVIEW_FILTER_VALUES);
const TEMPLATE_TYPE_VALUES: ReadonlyArray<(typeof TEMPLATE_TYPE_FILTERS)[number]> =
	TEMPLATE_TYPE_FILTERS;
const REVIEW_FILTER_VALUES_TYPED: ReadonlyArray<ReviewFilter> = REVIEW_FILTER_VALUES;

function isCase(value: string): value is Case {
	return CASE_SET.has(value);
}

function isDifficulty(value: string): value is Difficulty {
	return DIFFICULTY_SET.has(value);
}

function parseTypeFilter(value: string | null): (typeof TEMPLATE_TYPE_FILTERS)[number] {
	if (value === null || !TYPE_FILTER_SET.has(value)) return 'all';
	const match = TEMPLATE_TYPE_VALUES.find((v) => v === value);
	return match ?? 'all';
}

function parseReviewFilter(value: string | null): ReviewFilter {
	if (value === null || !REVIEW_FILTER_SET.has(value)) return 'unreviewed_by_me';
	const match = REVIEW_FILTER_VALUES_TYPED.find((v) => v === value);
	return match ?? 'unreviewed_by_me';
}

function parseRow(raw: unknown): ReviewRow | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.template_id !== 'string') return null;
	if (!isTemplateType(r.template_type)) return null;
	if (typeof r.reviewer_id !== 'string') return null;
	if (!isReviewStatus(r.status)) return null;
	if (typeof r.updated_at !== 'string') return null;
	const reviewerName =
		typeof r.reviewer_name === 'string' && r.reviewer_name.length > 0 ? r.reviewer_name : null;
	return {
		templateId: r.template_id,
		templateType: r.template_type,
		reviewerId: r.reviewer_id,
		reviewerName,
		status: r.status,
		note: typeof r.note === 'string' ? r.note : null,
		updatedAt: r.updated_at
	};
}

export const load: PageServerLoad = async ({ url, locals }) => {
	// Defense in depth: layout guard runs in parallel, but loads still execute,
	// so re-check admin here before issuing service-role queries.
	await requireAdmin(locals.supabase, locals.user?.id, url.pathname + url.search);
	const userId = locals.user?.id;
	if (!userId) throw error(401, 'Not authenticated');

	const typeFilter = parseTypeFilter(url.searchParams.get('type'));
	const caseFilterRaw = url.searchParams.get('case') ?? 'all';
	const caseFilter = caseFilterRaw === 'all' || isCase(caseFilterRaw) ? caseFilterRaw : 'all';
	const diffFilterRaw = url.searchParams.get('difficulty') ?? 'all';
	const diffFilter = diffFilterRaw === 'all' || isDifficulty(diffFilterRaw) ? diffFilterRaw : 'all';
	const reviewFilter = parseReviewFilter(url.searchParams.get('review'));

	const adminClient = createAdminWriteClient();

	// Fetch reviews + reviewer profiles in two queries (template_reviews.reviewer_id
	// FK targets auth.users; PostgREST cannot traverse to public.profiles in a
	// single select, so we resolve display_names with a follow-up query).
	const { data: reviewsRaw, error: reviewsError } = await adminClient
		.from('template_reviews')
		.select('template_id, template_type, reviewer_id, status, note, updated_at');

	if (reviewsError) {
		console.error('Failed to load template reviews:', reviewsError);
		throw error(500, 'Failed to load template reviews');
	}

	const reviewerIds = new Set<string>();
	if (Array.isArray(reviewsRaw)) {
		for (const raw of reviewsRaw) {
			if (typeof raw === 'object' && raw !== null) {
				const r = raw as Record<string, unknown>;
				if (typeof r.reviewer_id === 'string') reviewerIds.add(r.reviewer_id);
			}
		}
	}

	const reviewerNames = new Map<string, string>();
	if (reviewerIds.size > 0) {
		const { data: profilesRaw, error: profilesError } = await adminClient
			.from('profiles')
			.select('id, display_name')
			.in('id', [...reviewerIds]);
		if (profilesError) {
			console.error('Failed to load reviewer profiles:', profilesError);
		} else if (Array.isArray(profilesRaw)) {
			for (const raw of profilesRaw) {
				if (typeof raw === 'object' && raw !== null) {
					const r = raw as Record<string, unknown>;
					if (typeof r.id === 'string' && typeof r.display_name === 'string') {
						reviewerNames.set(r.id, r.display_name);
					}
				}
			}
		}
	}

	const allReviews: ReviewRow[] = [];
	if (Array.isArray(reviewsRaw)) {
		for (const raw of reviewsRaw) {
			if (typeof raw === 'object' && raw !== null) {
				const r = raw as Record<string, unknown>;
				const reviewerName =
					typeof r.reviewer_id === 'string' ? (reviewerNames.get(r.reviewer_id) ?? null) : null;
				const parsed = parseRow({ ...r, reviewer_name: reviewerName });
				if (parsed) allReviews.push(parsed);
			}
		}
	}

	const reviewsByTemplate = new Map<string, ReviewRow[]>();
	for (const r of allReviews) {
		const key = `${r.templateType}:${r.templateId}`;
		const arr = reviewsByTemplate.get(key);
		if (arr) arr.push(r);
		else reviewsByTemplate.set(key, [r]);
	}

	// Per-template lemma blocks across all reviewers. Used to render struck-out
	// chips on the dashboard (and to count templates with at least one block).
	// We keep two maps: union (for the chip "blocked by someone" state) and
	// per-current-user (for the chip "blocked by me" state).
	//
	// Mirrors the bake script behavior: only honor blocks from reviewers who
	// are *currently* admins, so the dashboard count matches what
	// `pnpm audit:bake-blocks` will produce.
	const [{ data: blocksRaw, error: blocksError }, { data: adminsRaw, error: adminsError }] =
		await Promise.all([
			adminClient
				.from('template_lemma_blocks')
				.select('template_id, template_type, lemma, reviewer_id'),
			adminClient.from('profiles').select('id').eq('is_admin', true)
		]);

	if (blocksError) {
		console.error('Failed to load template lemma blocks:', blocksError);
		throw error(500, 'Failed to load template lemma blocks');
	}
	if (adminsError) {
		console.error('Failed to load admin reviewer ids:', adminsError);
		throw error(500, 'Failed to load admin reviewer ids');
	}

	const currentAdminIds = new Set<string>();
	if (Array.isArray(adminsRaw)) {
		for (const raw of adminsRaw) {
			if (typeof raw !== 'object' || raw === null) continue;
			const r = raw as Record<string, unknown>;
			if (typeof r.id === 'string') currentAdminIds.add(r.id);
		}
	}

	const blockedLemmasByTemplate = new Map<string, Set<string>>();
	const myBlockedLemmasByTemplate = new Map<string, Set<string>>();
	// Set of `${type}:${id}:${lemma}` triples for the pending-bake diff.
	const liveBlocks = new Set<string>();
	if (Array.isArray(blocksRaw)) {
		for (const raw of blocksRaw) {
			if (typeof raw !== 'object' || raw === null) continue;
			const r = raw as Record<string, unknown>;
			if (typeof r.template_id !== 'string') continue;
			if (!isTemplateType(r.template_type)) continue;
			if (typeof r.lemma !== 'string') continue;
			if (typeof r.reviewer_id !== 'string') continue;
			if (!currentAdminIds.has(r.reviewer_id)) continue;
			const key = `${r.template_type}:${r.template_id}`;
			const all = blockedLemmasByTemplate.get(key);
			if (all) all.add(r.lemma);
			else blockedLemmasByTemplate.set(key, new Set([r.lemma]));
			if (r.reviewer_id === userId) {
				const mine = myBlockedLemmasByTemplate.get(key);
				if (mine) mine.add(r.lemma);
				else myBlockedLemmasByTemplate.set(key, new Set([r.lemma]));
			}
			liveBlocks.add(`${r.template_type}:${r.template_id}:${r.lemma}`);
		}
	}

	// Compare live (DB) blocks vs the baked JSON snapshot the drill engine
	// reads. Counts on each side reveal pending adds (in DB, not in JSON =
	// will appear after `pnpm audit:bake-blocks`) and pending removes (in
	// JSON, not in DB = a reviewer cleared their block but the bake hasn't
	// been re-run yet).
	const bakedSnapshot: Record<
		'sentence' | 'adjective' | 'pronoun',
		Record<string, string[]>
	> = lemmaBlocksData;
	const bakedBlocks = new Set<string>();
	for (const type of ['sentence', 'adjective', 'pronoun'] as const) {
		const bucket = bakedSnapshot[type];
		for (const templateId of Object.keys(bucket)) {
			for (const lemma of bucket[templateId]) {
				bakedBlocks.add(`${type}:${templateId}:${lemma}`);
			}
		}
	}
	let pendingAdds = 0;
	for (const k of liveBlocks) if (!bakedBlocks.has(k)) pendingAdds += 1;
	let pendingRemoves = 0;
	for (const k of bakedBlocks) if (!liveBlocks.has(k)) pendingRemoves += 1;

	const allTemplates = getAllRenderedTemplates();
	const totals = {
		all: allTemplates.length,
		shown: 0,
		unreviewedByMe: 0,
		flaggedByAnyone: 0,
		noCandidates: 0,
		withBlockedLemmas: 0
	};

	const rows: TemplateRowVm[] = [];
	for (const template of allTemplates) {
		const key = `${template.type}:${template.id}`;
		const reviews = reviewsByTemplate.get(key) ?? [];
		const myReview = reviews.find((r) => r.reviewerId === userId) ?? null;
		const otherReviews = reviews.filter((r) => r.reviewerId !== userId);
		const blockedLemmasSet = blockedLemmasByTemplate.get(key);
		const myBlockedLemmasSet = myBlockedLemmasByTemplate.get(key);
		const blockedLemmas = blockedLemmasSet
			? [...blockedLemmasSet].sort((a, b) => a.localeCompare(b))
			: [];
		const myBlockedLemmas = myBlockedLemmasSet
			? [...myBlockedLemmasSet].sort((a, b) => a.localeCompare(b))
			: [];

		const flagged = reviews.some((r) => r.status === 'needs_fix' || r.status === 'wrong');
		if (!myReview) totals.unreviewedByMe += 1;
		if (flagged) totals.flaggedByAnyone += 1;
		if (template.candidates.length === 0) totals.noCandidates += 1;
		if (blockedLemmas.length > 0) totals.withBlockedLemmas += 1;

		// Apply filters.
		if (typeFilter !== 'all' && template.type !== typeFilter) continue;
		if (caseFilter !== 'all' && template.requiredCase !== caseFilter) continue;
		if (diffFilter !== 'all' && template.difficulty !== diffFilter) continue;

		if (reviewFilter === 'unreviewed_by_me' && myReview) continue;
		if (reviewFilter === 'reviewed_by_me' && !myReview) continue;
		if (reviewFilter === 'flagged_by_anyone' && !flagged) continue;
		if (reviewFilter === 'no_candidates' && template.candidates.length > 0) continue;
		if (reviewFilter === 'has_blocked_lemmas' && blockedLemmas.length === 0) continue;

		rows.push({
			template,
			myReview: myReview ? { status: myReview.status, note: myReview.note } : null,
			otherReviews,
			myBlockedLemmas,
			blockedLemmas,
			flagged
		});
	}

	totals.shown = rows.length;

	// Bucket filtered rows by semantic-match group key. Sort templates within
	// each group by case → number → difficulty so a reviewer scanning a single
	// category reads top-to-bottom in a predictable order.
	const groupsMap = new Map<string, GroupVm>();
	for (const row of rows) {
		const { key, label } = getGroupKey(row.template);
		let g = groupsMap.get(key);
		if (!g) {
			g = {
				key,
				label,
				type: row.template.type,
				templates: [],
				counts: {
					total: 0,
					unreviewedByMe: 0,
					flagged: 0,
					noCandidates: 0,
					withBlockedLemmas: 0
				}
			};
			groupsMap.set(key, g);
		}
		g.templates.push(row);
		g.counts.total += 1;
		if (!row.myReview) g.counts.unreviewedByMe += 1;
		if (row.flagged) g.counts.flagged += 1;
		if (row.template.candidates.length === 0) g.counts.noCandidates += 1;
		if (row.blockedLemmas.length > 0) g.counts.withBlockedLemmas += 1;
	}

	for (const g of groupsMap.values()) {
		g.templates.sort((a, b) => {
			const ac = CASE_ORDER[a.template.requiredCase] - CASE_ORDER[b.template.requiredCase];
			if (ac !== 0) return ac;
			const an = NUMBER_ORDER[a.template.number] - NUMBER_ORDER[b.template.number];
			if (an !== 0) return an;
			const ad = DIFFICULTY_ORDER[a.template.difficulty] - DIFFICULTY_ORDER[b.template.difficulty];
			if (ad !== 0) return ad;
			return a.template.id.localeCompare(b.template.id);
		});
	}

	// Group sort: type first (sentence → adjective → pronoun), then groups with
	// outstanding work float up (unreviewed > flagged > no-candidates > done),
	// then alphabetical by label for determinism.
	const groups = [...groupsMap.values()].sort((a, b) => {
		const at = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
		if (at !== 0) return at;
		const aHasWork = a.counts.unreviewedByMe > 0 ? 0 : 1;
		const bHasWork = b.counts.unreviewedByMe > 0 ? 0 : 1;
		if (aHasWork !== bHasWork) return aHasWork - bHasWork;
		const aFlag = a.counts.flagged > 0 ? 0 : 1;
		const bFlag = b.counts.flagged > 0 ? 0 : 1;
		if (aFlag !== bFlag) return aFlag - bFlag;
		return a.label.localeCompare(b.label);
	});

	const vm: PageVm = {
		groups,
		totals,
		filters: {
			type: typeFilter,
			case: caseFilter,
			difficulty: diffFilter,
			review: reviewFilter
		},
		currentReviewerId: userId,
		bakeStatus: {
			liveCount: liveBlocks.size,
			bakedCount: bakedBlocks.size,
			pendingAdds,
			pendingRemoves
		}
	};

	return vm;
};
