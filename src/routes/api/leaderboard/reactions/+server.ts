import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the Monday of the current week as a YYYY-MM-DD string. */
function getCurrentWeekMonday(): string {
	const now = new Date();
	const day = now.getDay(); // 0=Sun, 1=Mon, ...
	const diff = day === 0 ? 6 : day - 1;
	const monday = new Date(now);
	monday.setDate(now.getDate() - diff);
	const y = monday.getFullYear();
	const m = String(monday.getMonth() + 1).padStart(2, '0');
	const d = String(monday.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

const VALID_EMOJIS = new Set(['\u{1F525}', '\u{1F44F}']); // fire, clap

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const origin = request.headers.get('origin');
	if (!origin || origin !== url.origin) {
		return json({ error: 'Forbidden: origin mismatch' }, { status: 403 });
	}

	const contentType = request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = JSON.parse(await request.text());
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	if (!isRecord(body)) {
		return json({ error: 'Request body must be a JSON object' }, { status: 400 });
	}

	const classId = body['classId'];
	const toUserId = body['toUserId'];
	const emoji = body['emoji'];

	if (typeof classId !== 'string' || classId.length === 0) {
		return json({ error: 'classId is required' }, { status: 400 });
	}
	if (typeof toUserId !== 'string' || toUserId.length === 0) {
		return json({ error: 'toUserId is required' }, { status: 400 });
	}
	if (typeof emoji !== 'string' || !VALID_EMOJIS.has(emoji)) {
		return json({ error: 'emoji must be one of: fire, clap' }, { status: 400 });
	}
	if (toUserId === user.id) {
		return json({ error: 'You cannot send a reaction to yourself' }, { status: 400 });
	}

	const supabase = locals.supabase;

	// Verify sender is in the class
	const { data: senderMembership } = await supabase
		.from('class_memberships')
		.select('id')
		.eq('class_id', classId)
		.eq('student_id', user.id)
		.maybeSingle();

	// Also check if sender is the teacher
	const { data: classData } = await supabase
		.from('classes')
		.select('teacher_id')
		.eq('id', classId)
		.single();

	const isTeacher =
		isRecord(classData) &&
		typeof classData.teacher_id === 'string' &&
		classData.teacher_id === user.id;

	if (!senderMembership && !isTeacher) {
		return json({ error: 'You are not a member of this class' }, { status: 403 });
	}

	// Verify recipient is in the class
	const { data: recipientMembership } = await supabase
		.from('class_memberships')
		.select('id')
		.eq('class_id', classId)
		.eq('student_id', toUserId)
		.maybeSingle();

	if (!recipientMembership) {
		return json({ error: 'Recipient is not a member of this class' }, { status: 400 });
	}

	const weekMonday = getCurrentWeekMonday();
	const today = new Date().toISOString().slice(0, 10);

	// Check if already sent today to this person
	const { data: existingReaction } = await supabase
		.from('leaderboard_reactions')
		.select('id')
		.eq('class_id', classId)
		.eq('from_user_id', user.id)
		.eq('to_user_id', toUserId)
		.eq('sent_date', today)
		.maybeSingle();

	if (existingReaction) {
		return json(
			{ error: 'You have already sent a reaction to this person today' },
			{ status: 409 }
		);
	}

	// Insert the reaction
	const { error: insertError } = await supabase.from('leaderboard_reactions').insert({
		class_id: classId,
		from_user_id: user.id,
		to_user_id: toUserId,
		emoji,
		week_start: weekMonday,
		sent_date: today
	});

	if (insertError) {
		return json({ error: 'Failed to send reaction' }, { status: 500 });
	}

	return json({ success: true });
};
