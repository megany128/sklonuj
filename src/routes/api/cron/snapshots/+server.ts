/**
 * Class progress snapshots cron endpoint.
 *
 * Invoked by `.github/workflows/cron.yml` on a schedule of every 6 hours
 * (at 00:00, 06:00, 12:00, and 18:00 UTC).
 *
 * Authentication is performed via an `Authorization: Bearer $CRON_SECRET`
 * header; requests without a matching secret are rejected with 401.
 *
 * Query shape: memberships for ALL active classes and progress for ALL
 * enrolled students are each fetched in one batched pass, snapshot rows are
 * computed in memory, and written with a batched upsert on
 * `(class_id, student_id, snapshot_date)` — a constant number of round trips
 * rather than three per class.
 */
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { chunk } from '$lib/server/auth-users';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord);
}

interface ScoreEntry {
	attempts: number;
	correct: number;
}

function isScoreEntry(v: unknown): v is ScoreEntry {
	return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
}

const CASE_KEYS = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'] as const;

/** Keep `.in()` filter lists comfortably under PostgREST URL length limits. */
const IN_FILTER_CHUNK = 200;
/** Rows per upsert request. */
const UPSERT_CHUNK = 500;

interface StudentProgress {
	overallAccuracy: number | null;
	totalQuestions: number;
	caseAccuracies: Record<string, number | null>;
}

function computeStudentProgress(caseScores: unknown): StudentProgress {
	let totalAttempts = 0;
	let totalCorrect = 0;
	const caseAccuracies: Record<string, number | null> = {};

	if (isRecord(caseScores)) {
		for (const key of CASE_KEYS) {
			const entry = caseScores[key];
			if (isScoreEntry(entry)) {
				totalAttempts += entry.attempts;
				totalCorrect += entry.correct;
				caseAccuracies[key] = entry.attempts > 0 ? (entry.correct / entry.attempts) * 100 : null;
			} else {
				caseAccuracies[key] = null;
			}
		}
	} else {
		for (const key of CASE_KEYS) {
			caseAccuracies[key] = null;
		}
	}

	return {
		overallAccuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : null,
		totalQuestions: totalAttempts,
		caseAccuracies
	};
}

export const POST: RequestHandler = async ({ request }) => {
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

	// Get all active (non-archived) classes
	const { data: classesData, error: classesError } = await adminClient
		.from('classes')
		.select('id')
		.eq('archived', false);

	if (classesError) {
		return json({ error: 'Failed to query classes' }, { status: 500 });
	}

	const classIds = toRecordArray(classesData)
		.map((c) => c.id)
		.filter((id): id is string => typeof id === 'string');

	if (classIds.length === 0) {
		return json({ ok: true, snapshots_upserted: 0 });
	}

	// Enrolled students for every active class, in one pass
	const memberships: { classId: string; studentId: string }[] = [];
	for (const ids of chunk(classIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('class_memberships')
			.select('class_id, student_id')
			.in('class_id', ids);
		if (error) {
			console.error('snapshots: failed to query class_memberships', error);
			return json({ error: 'Failed to query class memberships' }, { status: 500 });
		}
		for (const m of toRecordArray(data)) {
			if (typeof m.class_id === 'string' && typeof m.student_id === 'string') {
				memberships.push({ classId: m.class_id, studentId: m.student_id });
			}
		}
	}

	if (memberships.length === 0) {
		return json({ ok: true, snapshots_upserted: 0 });
	}

	// user_progress (case_scores) for every enrolled student, in one pass
	const studentIds = Array.from(new Set(memberships.map((m) => m.studentId)));
	const progressByStudent = new Map<string, StudentProgress>();
	for (const ids of chunk(studentIds, IN_FILTER_CHUNK)) {
		const { data, error } = await adminClient
			.from('user_progress')
			.select('user_id, case_scores')
			.in('user_id', ids);
		if (error) {
			console.error('snapshots: failed to query user_progress', error);
			return json({ error: 'Failed to query user progress' }, { status: 500 });
		}
		for (const up of toRecordArray(data)) {
			if (typeof up.user_id !== 'string') continue;
			progressByStudent.set(up.user_id, computeStudentProgress(up.case_scores));
		}
	}

	// Build upsert rows for every (class, student) pair
	const snapshotDate = new Date().toISOString().slice(0, 10);
	const rows: Record<string, unknown>[] = memberships.map(({ classId, studentId }) => {
		const progress = progressByStudent.get(studentId);
		return {
			class_id: classId,
			student_id: studentId,
			snapshot_date: snapshotDate,
			overall_accuracy: progress?.overallAccuracy ?? null,
			total_questions: progress?.totalQuestions ?? 0,
			nom_accuracy: progress?.caseAccuracies.nom ?? null,
			gen_accuracy: progress?.caseAccuracies.gen ?? null,
			dat_accuracy: progress?.caseAccuracies.dat ?? null,
			acc_accuracy: progress?.caseAccuracies.acc ?? null,
			voc_accuracy: progress?.caseAccuracies.voc ?? null,
			loc_accuracy: progress?.caseAccuracies.loc ?? null,
			ins_accuracy: progress?.caseAccuracies.ins ?? null
		};
	});

	// Batched upsert; a failed chunk is logged and skipped so the rest still land
	let snapshotsUpserted = 0;
	for (const batch of chunk(rows, UPSERT_CHUNK)) {
		const { error: upsertError } = await adminClient
			.from('class_progress_snapshots')
			.upsert(batch, { onConflict: 'class_id,student_id,snapshot_date' });

		if (upsertError) {
			console.error('snapshots: upsert chunk failed', upsertError);
			continue;
		}
		snapshotsUpserted += batch.length;
	}

	return json({ ok: true, snapshots_upserted: snapshotsUpserted });
};
