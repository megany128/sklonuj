// Shared between +page.server.ts and +page.svelte.

import type { RenderedTemplate, ReviewStatus, TemplateType } from '$lib/server/template-review';

export type { RenderedTemplate, ReviewStatus, TemplateType };

export const REVIEW_STATUSES = ['ok', 'needs_fix', 'wrong'] as const;
export const TEMPLATE_TYPES = ['sentence', 'adjective', 'pronoun'] as const;
export const TEMPLATE_TYPE_FILTERS = ['all', 'sentence', 'adjective', 'pronoun'] as const;
export const REVIEW_FILTER_VALUES = [
	'all',
	'unreviewed_by_me',
	'reviewed_by_me',
	'flagged_by_anyone',
	'no_candidates'
] as const;
export type ReviewFilter = (typeof REVIEW_FILTER_VALUES)[number];

export interface ReviewerSummary {
	id: string;
	displayName: string | null;
}

export interface ReviewRow {
	templateId: string;
	templateType: TemplateType;
	reviewerId: string;
	reviewerName: string | null;
	status: ReviewStatus;
	note: string | null;
	updatedAt: string;
}

export interface TemplateRowVm {
	template: RenderedTemplate;
	myReview: { status: ReviewStatus; note: string | null } | null;
	otherReviews: ReviewRow[];
}

export interface PageVm {
	rows: TemplateRowVm[];
	totals: {
		all: number;
		shown: number;
		unreviewedByMe: number;
		flaggedByAnyone: number;
		noCandidates: number;
	};
	filters: {
		type: (typeof TEMPLATE_TYPE_FILTERS)[number];
		case: string;
		difficulty: string;
		review: ReviewFilter;
	};
	currentReviewerId: string;
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
	ok: 'OK',
	needs_fix: 'Needs fix',
	wrong: 'Wrong'
};

export const REVIEW_STATUS_BADGE: Record<ReviewStatus, string> = {
	ok: 'bg-positive-background text-positive-stroke',
	needs_fix: 'bg-warning-background text-warning-text',
	wrong: 'bg-negative-background text-negative-stroke'
};

export function isReviewStatus(value: unknown): value is ReviewStatus {
	return value === 'ok' || value === 'needs_fix' || value === 'wrong';
}

export function isTemplateType(value: unknown): value is TemplateType {
	return value === 'sentence' || value === 'adjective' || value === 'pronoun';
}
