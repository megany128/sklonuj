import { error } from '@sveltejs/kit';
import { createAdminWriteClient, requireAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import {
	REPORT_STATUSES,
	REPORT_CATEGORIES,
	isReportStatus,
	isReportCategory,
	type ReportCategory,
	type ReportRow,
	type ReportStatus,
	type ReportSummary
} from './types';

function parseStatusFilter(value: string | null): ReportStatus | 'all' {
	if (value === 'all') return 'all';
	if (value !== null && isReportStatus(value)) return value;
	return 'open';
}

function parseCategoryFilter(value: string | null): ReportCategory | 'all' {
	if (value === null || value === 'all') return 'all';
	if (isReportCategory(value)) return value;
	return 'all';
}

/**
 * Escape PostgREST `ilike` wildcards (% and _) so user input is treated as a
 * literal substring. Without this, `lemma=%` matches everything and `a_b`
 * matches `acb`/`a-b`/etc. Backslashes are also escaped so `\%` stays literal.
 */
function escapeIlikePattern(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function parseRow(raw: unknown): ReportRow | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.id !== 'string') return null;
	if (!isReportCategory(r.category)) return null;
	const status = isReportStatus(r.status) ? r.status : 'open';
	if (typeof r.created_at !== 'string') return null;
	function str(v: unknown): string | null {
		return typeof v === 'string' ? v : null;
	}
	return {
		id: r.id,
		user_id: str(r.user_id),
		category: r.category,
		status,
		comment: str(r.comment),
		drill_type: str(r.drill_type),
		lemma: str(r.lemma),
		case_name: str(r.case_name),
		number_form: str(r.number_form),
		expected_answer: str(r.expected_answer),
		user_answer: str(r.user_answer),
		sentence: str(r.sentence),
		explanation: str(r.explanation),
		context: r.context ?? null,
		user_agent: str(r.user_agent),
		page_url: str(r.page_url),
		admin_note: str(r.admin_note),
		resolved_at: str(r.resolved_at),
		resolved_by: str(r.resolved_by),
		created_at: r.created_at
	};
}

export const load: PageServerLoad = async ({ url, locals }) => {
	// Defense in depth: layout guard runs in parallel, but loads still execute,
	// so re-check admin here before issuing service-role queries.
	await requireAdmin(locals.supabase, locals.user?.id, url.pathname + url.search);

	const status = parseStatusFilter(url.searchParams.get('status'));
	const category = parseCategoryFilter(url.searchParams.get('category'));
	const lemmaFilter = url.searchParams.get('lemma')?.trim() ?? '';

	const client = createAdminWriteClient();

	let listQuery = client
		.from('content_reports')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(200);

	if (status !== 'all') listQuery = listQuery.eq('status', status);
	if (category !== 'all') listQuery = listQuery.eq('category', category);
	if (lemmaFilter) listQuery = listQuery.ilike('lemma', `%${escapeIlikePattern(lemmaFilter)}%`);

	const { data: rawList, error: listError } = await listQuery;
	if (listError) {
		console.error('admin reports load failed:', listError);
		throw error(500, 'Failed to load reports');
	}

	const reports: ReportRow[] = [];
	if (Array.isArray(rawList)) {
		for (const raw of rawList) {
			const parsed = parseRow(raw);
			if (parsed) reports.push(parsed);
		}
	}

	// Aggregate counts via parallel HEAD queries — Supabase returns the row
	// count in the response header without streaming all the rows. Avoids the
	// "select * just to count" anti-pattern.
	const totalQuery = client.from('content_reports').select('*', { count: 'exact', head: true });
	const statusCountQueries = REPORT_STATUSES.map((s) =>
		client.from('content_reports').select('*', { count: 'exact', head: true }).eq('status', s)
	);
	const [totalResult, ...statusResults] = await Promise.all([totalQuery, ...statusCountQueries]);

	const summary: ReportSummary = {
		total: 0,
		byStatus: { open: 0, in_progress: 0, resolved: 0, dismissed: 0 }
	};
	if (totalResult.error) {
		console.error('admin reports total count failed:', totalResult.error);
	} else {
		summary.total = totalResult.count ?? 0;
	}
	for (let i = 0; i < REPORT_STATUSES.length; i++) {
		const s = REPORT_STATUSES[i];
		const result = statusResults[i];
		if (result.error) {
			console.error(`admin reports ${s} count failed:`, result.error);
			continue;
		}
		summary.byStatus[s] = result.count ?? 0;
	}

	return {
		reports,
		summary,
		filters: { status, category, lemma: lemmaFilter },
		options: {
			statuses: REPORT_STATUSES,
			categories: REPORT_CATEGORIES
		}
	};
};
