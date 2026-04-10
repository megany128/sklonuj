import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const assignmentId = url.searchParams.get('assignmentId');
	if (!assignmentId) {
		return json({ error: 'assignmentId query parameter is required' }, { status: 400 });
	}

	const supabase = locals.supabase;

	// Fetch the assignment
	const { data: assignmentData, error: assignmentError } = await supabase
		.from('assignments')
		.select(
			'id, class_id, title, selected_cases, selected_drill_types, number_mode, content_mode, target_questions'
		)
		.eq('id', assignmentId)
		.single();

	if (assignmentError || !isRecord(assignmentData) || typeof assignmentData.id !== 'string') {
		return json({ error: 'Assignment not found' }, { status: 404 });
	}

	const classId = assignmentData.class_id;
	if (typeof classId !== 'string') {
		return json({ error: 'Assignment has invalid class reference' }, { status: 500 });
	}

	// Verify user is a member of the class or the teacher
	const { data: classData, error: classError } = await supabase
		.from('classes')
		.select('id, teacher_id')
		.eq('id', classId)
		.single();

	if (classError || !isRecord(classData) || typeof classData.id !== 'string') {
		return json({ error: 'Class not found' }, { status: 404 });
	}

	const isTeacher = classData.teacher_id === user.id;

	if (!isTeacher) {
		const { data: membershipData, error: membershipError } = await supabase
			.from('class_memberships')
			.select('id')
			.eq('class_id', classId)
			.eq('student_id', user.id)
			.maybeSingle();

		if (membershipError || !membershipData) {
			return json({ error: 'You are not a member of this class' }, { status: 403 });
		}
	}

	// Fetch current progress for this user on this assignment
	const { data: progressData } = await supabase
		.from('assignment_progress')
		.select('questions_attempted, questions_correct, completed_at, mistakes')
		.eq('assignment_id', assignmentId)
		.eq('student_id', user.id)
		.maybeSingle();

	let attempted = 0;
	let correct = 0;
	let completedAt: string | null = null;
	let mistakesData: unknown[] = [];

	if (isRecord(progressData)) {
		attempted =
			typeof progressData.questions_attempted === 'number' ? progressData.questions_attempted : 0;
		correct =
			typeof progressData.questions_correct === 'number' ? progressData.questions_correct : 0;
		completedAt = typeof progressData.completed_at === 'string' ? progressData.completed_at : null;
		mistakesData = Array.isArray(progressData.mistakes) ? progressData.mistakes : [];
	}

	return json({
		title: typeof assignmentData.title === 'string' ? assignmentData.title : '',
		classId,
		selectedCases: Array.isArray(assignmentData.selected_cases)
			? assignmentData.selected_cases.filter((v: unknown): v is string => typeof v === 'string')
			: [],
		selectedDrillTypes: Array.isArray(assignmentData.selected_drill_types)
			? assignmentData.selected_drill_types.filter(
					(v: unknown): v is string => typeof v === 'string'
				)
			: [],
		numberMode:
			typeof assignmentData.number_mode === 'string' ? assignmentData.number_mode : 'both',
		contentMode:
			typeof assignmentData.content_mode === 'string' ? assignmentData.content_mode : 'both',
		targetQuestions:
			typeof assignmentData.target_questions === 'number' ? assignmentData.target_questions : 0,
		attempted,
		correct,
		completedAt,
		mistakes: mistakesData
	});
};

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

	const assignmentId = body['assignmentId'];
	const correct = body['correct'];
	const recentMistakes = body['recentMistakes'];

	if (typeof assignmentId !== 'string' || assignmentId.length === 0) {
		return json({ error: 'assignmentId is required and must be a string' }, { status: 400 });
	}

	if (typeof correct !== 'boolean') {
		return json({ error: 'correct is required and must be a boolean' }, { status: 400 });
	}

	// Validate recentMistakes if provided: must be an array of mistake objects (max 20)
	let validatedMistakes: Array<{
		word: string;
		expectedForm: string;
		givenAnswer: string;
		case: string;
		number: string;
		sentence?: string;
	}> | null = null;

	if (Array.isArray(recentMistakes)) {
		validatedMistakes = [];
		for (const m of recentMistakes.slice(-20)) {
			if (
				isRecord(m) &&
				typeof m.word === 'string' &&
				typeof m.expectedForm === 'string' &&
				typeof m.givenAnswer === 'string' &&
				typeof m.case === 'string' &&
				typeof m.number === 'string'
			) {
				const entry: (typeof validatedMistakes)[number] = {
					word: m.word,
					expectedForm: m.expectedForm,
					givenAnswer: m.givenAnswer,
					case: m.case,
					number: m.number
				};
				if (typeof m.sentence === 'string') entry.sentence = m.sentence;
				validatedMistakes.push(entry);
			}
		}
	}

	const supabase = locals.supabase;

	// Get the assignment and verify the student is a member of its class
	const { data: assignmentData, error: assignmentError } = await supabase
		.from('assignments')
		.select('id, class_id, target_questions')
		.eq('id', assignmentId)
		.single();

	if (
		assignmentError ||
		!isRecord(assignmentData) ||
		typeof assignmentData.id !== 'string' ||
		typeof assignmentData.class_id !== 'string' ||
		typeof assignmentData.target_questions !== 'number'
	) {
		return json({ error: 'Assignment not found' }, { status: 404 });
	}

	const { data: membershipData, error: membershipError } = await supabase
		.from('class_memberships')
		.select('id')
		.eq('class_id', assignmentData.class_id)
		.eq('student_id', user.id)
		.maybeSingle();

	if (membershipError || !membershipData) {
		return json({ error: 'You are not a member of this class' }, { status: 403 });
	}

	// Get existing progress
	const { data: existingData } = await supabase
		.from('assignment_progress')
		.select('questions_attempted, questions_correct, completed_at')
		.eq('assignment_id', assignmentId)
		.eq('student_id', user.id)
		.maybeSingle();

	let existingAttempted = 0;
	let existingCorrect = 0;
	let existingCompletedAt: string | null = null;

	if (isRecord(existingData)) {
		existingAttempted =
			typeof existingData.questions_attempted === 'number' ? existingData.questions_attempted : 0;
		existingCorrect =
			typeof existingData.questions_correct === 'number' ? existingData.questions_correct : 0;
		existingCompletedAt =
			typeof existingData.completed_at === 'string' ? existingData.completed_at : null;
	}

	const newAttempted = existingAttempted + 1;
	const newCorrect = existingCorrect + (correct ? 1 : 0);

	// Check completion: requires enough attempts
	const isCompleted = newAttempted >= assignmentData.target_questions;

	const now = new Date().toISOString();

	const upsertPayload: Record<string, unknown> = {
		assignment_id: assignmentId,
		student_id: user.id,
		questions_attempted: newAttempted,
		questions_correct: newCorrect,
		completed_at: isCompleted ? (existingCompletedAt ?? now) : null,
		updated_at: now
	};

	// Include mistakes if provided (overwrite with latest snapshot from client)
	if (validatedMistakes !== null) {
		upsertPayload.mistakes = validatedMistakes;
	}

	const { error: upsertError } = await supabase
		.from('assignment_progress')
		.upsert(upsertPayload, { onConflict: 'assignment_id,student_id' });

	if (upsertError) {
		return json({ error: 'Failed to update assignment progress' }, { status: 500 });
	}

	// If this student just completed the assignment, check if ALL students are now done
	const justCompleted = isCompleted && existingCompletedAt === null;
	if (justCompleted) {
		const apiKey = privateEnv.RESEND_API_KEY;
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

		if (apiKey && supabaseUrl && serviceRoleKey) {
			// Fire-and-forget: send teacher notification if all students completed
			const sendTeacherNotification = async () => {
				try {
					const adminClient = createClient(supabaseUrl, serviceRoleKey);
					const classId = assignmentData.class_id;
					const assignmentId = assignmentData.id;

					// Check the all_completed_notified flag first to avoid duplicate work
					const { data: flagData } = await adminClient
						.from('assignments')
						.select('all_completed_notified')
						.eq('id', assignmentId)
						.single();

					if (
						isRecord(flagData) &&
						typeof flagData.all_completed_notified === 'boolean' &&
						flagData.all_completed_notified
					) {
						return;
					}

					// Get all students in the class
					const { data: membersData } = await adminClient
						.from('class_memberships')
						.select('student_id')
						.eq('class_id', classId);

					if (!Array.isArray(membersData) || membersData.length === 0) return;

					const studentIds: string[] = [];
					for (const m of membersData) {
						if (isRecord(m) && typeof m.student_id === 'string') {
							studentIds.push(m.student_id);
						}
					}
					if (studentIds.length === 0) return;

					// Get all progress rows for this assignment
					const { data: allProgressData } = await adminClient
						.from('assignment_progress')
						.select('student_id, questions_attempted, questions_correct, completed_at')
						.eq('assignment_id', assignmentId)
						.in('student_id', studentIds);

					const progressRows = Array.isArray(allProgressData) ? allProgressData : [];
					const completedMap = new Map<string, { attempted: number; correct: number }>();

					for (const p of progressRows) {
						if (
							isRecord(p) &&
							typeof p.student_id === 'string' &&
							typeof p.completed_at === 'string'
						) {
							const attempted =
								typeof p.questions_attempted === 'number' ? p.questions_attempted : 0;
							const correct = typeof p.questions_correct === 'number' ? p.questions_correct : 0;
							completedMap.set(p.student_id, { attempted, correct });
						}
					}

					// Check if every student has completed
					const allCompleted = studentIds.every((id) => completedMap.has(id));
					if (!allCompleted) return;

					// Atomically set the flag — use a conditional update to prevent races
					const { data: updateResult } = await adminClient
						.from('assignments')
						.update({ all_completed_notified: true })
						.eq('id', assignmentId)
						.eq('all_completed_notified', false)
						.select('id')
						.maybeSingle();

					// If no row was updated, another request already claimed the notification
					if (!isRecord(updateResult) || typeof updateResult.id !== 'string') {
						return;
					}

					// Calculate average accuracy
					let totalAccuracy = 0;
					for (const { attempted, correct } of completedMap.values()) {
						totalAccuracy += attempted > 0 ? (correct / attempted) * 100 : 0;
					}
					const avgAccuracy = Math.round(totalAccuracy / studentIds.length);

					// Get assignment title and class info
					const { data: fullAssignment } = await adminClient
						.from('assignments')
						.select('title, class_id')
						.eq('id', assignmentId)
						.single();

					if (
						!isRecord(fullAssignment) ||
						typeof fullAssignment.title !== 'string' ||
						typeof fullAssignment.class_id !== 'string'
					) {
						return;
					}

					const { data: classInfo } = await adminClient
						.from('classes')
						.select('name, teacher_id')
						.eq('id', fullAssignment.class_id)
						.single();

					if (
						!isRecord(classInfo) ||
						typeof classInfo.name !== 'string' ||
						typeof classInfo.teacher_id !== 'string'
					) {
						return;
					}

					// Get teacher email
					const { data: teacherData } = await adminClient.auth.admin.getUserById(
						classInfo.teacher_id
					);
					if (!teacherData?.user || typeof teacherData.user.email !== 'string') {
						return;
					}

					const teacherEmail = teacherData.user.email;
					const resend = new Resend(apiKey);
					const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';
					const siteOrigin = url.origin;
					const assignmentLink = `${siteOrigin}/classes/${classId}/assignments/${assignmentId}`;

					await resend.emails.send({
						from: fromAddress,
						to: [teacherEmail],
						subject: `All students completed: ${fullAssignment.title} — ${classInfo.name}`,
						html: `
							<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
								<h2>All Students Have Completed an Assignment!</h2>
								<p>Every student in <strong>${classInfo.name}</strong> has finished <strong>${fullAssignment.title}</strong>.</p>
								<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
									<tr>
										<td style="padding: 8px 0; color: #6b7280;">Students</td>
										<td style="padding: 8px 0; font-weight: bold;">${studentIds.length}</td>
									</tr>
									<tr>
										<td style="padding: 8px 0; color: #6b7280;">Average Accuracy</td>
										<td style="padding: 8px 0; font-weight: bold;">${avgAccuracy}%</td>
									</tr>
								</table>
								<p>
									<a href="${assignmentLink}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
										View Assignment Details
									</a>
								</p>
								<p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
								<p style="color: #6b7280; font-size: 14px;">${assignmentLink}</p>
								<p style="margin-top: 24px; font-size: 12px; color: #666;">
									<a href="${siteOrigin}/profile" style="color: #666;">Manage email preferences</a> &middot;
									You're receiving this as the teacher of ${classInfo.name}
								</p>
							</div>
						`
					});
				} catch {
					// Fire-and-forget: silently ignore notification errors
				}
			};
			sendTeacherNotification();
		}
	}

	// Return flat response matching what the frontend expects
	return json({
		questions_attempted: newAttempted,
		questions_correct: newCorrect,
		completed_at: isCompleted ? (existingCompletedAt ?? now) : null
	});
};
