/**
 * Assignment wrap-up email cron endpoint.
 *
 * Invoked by `.github/workflows/cron.yml` on a schedule of every 6 hours
 * (at 00:00, 06:00, 12:00, and 18:00 UTC).
 *
 * Authentication is performed via an `Authorization: Bearer $CRON_SECRET`
 * header; requests without a matching secret are rejected with 401.
 *
 * For every assignment whose `due_date` has passed and whose
 * `assignments.wrapup_sent` flag is still false, the class's teacher receives
 * ONE summary email: how many students completed the assignment, the average
 * accuracy, which students are struggling (per-student accuracy below the
 * class's `struggling_threshold`), and which students never started.
 *
 * Skipping: archived classes, classes with an empty roster, missing class
 * rows, and teachers who have opted out via `profiles.teacher_email_updates`
 * are skipped without an email — but every processed assignment ends with
 * `wrapup_sent = true` so it is never re-scanned.
 *
 * Query shape: all supporting data (classes, memberships, assignment
 * progress, student + teacher profiles, auth emails) is fetched ONCE for
 * every due assignment and grouped in memory, so the run costs a constant
 * number of table round trips plus one auth lookup per recipient (bounded
 * concurrency) — not a fresh fan-out per assignment.
 */
import { json } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { chunk, resolveUserEmails } from '$lib/server/auth-users';
import { buildTeacherUnsubscribeUrl } from '$lib/server/email-unsubscribe';
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

interface DueAssignment {
	id: string;
	title: string;
	class_id: string;
	target_questions: number;
	due_date: string;
}

function toDueAssignments(data: unknown): DueAssignment[] {
	const raw = toRecordArray(data);
	return raw.filter(
		(a): a is Record<string, unknown> & DueAssignment =>
			typeof a.id === 'string' &&
			typeof a.title === 'string' &&
			typeof a.class_id === 'string' &&
			typeof a.target_questions === 'number' &&
			typeof a.due_date === 'string'
	);
}

interface ClassRow {
	id: string;
	name: string;
	teacher_id: string;
	archived: boolean;
	struggling_threshold: number;
}

interface ProgressRow {
	assignment_id: string;
	student_id: string;
	questions_attempted: number;
	questions_correct: number;
	completed_at: string | null;
}

