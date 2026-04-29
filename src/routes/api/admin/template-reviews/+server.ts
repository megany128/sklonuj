// POST /api/admin/template-reviews — admin-only upsert/delete of a template
// review. Expected payload:
//   { template_id, template_type, status: 'ok'|'needs_fix'|'wrong'|null, note? }
// status === null clears the review for the current user.
import { json, error } from '@sveltejs/kit';
import { isAdmin, createAdminWriteClient } from '$lib/server/admin';
import type { RequestHandler } from './$types';

const ALLOWED_STATUSES = ['ok', 'needs_fix', 'wrong'] as const;
type Status = (typeof ALLOWED_STATUSES)[number];
const ALLOWED_STATUS_SET: ReadonlySet<string> = new Set(ALLOWED_STATUSES);
const ALLOWED_TYPES = ['sentence', 'adjective', 'pronoun'] as const;
type TemplateType = (typeof ALLOWED_TYPES)[number];
const ALLOWED_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_TYPES);
const MAX_NOTE = 4000;
const MAX_TEMPLATE_ID = 200;

function isStatus(value: unknown): value is Status {
	return typeof value === 'string' && ALLOWED_STATUS_SET.has(value);
}

function isType(value: unknown): value is TemplateType {
	return typeof value === 'string' && ALLOWED_TYPE_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) throw error(401, 'Not authenticated');

	const ok = await isAdmin(locals.supabase, userId);
	if (!ok) throw error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!isRecord(body)) {
		return json({ error: 'Body must be a JSON object' }, { status: 400 });
	}

	const templateId = body.template_id;
	if (typeof templateId !== 'string' || templateId.length === 0) {
		return json({ error: 'template_id is required' }, { status: 400 });
	}
	if (templateId.length > MAX_TEMPLATE_ID) {
		return json({ error: 'template_id is too long' }, { status: 400 });
	}

	const templateType = body.template_type;
	if (!isType(templateType)) {
		return json({ error: 'Invalid template_type' }, { status: 400 });
	}

	const adminClient = createAdminWriteClient();

	// status === null → delete the row (clear review).
	if (body.status === null) {
		const { error: deleteError } = await adminClient
			.from('template_reviews')
			.delete()
			.eq('template_id', templateId)
			.eq('template_type', templateType)
			.eq('reviewer_id', userId);
		if (deleteError) {
			console.error('template_reviews delete failed:', deleteError);
			return json({ error: 'Failed to clear review' }, { status: 500 });
		}
		return json({ success: true, cleared: true });
	}

	if (!isStatus(body.status)) {
		return json({ error: 'Invalid status' }, { status: 400 });
	}

	let note: string | null = null;
	if (body.note !== undefined && body.note !== null && body.note !== '') {
		if (typeof body.note !== 'string') {
			return json({ error: 'note must be a string' }, { status: 400 });
		}
		if (body.note.length > MAX_NOTE) {
			return json({ error: `note exceeds max length ${MAX_NOTE}` }, { status: 400 });
		}
		note = body.note;
	}

	const { error: upsertError } = await adminClient.from('template_reviews').upsert(
		{
			template_id: templateId,
			template_type: templateType,
			reviewer_id: userId,
			status: body.status,
			note,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'template_id,template_type,reviewer_id' }
	);

	if (upsertError) {
		console.error('template_reviews upsert failed:', upsertError);
		return json({ error: 'Failed to save review' }, { status: 500 });
	}

	return json({ success: true });
};
