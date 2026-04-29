// Shared between +page.server.ts and +page.svelte. Cannot live in
// +page.server.ts because SvelteKit forbids importing runtime values from
// `.server.ts` modules into client components.

export const REPORT_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
const REPORT_STATUS_SET: ReadonlySet<string> = new Set(REPORT_STATUSES);

export const REPORT_CATEGORIES = [
	'wrong_answer',
	'bad_sentence',
	'bad_explanation',
	'other'
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
const REPORT_CATEGORY_SET: ReadonlySet<string> = new Set(REPORT_CATEGORIES);

export interface ReportRow {
	id: string;
	user_id: string | null;
	category: ReportCategory;
	status: ReportStatus;
	comment: string | null;
	drill_type: string | null;
	lemma: string | null;
	case_name: string | null;
	number_form: string | null;
	expected_answer: string | null;
	user_answer: string | null;
	sentence: string | null;
	explanation: string | null;
	context: unknown;
	user_agent: string | null;
	page_url: string | null;
	admin_note: string | null;
	resolved_at: string | null;
	resolved_by: string | null;
	created_at: string;
}

export interface ReportSummary {
	total: number;
	byStatus: Record<ReportStatus, number>;
}

export function isReportStatus(value: unknown): value is ReportStatus {
	return typeof value === 'string' && REPORT_STATUS_SET.has(value);
}

export function isReportCategory(value: unknown): value is ReportCategory {
	return typeof value === 'string' && REPORT_CATEGORY_SET.has(value);
}
