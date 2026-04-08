/**
 * Class progress snapshots cron endpoint.
 *
 * Invoked by `.github/workflows/cron.yml` on a schedule of every 6 hours
 * (at 00:00, 06:00, 12:00, and 18:00 UTC).
 *
 * Authentication is performed via an `Authorization: Bearer $CRON_SECRET`
 * header; requests without a matching secret are rejected with 401.
 */
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
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

interface ScoreEntry {
	attempts: number;
	correct: number;
}

function isScoreEntry(v: unknown): v is ScoreEntry {
	return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
}

const CASE_KEYS = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'] as const;

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

	const classes = toRecordArray(classesData).filter(
		(c): c is Record<string, unknown> & { id: string } => typeof c.id === 'string'
	);

	let snapshotsUpserted = 0;

	for (const cls of classes) {
		// Get enrolled students for this class
		const { data: membershipsData } = await adminClient
			.from('class_memberships')
			.select('student_id')
			.eq('class_id', cls.id);

		const memberships = toRecordArray(membershipsData).filter(
			(m): m is Record<string, unknown> & { student_id: string } => typeof m.student_id === 'string'
		);

		if (memberships.length === 0) continue;

		const studentIds = memberships.map((m) => m.student_id);

		// Get user_progress (case_scores) for each student
		const { data: userProgressData } = await adminClient
			.from('user_progress')
			.select('user_id, case_scores')
			.in('user_id', studentIds);

		const progressByStudent = new Map<
			string,
			{
				overallAccuracy: number | null;
				totalQuestions: number;
				caseAccuracies: Record<string, number | null>;
			}
		>();

		for (const up of toRecordArray(userProgressData)) {
			if (typeof up.user_id !== 'string') continue;

			const caseScores = up.case_scores;
			let totalAttempts = 0;
			let totalCorrect = 0;
			const caseAccuracies: Record<string, number | null> = {};

			if (isRecord(caseScores)) {
				for (const key of CASE_KEYS) {
					const entry = caseScores[key];
					if (isScoreEntry(entry)) {
						totalAttempts += entry.attempts;
						totalCorrect += entry.correct;
						caseAccuracies[key] =
							entry.attempts > 0 ? (entry.correct / entry.attempts) * 100 : null;
					} else {
						caseAccuracies[key] = null;
					}
				}
			} else {
				for (const key of CASE_KEYS) {
					caseAccuracies[key] = null;
				}
			}

			progressByStudent.set(up.user_id, {
				overallAccuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : null,
				totalQuestions: totalAttempts,
				caseAccuracies
			});
		}

		// Build upsert rows for all students in this class
		const rows: Record<string, unknown>[] = [];
		for (const studentId of studentIds) {
			const progress = progressByStudent.get(studentId);
			rows.push({
				class_id: cls.id,
				student_id: studentId,
				snapshot_date: new Date().toISOString().slice(0, 10),
				overall_accuracy: progress?.overallAccuracy ?? null,
				total_questions: progress?.totalQuestions ?? 0,
				nom_accuracy: progress?.caseAccuracies.nom ?? null,
				gen_accuracy: progress?.caseAccuracies.gen ?? null,
				dat_accuracy: progress?.caseAccuracies.dat ?? null,
				acc_accuracy: progress?.caseAccuracies.acc ?? null,
				voc_accuracy: progress?.caseAccuracies.voc ?? null,
				loc_accuracy: progress?.caseAccuracies.loc ?? null,
				ins_accuracy: progress?.caseAccuracies.ins ?? null
			});
		}

		if (rows.length > 0) {
			const { error: upsertError } = await adminClient
				.from('class_progress_snapshots')
				.upsert(rows, { onConflict: 'class_id,student_id,snapshot_date' });

			if (!upsertError) {
				snapshotsUpserted += rows.length;
			}
		}
	}

	return json({ ok: true, snapshots_upserted: snapshotsUpserted });
};
