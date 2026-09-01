/**
 * Assignment reminder cron endpoint.
 *
 * Invoked by `.github/workflows/cron.yml` on a schedule of every 6 hours
 * (at 00:00, 06:00, 12:00, and 18:00 UTC).
 *
 * Authentication is performed via an `Authorization: Bearer $CRON_SECRET`
 * header; requests without a matching secret are rejected with 401.
 *
 * The endpoint sends two classes of reminders:
 *   1. 3-day reminders — assignments due in > 24h and <= 3 days, gated by
 *      `assignments.reminder_3day_sent`.
 *   2. 1-day reminders — assignments due in >= now and <= 24h, gated by
 *      `assignments.reminder_sent`.
 *
 * Coalescing: within a single run, an assignment can only match one of the
 * two windows because the `due_date` filters are disjoint, so no student
 * will receive both a 3-day and a 1-day reminder for the same assignment
 * in the same invocation. Across runs, an assignment that was reminded at
 * the 3-day mark will later cross into the 1-day window and trigger a
 * separate 1-day reminder — that is the intended sequential behavior, and
 * the per-assignment `reminder_3day_sent` / `reminder_sent` flags ensure
 * each reminder type is sent at most once per assignment.
 *
 * Query shape: all supporting data (classes, memberships, assignment
 * progress, opted-in profiles, auth emails) is fetched ONCE for every due
 * assignment across both windows and grouped in memory, so the run costs a
 * constant number of table round trips plus one auth lookup per recipient
 * (bounded concurrency) — not a fresh fan-out per assignment.
 */
import { json } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { chunk, resolveUserEmails } from '$lib/server/auth-users';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord);
}

/** Keep `.in()` filter lists comfortably under PostgREST URL length limits. */
const IN_FILTER_CHUNK = 200;

interface ValidAssignment {
	id: string;
	title: string;
	class_id: string;
}

function toValidAssignments(data: unknown): ValidAssignment[] {
	const raw = toRecordArray(data);
	return raw.filter(
		(a): a is Record<string, unknown> & ValidAssignment =>
			typeof a.id === 'string' && typeof a.title === 'string' && typeof a.class_id === 'string'
	);
}

class BatchQueryError extends Error {
	constructor(
		public readonly table: string,
		cause: unknown
	) {
		super(`Failed to query ${table}`);
		this.cause = cause;
	}
}

/**
 * Fetch `id, name` for every class id in one pass (chunked `.in()`).
 * Returns `classId -> name`.
 */