interface TeacherProfile {
	display_name: string | null;
	teacher_email_updates: boolean;
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
 * Fetch the class rows for every class id in one pass (chunked `.in()`).
 * Returns `classId -> ClassRow`.
 */
async function fetchClasses(
	adminClient: SupabaseClient,
	classIds: readonly string[]
): Promise<Map<string, ClassRow>> {
	const classById = new Map<string, ClassRow>();
	for (const ids of chunk(classIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('classes')
			.select('id, name, teacher_id, archived, struggling_threshold')
			.in('id', ids);
		if (error) throw new BatchQueryError('classes', error);
		for (const c of toRecordArray(data)) {
			if (
				typeof c.id === 'string' &&
				typeof c.name === 'string' &&
				typeof c.teacher_id === 'string' &&
				typeof c.archived === 'boolean' &&
				typeof c.struggling_threshold === 'number'
			) {
				classById.set(c.id, {
					id: c.id,
					name: c.name,
					teacher_id: c.teacher_id,
					archived: c.archived,
					struggling_threshold: c.struggling_threshold
				});
			}
		}
	}
	return classById;
}

/**
 * Fetch every roster in one pass (chunked `.in()`).
 * Returns `classId -> studentIds[]`.
 */
async function fetchRosters(
	adminClient: SupabaseClient,
	classIds: readonly string[]
): Promise<Map<string, string[]>> {
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
	return membersByClass;
}

/**
 * Fetch every progress row for the due assignments in one pass (chunked
 * `.in()`). Returns `assignmentId -> (studentId -> ProgressRow)`.
 */
async function fetchProgress(
	adminClient: SupabaseClient,
	assignmentIds: readonly string[]
): Promise<Map<string, Map<string, ProgressRow>>> {
	const progressByAssignment = new Map<string, Map<string, ProgressRow>>();
	for (const ids of chunk(assignmentIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('assignment_progress')
			.select('assignment_id, student_id, questions_attempted, questions_correct, completed_at')
			.in('assignment_id', ids);
		if (error) throw new BatchQueryError('assignment_progress', error);
		for (const p of toRecordArray(data)) {
			if (
				typeof p.assignment_id !== 'string' ||
				typeof p.student_id !== 'string' ||
				typeof p.questions_attempted !== 'number' ||
				typeof p.questions_correct !== 'number' ||
				(typeof p.completed_at !== 'string' && p.completed_at !== null)
			) {
				continue;
			}
			const byStudent = progressByAssignment.get(p.assignment_id) ?? new Map<string, ProgressRow>();
			byStudent.set(p.student_id, {
				assignment_id: p.assignment_id,
				student_id: p.student_id,
				questions_attempted: p.questions_attempted,
				questions_correct: p.questions_correct,
				completed_at: p.completed_at
			});
			progressByAssignment.set(p.assignment_id, byStudent);
		}
	}
	return progressByAssignment;
}

/**
 * Fetch `id, display_name` for every student id in one pass (chunked `.in()`).
 * Returns `studentId -> display_name | null`.
 */
async function fetchStudentNames(
	adminClient: SupabaseClient,
	studentIds: readonly string[]
): Promise<Map<string, string | null>> {
	const nameById = new Map<string, string | null>();
	for (const ids of chunk(studentIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('profiles')
			.select('id, display_name')
			.in('id', ids);
		if (error) throw new BatchQueryError('profiles', error);
		for (const p of toRecordArray(data)) {
			if (typeof p.id !== 'string') continue;
			nameById.set(p.id, typeof p.display_name === 'string' ? p.display_name : null);
		}
	}
	return nameById;
}

/**
 * Fetch teacher profiles (name + opt-in flag) in one pass (chunked `.in()`).
 * Returns `teacherId -> TeacherProfile`. Teachers without a profile row are
 * absent from the map; callers should treat them as opted in (the column
 * defaults to true).
 */
async function fetchTeacherProfiles(
	adminClient: SupabaseClient,
	teacherIds: readonly string[]
): Promise<Map<string, TeacherProfile>> {
	const profileById = new Map<string, TeacherProfile>();
	for (const ids of chunk(teacherIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('profiles')
			.select('id, display_name, teacher_email_updates')
			.in('id', ids);
		if (error) throw new BatchQueryError('profiles', error);
		for (const p of toRecordArray(data)) {
			if (typeof p.id !== 'string' || typeof p.teacher_email_updates !== 'boolean') continue;
			profileById.set(p.id, {
				display_name: typeof p.display_name === 'string' ? p.display_name : null,
				teacher_email_updates: p.teacher_email_updates
			});
		}
	}
	return profileById;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

interface WrapupStats {
	rosterSize: number;
	completedCount: number;
	startedIncompleteCount: number;
	/** Rounded percentage across students with attempts, or null when nobody attempted. */
	averageAccuracy: number | null;
	strugglingNames: string[];
	neverStartedNames: string[];
}

function buildWrapupHtml(
	assignment: DueAssignment,
	className: string,
	stats: WrapupStats,
	assignmentUrl: string,
	siteOrigin: string,
	unsubscribeUrl: string
): string {
	const dueDateLabel = new Date(assignment.due_date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	const statLines: string[] = [
		`<strong>${stats.completedCount} of ${stats.rosterSize}</strong> students completed the assignment`
	];
	if (stats.startedIncompleteCount > 0) {
		statLines.push(
			`<strong>${stats.startedIncompleteCount}</strong> started but didn&rsquo;t finish`
		);
	}
	if (stats.averageAccuracy !== null) {
		statLines.push(`Average accuracy: <strong>${stats.averageAccuracy}%</strong>`);
	}
	if (stats.strugglingNames.length > 0) {
		statLines.push(
			`Struggling: <strong>${stats.strugglingNames.map(escapeHtml).join(', ')}</strong>`
		);
	}
	if (stats.neverStartedNames.length > 0) {
		statLines.push(
			`Didn&rsquo;t start: <strong>${stats.neverStartedNames.map(escapeHtml).join(', ')}</strong>`
		);
	}

	const statsBlock = statLines
		.map((line) => `<p style="margin: 0 0 8px; font-size: 14px; color: #333;">${line}</p>`)
		.join('\n\t\t\t\t\t');

	return `
		<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
			<h2>[${escapeHtml(className)}] Assignment Wrap-up: ${escapeHtml(assignment.title)}</h2>
			<p>The due date passed on ${dueDateLabel}. Here's how your class did:</p>
			<div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
				${statsBlock}
			</div>
			<p>
				<a href="${assignmentUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0c0f00; color: white; text-decoration: none; border-radius: 8px;">
					View Assignment Results
				</a>
			</p>
			<p style="margin-top: 24px; font-size: 12px; color: #666;">
				<a href="${siteOrigin}/profile" style="color: #666;">Manage email preferences</a> &middot;
				<a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe</a>
			</p>
		</div>
	`;
}

function computeWrapupStats(
	rosterIds: readonly string[],
	progressByStudent: ReadonlyMap<string, ProgressRow>,
	strugglingThreshold: number,
	studentNameById: ReadonlyMap<string, string | null>
): WrapupStats {
	let completedCount = 0;
	let startedIncompleteCount = 0;
	let accuracySum = 0;
	let attemptedStudents = 0;
	const strugglingNames: string[] = [];
	const neverStartedNames: string[] = [];

	for (const studentId of rosterIds) {
		const progress = progressByStudent.get(studentId);
		if (
			progress === undefined ||
			(progress.questions_attempted <= 0 && progress.completed_at === null)
		) {
			neverStartedNames.push(studentNameById.get(studentId) ?? 'A student');
			continue;
		}

		if (progress.completed_at !== null) {
			completedCount++;
		} else {
			startedIncompleteCount++;
		}

		if (progress.questions_attempted > 0) {
			const accuracy = progress.questions_correct / progress.questions_attempted;
			accuracySum += accuracy;
			attemptedStudents++;
			if (accuracy * 100 < strugglingThreshold) {
				strugglingNames.push(studentNameById.get(studentId) ?? 'A student');
			}
		}
	}

	return {
		rosterSize: rosterIds.length,
		completedCount,
		startedIncompleteCount,
		averageAccuracy:
			attemptedStudents > 0 ? Math.round((accuracySum / attemptedStudents) * 100) : null,
		strugglingNames,
		neverStartedNames
	};
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

	// Find assignments whose due date has passed and whose wrap-up hasn't been sent
	const { data: dueData, error: dueError } = await adminClient
		.from('assignments')
		.select('id, title, class_id, target_questions, due_date')
		.eq('wrapup_sent', false)
		.not('due_date', 'is', null)
		.lte('due_date', now.toISOString());

	if (dueError) {
		return json({ error: 'Failed to query assignments for wrap-up emails' }, { status: 500 });
	}

	const dueAssignments = toDueAssignments(dueData);

	if (dueAssignments.length === 0) {
		return json({ ok: true, wrapups_sent: 0 });
	}

	// Prefetch everything in one batched pass per table. A failed batch query
	// aborts the run rather than silently marking every assignment as sent
	// with zero recipients.
	let classById: Map<string, ClassRow>;
	let membersByClass: Map<string, string[]>;
	let progressByAssignment: Map<string, Map<string, ProgressRow>>;
	let studentNameById: Map<string, string | null>;
	let teacherProfileById: Map<string, TeacherProfile>;
	let teacherEmailById: Map<string, string>;
	try {
		const classIds = Array.from(new Set(dueAssignments.map((a) => a.class_id)));
		classById = await fetchClasses(adminClient, classIds);
		membersByClass = await fetchRosters(adminClient, classIds);
		progressByAssignment = await fetchProgress(
			adminClient,
			dueAssignments.map((a) => a.id)
		);

		const allStudentIds = new Set<string>();
		for (const members of membersByClass.values()) {
			for (const id of members) allStudentIds.add(id);
		}
		studentNameById = await fetchStudentNames(adminClient, Array.from(allStudentIds));

		const teacherIds = Array.from(new Set(Array.from(classById.values(), (c) => c.teacher_id)));
		teacherProfileById = await fetchTeacherProfiles(adminClient, teacherIds);

		// Only resolve auth emails for teachers who will actually be emailed:
		// opted in (or no profile row — the column defaults to true), with a
		// non-archived class and a non-empty roster.
		const emailableTeacherIds = new Set<string>();
		for (const assignment of dueAssignments) {
			const classRow = classById.get(assignment.class_id);
			if (!classRow || classRow.archived) continue;
			if ((membersByClass.get(classRow.id) ?? []).length === 0) continue;
			const teacherProfile = teacherProfileById.get(classRow.teacher_id);
			if (teacherProfile && !teacherProfile.teacher_email_updates) continue;
			emailableTeacherIds.add(classRow.teacher_id);
		}
		teacherEmailById = await resolveUserEmails(adminClient, emailableTeacherIds);
	} catch (err) {
		const table = err instanceof BatchQueryError ? err.table : 'wrap-up data';
		console.error(`assignment-wrapup: failed to query ${table}`, err);
		return json({ error: `Failed to query ${table}` }, { status: 500 });
	}

	let totalWrapupsSent = 0;

	for (const assignment of dueAssignments) {
		const classRow = classById.get(assignment.class_id);
		const rosterIds = classRow ? (membersByClass.get(classRow.id) ?? []) : [];
		const teacherProfile = classRow ? teacherProfileById.get(classRow.teacher_id) : undefined;
		const teacherOptedIn = teacherProfile === undefined || teacherProfile.teacher_email_updates;
		const teacherEmail = classRow ? teacherEmailById.get(classRow.teacher_id) : undefined;

		// Skip without emailing: missing/archived class, empty roster, opted-out
		// teacher, or unresolvable teacher email. Still mark the assignment as
		// sent so it is never re-scanned.
		if (
			!classRow ||
			classRow.archived ||
			rosterIds.length === 0 ||
			!teacherOptedIn ||
			!teacherEmail
		) {
			await adminClient.from('assignments').update({ wrapup_sent: true }).eq('id', assignment.id);
			continue;
		}

		const stats = computeWrapupStats(
			rosterIds,
			progressByAssignment.get(assignment.id) ?? new Map<string, ProgressRow>(),
			classRow.struggling_threshold,
			studentNameById
		);

		const assignmentUrl = `${siteOrigin}/classes/${classRow.id}/assignments/${assignment.id}`;
		const unsubscribeUrl = await buildTeacherUnsubscribeUrl(
			siteOrigin,
			classRow.teacher_id,
			cronSecret
		);

		const sendResult = await resend.emails.send({
			from: fromAddress,
			to: [teacherEmail],
			subject: `[${classRow.name}] Assignment Wrap-up: ${assignment.title}`,
			html: buildWrapupHtml(
				assignment,
				classRow.name,
				stats,
				assignmentUrl,
				siteOrigin,
				unsubscribeUrl
			),
			headers: {
				'List-Unsubscribe': `<${unsubscribeUrl}>`,
				'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
			}
		});

		if (sendResult.error) {
			console.error(
				`assignment-wrapup: failed to send wrap-up for assignment ${assignment.id}`,
				sendResult.error
			);
		} else {
			totalWrapupsSent++;
		}

		// Mark wrap-up as sent
		await adminClient.from('assignments').update({ wrapup_sent: true }).eq('id', assignment.id);
	}

	return json({ ok: true, wrapups_sent: totalWrapupsSent });
};
