// PATCH /api/admin/reports/[id] — admin-only update for content_reports.
// Lets the dashboard set status / admin_note. Auth is enforced by checking
// profiles.is_admin on the requester before performing the service-role write
// (content_reports has no client RLS policies, so non-admin users could not
// reach this row even directly).
import { json, error } from '@sveltejs/kit';
import { isAdmin, createAdminWriteClient } from '$lib/server/admin';
import type { RequestHandler } from './$types';

const ALLOWED_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;
type Status = (typeof ALLOWED_STATUSES)[number];
const ALLOWED_STATUS_SET: ReadonlySet<string> = new Set(ALLOWED_STATUSES);

const MAX_ADMIN_NOTE = 4000;

function isStatus(value: unknown): value is Status {
	return typeof value === 'string' && ALLOWED_STATUS_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) throw error(401, 'Not authenticated');

	const ok = await isAdmin(locals.supabase, userId);
	if (!ok) throw error(403, 'Forbidden');

	const id = params.id;
	if (!id) throw error(400, 'Missing report id');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!isRecord(body)) {
		return json({ error: 'Body must be a JSON object' }, { status: 400 });
	}

	const update: Record<string, unknown> = {};
	if (body.status !== undefined) {
		if (!isStatus(body.status)) {
			return json({ error: 'Invalid status' }, { status: 400 });
		}
		update.status = body.status;
		if (body.status === 'resolved' || body.status === 'dismissed') {
			update.resolved_at = new Date().toISOString();
			update.resolved_by = userId;
		} else {
			update.resolved_at = null;
			update.resolved_by = null;
		}
	}

	if (body.admin_note !== undefined) {
		if (body.admin_note === null || body.admin_note === '') {
			update.admin_note = null;
		} else if (typeof body.admin_note !== 'string') {
			return json({ error: 'admin_note must be a string' }, { status: 400 });
		} else if (body.admin_note.length > MAX_ADMIN_NOTE) {
			return json({ error: `admin_note exceeds max length ${MAX_ADMIN_NOTE}` }, { status: 400 });
		} else {
			update.admin_note = body.admin_note;
		}
	}

	if (Object.keys(update).length === 0) {
		return json({ error: 'No allowed fields to update' }, { status: 400 });
	}

	const adminClient = createAdminWriteClient();
	const { error: updateError } = await adminClient
		.from('content_reports')
		.update(update)
		.eq('id', id);

	if (updateError) {
		console.error('admin reports PATCH failed:', updateError);
		return json({ error: 'Failed to update report' }, { status: 500 });
	}

	return json({ success: true });
};
