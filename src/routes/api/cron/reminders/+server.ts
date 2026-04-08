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
 */
import { json } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord);
}

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

async function getIncompleteStudentEmails(
	adminClient: SupabaseClient,
	assignmentId: string,
	classId: string
): Promise<string[]> {
	// Get all class members
	const { data: membersData } = await adminClient
		.from('class_memberships')
		.select('student_id')
		.eq('class_id', classId);

	const rawMembers = toRecordArray(membersData);
	const members = rawMembers.filter(
		(m): m is Record<string, unknown> & { student_id: string } => typeof m.student_id === 'string'
	);

	if (members.length === 0) return [];

	const studentIds = members.map((m) => m.student_id);

	// Get students who have already completed the assignment
	const { data: progressData } = await adminClient
		.from('assignment_progress')
		.select('student_id, completed_at')
		.eq('assignment_id', assignmentId)
		.in('student_id', studentIds);

	const rawProgress = toRecordArray(progressData);
	const progressRows = rawProgress.filter(
		(
			p
		): p is Record<string, unknown> & {
			student_id: string;
			completed_at: string | null;
		} =>
			typeof p.student_id === 'string' &&
			(typeof p.completed_at === 'string' || p.completed_at === null)
	);
	const completedStudentIds = new Set(
		progressRows.filter((p) => p.completed_at !== null).map((p) => p.student_id)
	);

	const incompleteStudentIds = studentIds.filter((id) => !completedStudentIds.has(id));

	if (incompleteStudentIds.length === 0) return [];

	// Get profiles for students who have email_reminders enabled
	const { data: profilesData } = await adminClient
		.from('profiles')
		.select('id, email_reminders')
		.in('id', incompleteStudentIds);

	const rawProfiles = toRecordArray(profilesData);
	const profiles = rawProfiles.filter(
		(p): p is Record<string, unknown> & { id: string; email_reminders: boolean } =>
			typeof p.id === 'string' && typeof p.email_reminders === 'boolean'
	);
	const eligibleStudentIds = profiles.filter((p) => p.email_reminders).map((p) => p.id);

	if (eligibleStudentIds.length === 0) return [];

	// Get email addresses from auth.users via admin API in batches
	const eligibleIdSet = new Set(eligibleStudentIds);
	const emailsToNotify: string[] = [];
	let page = 1;
	const perPage = 50;
	let found = 0;
	while (found < eligibleStudentIds.length) {
		const { data: listData } = await adminClient.auth.admin.listUsers({ page, perPage });
		if (!listData || !Array.isArray(listData.users) || listData.users.length === 0) {
			break;
		}
		for (const user of listData.users) {
			if (
				isRecord(user) &&
				typeof user.id === 'string' &&
				eligibleIdSet.has(user.id) &&
				typeof user.email === 'string'
			) {
				emailsToNotify.push(user.email);
				found++;
			}
		}
		if (listData.users.length < perPage) {
			break;
		}
		page++;
	}

	return emailsToNotify;
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

	for (const assignment of threeDayAssignments) {
		// Get class info
		const { data: classData, error: classError } = await adminClient
			.from('classes')
			.select('id, name')
			.eq('id', assignment.class_id)
			.single();

		if (
			classError ||
			!isRecord(classData) ||
			typeof classData.id !== 'string' ||
			typeof classData.name !== 'string'
		) {
			continue;
		}

		const emailsToNotify = await getIncompleteStudentEmails(
			adminClient,
			assignment.id,
			assignment.class_id
		);

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
					subject: `Reminder: Assignment "${assignment.title}" for ${classData.name} is due in 3 days`,
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
							<h2>Assignment Due in 3 Days</h2>
							<p>This is a reminder that the assignment <strong>"${assignment.title}"</strong> for <strong>${classData.name}</strong> is due in 3 days.</p>
							<p>Make sure to complete it before the deadline!</p>
							<p>
								<a href="${threeDayAssignmentUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
									Go to Assignment
								</a>
							</p>
							<p style="margin-top: 24px; font-size: 12px; color: #666;">
								<a href="${siteOrigin}/profile" style="color: #666;">Manage email preferences</a> &middot;
								You're receiving this because you're enrolled in ${classData.name}
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

	for (const assignment of oneDayAssignments) {
		// Get class info
		const { data: classData, error: classError } = await adminClient
			.from('classes')
			.select('id, name')
			.eq('id', assignment.class_id)
			.single();

		if (
			classError ||
			!isRecord(classData) ||
			typeof classData.id !== 'string' ||
			typeof classData.name !== 'string'
		) {
			continue;
		}

		const emailsToNotify = await getIncompleteStudentEmails(
			adminClient,
			assignment.id,
			assignment.class_id
		);

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
					subject: `Reminder: Assignment "${assignment.title}" for ${classData.name} is due tomorrow`,
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
							<h2>Assignment Due Tomorrow</h2>
							<p>This is a reminder that the assignment <strong>"${assignment.title}"</strong> for <strong>${classData.name}</strong> is due tomorrow.</p>
							<p>Make sure to complete it before the deadline!</p>
							<p>
								<a href="${oneDayAssignmentUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
									Go to Assignment
								</a>
							</p>
							<p style="margin-top: 24px; font-size: 12px; color: #666;">
								<a href="${siteOrigin}/profile" style="color: #666;">Manage email preferences</a> &middot;
								You're receiving this because you're enrolled in ${classData.name}
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
