// POST /api/admin/template-lemma-blocks — admin-only block of a (template, lemma)
// pair. Expected JSON body:
//   { template_id, template_type, lemma, reason? }
// Upserts one row per (template_id, template_type, lemma, reviewer_id).
//
// DELETE /api/admin/template-lemma-blocks?template_id=…&template_type=…&lemma=…
// clears the block for the current reviewer. Query params instead of a JSON
// body because some HTTP intermediaries strip DELETE bodies.
//
// The drill engine doesn't read this table directly — `pnpm audit:bake-blocks`
// snapshots it into src/lib/data/lemma_blocks.json which gets committed and
// shipped. The dashboard mutates this table for the next bake to pick up.
import { json, error } from '@sveltejs/kit';
import { isAdmin, createAdminWriteClient } from '$lib/server/admin';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = ['sentence', 'adjective', 'pronoun'] as const;
type TemplateType = (typeof ALLOWED_TYPES)[number];
const ALLOWED_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_TYPES);
const MAX_REASON = 1000;
const MAX_TEMPLATE_ID = 200;
const MAX_LEMMA = 200;

function isType(value: unknown): value is TemplateType {
	return typeof value === 'string' && ALLOWED_TYPE_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ParsedKey {
	templateId: string;
	templateType: TemplateType;
	lemma: string;
}

function parseKey(input: {
	template_id: unknown;
	template_type: unknown;
	lemma: unknown;
}): ParsedKey | { errorMessage: string } {
	const templateId = input.template_id;
	if (typeof templateId !== 'string' || templateId.length === 0) {
		return { errorMessage: 'template_id is required' };
	}
	if (templateId.length > MAX_TEMPLATE_ID) {
		return { errorMessage: 'template_id is too long' };
	}
	const templateType = input.template_type;
	if (!isType(templateType)) {
		return { errorMessage: 'Invalid template_type' };
	}
	const lemma = input.lemma;
	if (typeof lemma !== 'string' || lemma.length === 0) {
		return { errorMessage: 'lemma is required' };
	}
	if (lemma.length > MAX_LEMMA) {
		return { errorMessage: 'lemma is too long' };
	}
	return { templateId, templateType, lemma };
}

function isParsedKey(value: ParsedKey | { errorMessage: string }): value is ParsedKey {
	return !('errorMessage' in value);
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

	const parsed = parseKey({
		template_id: body.template_id,
		template_type: body.template_type,
		lemma: body.lemma
	});
	if (!isParsedKey(parsed)) {
		return json({ error: parsed.errorMessage }, { status: 400 });
	}

	let reason: string | null = null;
	if (body.reason !== undefined && body.reason !== null && body.reason !== '') {
		if (typeof body.reason !== 'string') {
			return json({ error: 'reason must be a string' }, { status: 400 });
		}
		if (body.reason.length > MAX_REASON) {
			return json({ error: `reason exceeds max length ${MAX_REASON}` }, { status: 400 });
		}
		reason = body.reason;
	}

	const adminClient = createAdminWriteClient();

	const { error: upsertError } = await adminClient.from('template_lemma_blocks').upsert(
		{
			template_id: parsed.templateId,
			template_type: parsed.templateType,
			lemma: parsed.lemma,
			reviewer_id: userId,
			reason
		},
		{ onConflict: 'template_id,template_type,lemma,reviewer_id' }
	);

	if (upsertError) {
		console.error('template_lemma_blocks upsert failed:', upsertError);
		return json({ error: 'Failed to save block' }, { status: 500 });
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	const userId = locals.user?.id;
	if (!userId) throw error(401, 'Not authenticated');

	const ok = await isAdmin(locals.supabase, userId);
	if (!ok) throw error(403, 'Forbidden');

	const parsed = parseKey({
		template_id: url.searchParams.get('template_id'),
		template_type: url.searchParams.get('template_type'),
		lemma: url.searchParams.get('lemma')
	});
	if (!isParsedKey(parsed)) {
		return json({ error: parsed.errorMessage }, { status: 400 });
	}

	const adminClient = createAdminWriteClient();

	const { error: deleteError } = await adminClient
		.from('template_lemma_blocks')
		.delete()
		.eq('template_id', parsed.templateId)
		.eq('template_type', parsed.templateType)
		.eq('lemma', parsed.lemma)
		.eq('reviewer_id', userId);

	if (deleteError) {
		console.error('template_lemma_blocks delete failed:', deleteError);
		return json({ error: 'Failed to clear block' }, { status: 500 });
	}

	return json({ success: true, cleared: true });
};
