import { error } from '@sveltejs/kit';
import { createAdminWriteClient, requireAdmin } from '$lib/server/admin';
import { getAllRenderedTemplates } from '$lib/server/template-review';
import type { Case, Difficulty } from '$lib/types';
import type { PageServerLoad } from './$types';
import {
	TEMPLATE_TYPE_FILTERS,
	REVIEW_FILTER_VALUES,
	type PageVm,
	type ReviewFilter,
	type ReviewRow,
	type TemplateRowVm,
	isReviewStatus,
	isTemplateType
} from './types';

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

	const allTemplates = getAllRenderedTemplates();
	const totals = {
		all: allTemplates.length,
		shown: 0,
		unreviewedByMe: 0,
		flaggedByAnyone: 0,
		noCandidates: 0
	};

	const rows: TemplateRowVm[] = [];
	for (const template of allTemplates) {
		const key = `${template.type}:${template.id}`;
		const reviews = reviewsByTemplate.get(key) ?? [];
		const myReview = reviews.find((r) => r.reviewerId === userId) ?? null;
		const otherReviews = reviews.filter((r) => r.reviewerId !== userId);

		const flagged = reviews.some((r) => r.status === 'needs_fix' || r.status === 'wrong');
		if (!myReview) totals.unreviewedByMe += 1;
		if (flagged) totals.flaggedByAnyone += 1;
		if (template.candidateCount === 0) totals.noCandidates += 1;

		// Apply filters.
		if (typeFilter !== 'all' && template.type !== typeFilter) continue;
		if (caseFilter !== 'all' && template.requiredCase !== caseFilter) continue;
		if (diffFilter !== 'all' && template.difficulty !== diffFilter) continue;

		if (reviewFilter === 'unreviewed_by_me' && myReview) continue;
		if (reviewFilter === 'reviewed_by_me' && !myReview) continue;
		if (reviewFilter === 'flagged_by_anyone' && !flagged) continue;
		if (reviewFilter === 'no_candidates' && template.candidateCount > 0) continue;

		rows.push({
			template,
			myReview: myReview ? { status: myReview.status, note: myReview.note } : null,
			otherReviews
		});
	}

	totals.shown = rows.length;

	const vm: PageVm = {
		rows,
		totals,
		filters: {
			type: typeFilter,
			case: caseFilter,
			difficulty: diffFilter,
			review: reviewFilter
		},
		currentReviewerId: userId
	};

	return vm;
};