async function fetchClassNames(
	adminClient: SupabaseClient,
	classIds: readonly string[]
): Promise<Map<string, string>> {
	const nameById = new Map<string, string>();
	for (const ids of chunk(classIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient.from('classes').select('id, name').in('id', ids);
		if (error) throw new BatchQueryError('classes', error);
		for (const c of toRecordArray(data)) {
			if (typeof c.id === 'string' && typeof c.name === 'string') {
				nameById.set(c.id, c.name);
			}
		}
	}
	return nameById;
}

/**
 * Resolve, for every due assignment, the emails of enrolled students who
 * (a) have not completed it and (b) have `email_reminders` enabled.
 *
 * Memberships, progress and profiles are each fetched in ONE batched query
 * covering all assignments, then grouped in memory; auth emails are resolved
 * per id with bounded concurrency. Returns `assignmentId -> emails[]`.
 */
async function getIncompleteStudentEmailsByAssignment(
	adminClient: SupabaseClient,
	assignments: readonly ValidAssignment[]
): Promise<Map<string, string[]>> {
	const emailsByAssignment = new Map<string, string[]>();
	if (assignments.length === 0) return emailsByAssignment;

	const classIds = Array.from(new Set(assignments.map((a) => a.class_id)));
	const assignmentIds = assignments.map((a) => a.id);

	// 1. All class members for every class with a due assignment
	const membersByClass = new Map<string, string[]>();
	for (const ids of chunk(classIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('class_memberships')
			.select('class_id, student_id')
			.in('class_id', ids);
		if (error) throw new BatchQueryError('class_memberships', error);
		for (const m of toRecordArray(data)) {
			if (typeof m.class_id !== 'string' || typeof m.student_id !== 'string') continue;
			const list = membersByClass.get(m.class_id) ?? [];
			list.push(m.student_id);
			membersByClass.set(m.class_id, list);
		}
	}

	// 2. Students who have already completed any of the due assignments
	const completedByAssignment = new Map<string, Set<string>>();
	for (const ids of chunk(assignmentIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('assignment_progress')
			.select('assignment_id, student_id, completed_at')
			.in('assignment_id', ids)
			.not('completed_at', 'is', null);
		if (error) throw new BatchQueryError('assignment_progress', error);
		for (const p of toRecordArray(data)) {
			if (typeof p.assignment_id !== 'string' || typeof p.student_id !== 'string') continue;
			if (typeof p.completed_at !== 'string') continue;
			const set = completedByAssignment.get(p.assignment_id) ?? new Set<string>();
			set.add(p.student_id);
			completedByAssignment.set(p.assignment_id, set);
		}
	}

	// Incomplete members per assignment (membership order preserved)
	const incompleteByAssignment = new Map<string, string[]>();
	const allIncompleteIds = new Set<string>();
	for (const assignment of assignments) {
		const members = membersByClass.get(assignment.class_id) ?? [];
		const completed = completedByAssignment.get(assignment.id) ?? new Set<string>();
		const incomplete = members.filter((id) => !completed.has(id));
		incompleteByAssignment.set(assignment.id, incomplete);
		for (const id of incomplete) allIncompleteIds.add(id);
	}

	if (allIncompleteIds.size === 0) {
		for (const assignment of assignments) emailsByAssignment.set(assignment.id, []);
		return emailsByAssignment;
	}

	// 3. Of those, the students who have opted in to email reminders
	const eligibleIds = new Set<string>();
	for (const ids of chunk(Array.from(allIncompleteIds), IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('profiles')
			.select('id')
			.in('id', ids)
			.eq('email_reminders', true);
		if (error) throw new BatchQueryError('profiles', error);
		for (const p of toRecordArray(data)) {
			if (typeof p.id === 'string') eligibleIds.add(p.id);
		}
	}

	// 4. Auth emails for exactly the eligible ids
	const emailById = await resolveUserEmails(adminClient, eligibleIds);

	for (const assignment of assignments) {
		const incomplete = incompleteByAssignment.get(assignment.id) ?? [];
		const emails: string[] = [];
		for (const studentId of incomplete) {
			if (!eligibleIds.has(studentId)) continue;
			const email = emailById.get(studentId);
			if (email) emails.push(email);
		}
		emailsByAssignment.set(assignment.id, emails);
	}

	return emailsByAssignment;
}

export const POST: RequestHandler = async ({ request, url }) => {
	const siteOrigin = url.origin;
	const authHeader = request.headers.get('authorization');
	const cronSecret = privateEnv.CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		return json({ error: 'Supabase configuration missing' }, { status: 500 });
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey);

	const resendApiKey = privateEnv.RESEND_API_KEY;
	if (!resendApiKey) {
		return json({ error: 'Email service is not configured' }, { status: 500 });
	}

	const resend = new Resend(resendApiKey);
	const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';

	const now = new Date();
	const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

	let totalRemindersSent = 0;

	// --- 3-day reminders ---
	// Find assignments due within 3 days (but more than 1 day away) that haven't had 3-day reminder sent
	const { data: threeDayData, error: threeDayError } = await adminClient
		.from('assignments')
		.select('id, title, class_id')
		.eq('reminder_3day_sent', false)
		.gt('due_date', in24Hours.toISOString())
		.lte('due_date', in3Days.toISOString());

	if (threeDayError) {
		return json({ error: 'Failed to query assignments for 3-day reminders' }, { status: 500 });
	}

	const threeDayAssignments = toValidAssignments(threeDayData);

	// --- 1-day reminders ---
	// Find assignments due within 24 hours that haven't had 1-day reminder sent
	const { data: oneDayData, error: oneDayError } = await adminClient
		.from('assignments')
		.select('id, title, class_id')
		.eq('reminder_sent', false)
		.gte('due_date', now.toISOString())
		.lte('due_date', in24Hours.toISOString());

	if (oneDayError) {
		return json({ error: 'Failed to query assignments for 1-day reminders' }, { status: 500 });
	}

	const oneDayAssignments = toValidAssignments(oneDayData);

	// Prefetch class names + recipient lists for BOTH windows in one batched pass.
	// A failed batch query aborts the run rather than silently marking every
	// assignment as reminded with zero recipients.
	const allDueAssignments = [...threeDayAssignments, ...oneDayAssignments];
	let classNameById: Map<string, string>;
	let emailsByAssignment: Map<string, string[]>;
	try {
		classNameById = await fetchClassNames(
			adminClient,
			Array.from(new Set(allDueAssignments.map((a) => a.class_id)))
		);
		emailsByAssignment = await getIncompleteStudentEmailsByAssignment(
			adminClient,
			allDueAssignments
		);
	} catch (err) {
		const table = err instanceof BatchQueryError ? err.table : 'reminder data';
		console.error(`reminders: failed to query ${table}`, err);
		return json({ error: `Failed to query ${table}` }, { status: 500 });
	}

	for (const assignment of threeDayAssignments) {
		const className = classNameById.get(assignment.class_id);
		if (className === undefined) {
			continue;
		}

		const emailsToNotify = emailsByAssignment.get(assignment.id) ?? [];

		if (emailsToNotify.length === 0) {
			await adminClient
				.from('assignments')
				.update({ reminder_3day_sent: true })
				.eq('id', assignment.id);
			continue;
		}

		// Send 3-day reminder emails
		const threeDayAssignmentUrl = `${siteOrigin}/classes/${assignment.class_id}/assignments/${assignment.id}`;
		const sendResults = await Promise.allSettled(
			emailsToNotify.map((recipientEmail) =>
				resend.emails.send({
					from: fromAddress,
					to: [recipientEmail],
					subject: `Reminder: Assignment "${assignment.title}" for ${className} is due in 3 days`,
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
							<h2>Assignment Due in 3 Days</h2>
							<p>This is a reminder that the assignment <strong>"${assignment.title}"</strong> for <strong>${className}</strong> is due in 3 days.</p>
							<p>Make sure to complete it before the deadline!</p>
							<p>
								<a href="${threeDayAssignmentUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
									Go to Assignment
								</a>
							</p>
							<p style="margin-top: 24px; font-size: 12px; color: #666;">
								<a href="${siteOrigin}/profile" style="color: #666;">Manage email preferences</a> &middot;
								You're receiving this because you're enrolled in ${className}
							</p>
						</div>
					`
				})
			)
		);

		for (const result of sendResults) {
			if (result.status === 'fulfilled' && !result.value.error) {
				totalRemindersSent++;
			}
		}

		// Mark 3-day reminder as sent
		await adminClient
			.from('assignments')
			.update({ reminder_3day_sent: true })
			.eq('id', assignment.id);
	}

	for (const assignment of oneDayAssignments) {
		const className = classNameById.get(assignment.class_id);
		if (className === undefined) {
			continue;
		}

		const emailsToNotify = emailsByAssignment.get(assignment.id) ?? [];

		if (emailsToNotify.length === 0) {
			await adminClient.from('assignments').update({ reminder_sent: true }).eq('id', assignment.id);
			continue;
		}

		// Send 1-day reminder emails
		const oneDayAssignmentUrl = `${siteOrigin}/classes/${assignment.class_id}/assignments/${assignment.id}`;
		const oneDaySendResults = await Promise.allSettled(
			emailsToNotify.map((recipientEmail) =>
				resend.emails.send({
					from: fromAddress,
					to: [recipientEmail],
					subject: `Reminder: Assignment "${assignment.title}" for ${className} is due tomorrow`,
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
							<h2>Assignment Due Tomorrow</h2>
							<p>This is a reminder that the assignment <strong>"${assignment.title}"</strong> for <strong>${className}</strong> is due tomorrow.</p>
							<p>Make sure to complete it before the deadline!</p>
							<p>
								<a href="${oneDayAssignmentUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
									Go to Assignment
								</a>
							</p>
							<p style="margin-top: 24px; font-size: 12px; color: #666;">
								<a href="${siteOrigin}/profile" style="color: #666;">Manage email preferences</a> &middot;
								You're receiving this because you're enrolled in ${className}
							</p>
						</div>
					`
				})
			)
		);

		for (const result of oneDaySendResults) {
			if (result.status === 'fulfilled' && !result.value.error) {
				totalRemindersSent++;
			}
		}

		// Mark 1-day reminder as sent
		await adminClient.from('assignments').update({ reminder_sent: true }).eq('id', assignment.id);
	}

	return json({ ok: true, reminders_sent: totalRemindersSent });
};
