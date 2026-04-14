import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((item): item is string => typeof item === 'string');
}

interface ScoreEntry {
	attempts: number;
	correct: number;
}

function isScoreEntry(v: unknown): v is ScoreEntry {
	return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
}

/**
 * Aggregate raw case_scores entries (keyed like "gen_sg", "gen_pl") into per-base-case totals
 * (keyed "gen", "dat", etc.). Also returns the overall attempts/correct totals.
 */
function aggregateCaseScores(raw: Record<string, unknown>): {
	perCase: CaseAccuracy[];
	totalAttempts: number;
	totalCorrect: number;
} {
	const byBase = new Map<string, { attempts: number; correct: number }>();
	let totalAttempts = 0;
	let totalCorrect = 0;
	for (const key of Object.keys(raw)) {
		const entry = raw[key];
		if (!isScoreEntry(entry)) continue;
		totalAttempts += entry.attempts;
		totalCorrect += entry.correct;
		const baseCase = key.split('_')[0] ?? key;
		const existing = byBase.get(baseCase) ?? { attempts: 0, correct: 0 };
		existing.attempts += entry.attempts;
		existing.correct += entry.correct;
		byBase.set(baseCase, existing);
	}
	const perCase: CaseAccuracy[] = [];
	for (const [baseCase, data] of byBase) {
		perCase.push({
			case: baseCase,
			attempts: data.attempts,
			correct: data.correct,
			accuracy: data.attempts > 0 ? (data.correct / data.attempts) * 100 : 0
		});
	}
	return { perCase, totalAttempts, totalCorrect };
}

interface AssignmentStatus {
	assignmentId: string;
	assignmentTitle: string;
	attempted: number;
	target: number;
	correct: number;
	completed: boolean;
}

interface CaseAccuracy {
	case: string;
	attempts: number;
	correct: number;
	accuracy: number;
}

interface StudentRow {
	studentId: string;
	displayName: string | null;
	email: string | null;
	joinedAt: string;
	overallAccuracy: number | null;
	totalAttempts: number;
	assignmentStatuses: AssignmentStatus[];
	caseScores: CaseAccuracy[];
	recentMistakes: MistakeEntry[];
}

interface AssignmentRow {
	id: string;
	title: string;
	description: string | null;
	selectedCases: string[];
	selectedDrillTypes: string[];
	numberMode: string;
	contentMode: string;
	contentLevel: string | null;
	targetQuestions: number;
	dueDate: string | null;
	createdAt: string;
	completedCount: number;
	totalStudents: number;
	avgAccuracy: number | null;
	totalAttempted: number;
}

interface MistakeEntry {
	word: string;
	expectedForm: string;
	givenAnswer: string;
	case: string;
	number: string;
	sentence?: string;
	drillType?: string;
	prompt?: string;
	correctParadigm?: string;
	userParadigm?: string;
	correctCase?: string;
	userCase?: string | null;
	paradigmCorrect?: boolean;
	caseCorrect?: boolean | null;
	formCorrect?: boolean;
}

interface AggregatedMistake {
	word: string;
	expectedForm: string;
	givenAnswer: string;
	case: string;
	count: number;
}

function parseMistakes(raw: unknown): MistakeEntry[] {
	if (!Array.isArray(raw)) return [];
	const result: MistakeEntry[] = [];
	for (const m of raw) {
		if (
			isRecord(m) &&
			typeof m.word === 'string' &&
			typeof m.expectedForm === 'string' &&
			typeof m.givenAnswer === 'string' &&
			typeof m.case === 'string' &&
			typeof m.number === 'string'
		) {
			const entry: MistakeEntry = {
				word: m.word,
				expectedForm: m.expectedForm,
				givenAnswer: m.givenAnswer,
				case: m.case,
				number: m.number
			};
			if (typeof m.sentence === 'string') entry.sentence = m.sentence;
			if (typeof m.drillType === 'string') entry.drillType = m.drillType;
			if (typeof m.prompt === 'string') entry.prompt = m.prompt;
			if (typeof m.correctParadigm === 'string') entry.correctParadigm = m.correctParadigm;
			if (typeof m.userParadigm === 'string') entry.userParadigm = m.userParadigm;
			if (typeof m.correctCase === 'string') entry.correctCase = m.correctCase;
			if (typeof m.userCase === 'string') entry.userCase = m.userCase;
			else if (m.userCase === null) entry.userCase = null;
			if (typeof m.paradigmCorrect === 'boolean') entry.paradigmCorrect = m.paradigmCorrect;
			if (typeof m.caseCorrect === 'boolean') entry.caseCorrect = m.caseCorrect;
			else if (m.caseCorrect === null) entry.caseCorrect = null;
			if (typeof m.formCorrect === 'boolean') entry.formCorrect = m.formCorrect;
			result.push(entry);
		}
	}
	return result;
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classData, role } = await parent();
	const supabase = locals.supabase;

	// Create admin client for fetching emails and cross-user data
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		console.warn(
			'/classes/[id]: SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL is not configured; student display names and cross-user progress will be unavailable'
		);
	}
	const adminClient =
		supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

	// Fetch student roster
	const { data: memberships } = await supabase
		.from('class_memberships')
		.select('student_id, joined_at')
		.eq('class_id', classData.id)
		.order('joined_at', { ascending: true });

	const studentIds: string[] = [];
	if (Array.isArray(memberships)) {
		for (const m of memberships) {
			if (isRecord(m) && typeof m.student_id === 'string') {
				studentIds.push(m.student_id);
			}
		}
	}

	// Fetch display names from profiles using admin client (RLS prevents teacher from reading student profiles)
	const profileMap = new Map<string, string | null>();
	if (adminClient && studentIds.length > 0) {
		const { data: profiles } = await adminClient
			.from('profiles')
			.select('id, display_name')
			.in('id', studentIds);

		if (Array.isArray(profiles)) {
			for (const p of profiles) {
				if (isRecord(p) && typeof p.id === 'string') {
					profileMap.set(p.id, typeof p.display_name === 'string' ? p.display_name : null);
				}
			}
		}
	}

	// Fetch emails for all students via admin auth API using parallel getUserById calls
	// This is O(students) instead of O(total_users) since we look up each student directly
	const emailMap = new Map<string, string | null>();
	if (adminClient && studentIds.length > 0) {
		const userResults = await Promise.all(
			studentIds.map((id) => adminClient.auth.admin.getUserById(id))
		);
		for (const result of userResults) {
			if (result.data?.user) {
				const user = result.data.user;
				emailMap.set(user.id, typeof user.email === 'string' ? user.email : null);
			}
		}
	}

	// Fetch assignments
	const { data: assignmentData } = await supabase
		.from('assignments')
		.select(
			'id, title, description, selected_cases, selected_drill_types, number_mode, content_mode, content_level, target_questions, due_date, created_at'
		)
		.eq('class_id', classData.id)
		.order('created_at', { ascending: false });

	const assignmentIds: string[] = [];
	const assignmentTitleMap = new Map<string, string>();
	const assignmentTargetMap = new Map<string, number>();
	if (Array.isArray(assignmentData)) {
		for (const a of assignmentData) {
			if (isRecord(a) && typeof a.id === 'string' && typeof a.title === 'string') {
				assignmentIds.push(a.id);
				assignmentTitleMap.set(a.id, a.title);
				assignmentTargetMap.set(
					a.id,
					typeof a.target_questions === 'number' ? a.target_questions : 20
				);
			}
		}
	}

	// Fetch assignment progress (including mistakes and case_scores) for all students in this class
	const progressByStudentAssignment = new Map<string, Map<string, AssignmentStatus>>();
	const mistakesByStudent = new Map<string, MistakeEntry[]>();
	let allProgressData: unknown[] = [];
	if (assignmentIds.length > 0) {
		const { data: progressData } = await supabase
			.from('assignment_progress')
			.select(
				'assignment_id, student_id, questions_attempted, questions_correct, completed_at, mistakes, case_scores'
			)
			.in('assignment_id', assignmentIds);

		if (Array.isArray(progressData)) {
			allProgressData = progressData;
			for (const p of progressData) {
				if (
					isRecord(p) &&
					typeof p.assignment_id === 'string' &&
					typeof p.student_id === 'string'
				) {
					let studentMap = progressByStudentAssignment.get(p.student_id);
					if (!studentMap) {
						studentMap = new Map<string, AssignmentStatus>();
						progressByStudentAssignment.set(p.student_id, studentMap);
					}
					studentMap.set(p.assignment_id, {
						assignmentId: p.assignment_id,
						assignmentTitle: assignmentTitleMap.get(p.assignment_id) ?? 'Unknown',
						attempted: typeof p.questions_attempted === 'number' ? p.questions_attempted : 0,
						target: assignmentTargetMap.get(p.assignment_id) ?? 20,
						correct: typeof p.questions_correct === 'number' ? p.questions_correct : 0,
						completed: p.completed_at !== null && p.completed_at !== undefined
					});

					// Collect per-student mistakes for the expanded student panel
					if (role === 'teacher') {
						const studentMistakes = parseMistakes(p.mistakes);
						if (studentMistakes.length > 0) {
							const existing = mistakesByStudent.get(p.student_id) ?? [];
							existing.push(...studentMistakes);
							mistakesByStudent.set(p.student_id, existing);
						}
					}
				}
			}
		}
	}

	// Aggregate case_scores from assignment_progress per student (class-scoped accuracy)
	const assignmentCaseScoresMap = new Map<
		string,
		{ overallAccuracy: number | null; totalAttempts: number; caseScores: CaseAccuracy[] }
	>();
	{
		// Build a merged raw case_scores map per student from all assignment_progress rows
		const rawByStudent = new Map<string, Record<string, { attempts: number; correct: number }>>();
		for (const p of allProgressData) {
			if (isRecord(p) && typeof p.student_id === 'string' && isRecord(p.case_scores)) {
				let merged = rawByStudent.get(p.student_id);
				if (!merged) {
					merged = {};
					rawByStudent.set(p.student_id, merged);
				}
				for (const key of Object.keys(p.case_scores)) {
					const entry = p.case_scores[key];
					if (!isScoreEntry(entry)) continue;
					const existing = merged[key];
					if (existing) {
						existing.attempts += entry.attempts;
						existing.correct += entry.correct;
					} else {
						merged[key] = { attempts: entry.attempts, correct: entry.correct };
					}
				}
			}
		}
		for (const [sid, raw] of rawByStudent) {
			const { perCase, totalAttempts, totalCorrect } = aggregateCaseScores(raw);
			assignmentCaseScoresMap.set(sid, {
				overallAccuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : null,
				totalAttempts,
				caseScores: perCase
			});
		}
	}

	// Fetch user_progress (paradigm_scores only) for each student using admin client
	// (RLS prevents teacher from reading other users' progress)
	const classParadigmScores: Record<string, { attempts: number; correct: number }> = {};
	const paradigmStudentBreakdown: Record<
		string,
		{ struggling: string[]; ok: string[]; strong: string[] }
	> = {};
	const strugglingThreshold = classData.struggling_threshold ?? 50;

	if (adminClient && studentIds.length > 0 && role === 'teacher') {
		const { data: userProgressData } = await adminClient
			.from('user_progress')
			.select('user_id, paradigm_scores')
			.in('user_id', studentIds);

		if (Array.isArray(userProgressData)) {
			for (const up of userProgressData) {
				if (isRecord(up) && typeof up.user_id === 'string') {
					const studentName = profileMap.get(up.user_id) ?? emailMap.get(up.user_id) ?? 'Unknown';
					// Aggregate paradigm_scores across all students
					if (isRecord(up.paradigm_scores)) {
						for (const key of Object.keys(up.paradigm_scores)) {
							const entry = up.paradigm_scores[key];
							if (!isScoreEntry(entry)) continue;
							const existing = classParadigmScores[key];
							if (existing) {
								existing.attempts += entry.attempts;
								existing.correct += entry.correct;
							} else {
								classParadigmScores[key] = {
									attempts: entry.attempts,
									correct: entry.correct
								};
							}

							// Per-student breakdown by accuracy bucket
							if (entry.attempts > 0) {
								const pct = (entry.correct / entry.attempts) * 100;
								if (!paradigmStudentBreakdown[key]) {
									paradigmStudentBreakdown[key] = {
										struggling: [],
										ok: [],
										strong: []
									};
								}
								const bucket = paradigmStudentBreakdown[key];
								if (pct < strugglingThreshold) {
									bucket.struggling.push(studentName);
								} else if (pct < 80) {
									bucket.ok.push(studentName);
								} else {
									bucket.strong.push(studentName);
								}
							}
						}
					}
				}
			}
		}
	}

	// Build student rows
	const students: StudentRow[] = [];
	if (Array.isArray(memberships)) {
		for (const m of memberships) {
			if (isRecord(m) && typeof m.student_id === 'string' && typeof m.joined_at === 'string') {
				const sid = m.student_id;
				const progress = assignmentCaseScoresMap.get(sid);
				const studentAssignmentMap = progressByStudentAssignment.get(sid);

				// Build assignment statuses for all assignments (including ones not started)
				const assignmentStatuses: AssignmentStatus[] = [];
				for (const aId of assignmentIds) {
					const existing = studentAssignmentMap?.get(aId);
					if (existing) {
						assignmentStatuses.push(existing);
					} else {
						assignmentStatuses.push({
							assignmentId: aId,
							assignmentTitle: assignmentTitleMap.get(aId) ?? 'Unknown',
							attempted: 0,
							target: assignmentTargetMap.get(aId) ?? 20,
							correct: 0,
							completed: false
						});
					}
				}

				// Take up to 15 most recent mistakes for this student
				const studentMistakes = mistakesByStudent.get(sid) ?? [];
				const recentMistakes = studentMistakes.slice(-15).reverse();

				students.push({
					studentId: sid,
					displayName: profileMap.get(sid) ?? null,
					email: emailMap.get(sid) ?? null,
					joinedAt: m.joined_at,
					overallAccuracy: progress?.overallAccuracy ?? null,
					totalAttempts: progress?.totalAttempts ?? 0,
					assignmentStatuses,
					caseScores: progress?.caseScores ?? [],
					recentMistakes
				});
			}
		}
	}

	// Build assignments list with completion counts and average accuracy
	const completionMap = new Map<string, number>();
	const accuracyMap = new Map<string, { totalAttempted: number; totalCorrect: number }>();
	for (const [, studentMap] of progressByStudentAssignment) {
		for (const [aId, status] of studentMap) {
			if (status.completed) {
				completionMap.set(aId, (completionMap.get(aId) ?? 0) + 1);
			}
			if (status.attempted > 0) {
				const existing = accuracyMap.get(aId) ?? { totalAttempted: 0, totalCorrect: 0 };
				existing.totalAttempted += status.attempted;
				existing.totalCorrect += status.correct;
				accuracyMap.set(aId, existing);
			}
		}
	}

	const totalStudents = students.length;
	const assignments: AssignmentRow[] = [];
	if (Array.isArray(assignmentData)) {
		for (const a of assignmentData) {
			if (isRecord(a) && typeof a.id === 'string' && typeof a.title === 'string') {
				assignments.push({
					id: a.id,
					title: a.title,
					description: typeof a.description === 'string' ? a.description : null,
					selectedCases: toStringArray(a.selected_cases),
					selectedDrillTypes: toStringArray(a.selected_drill_types),
					numberMode: typeof a.number_mode === 'string' ? a.number_mode : 'both',
					contentMode: typeof a.content_mode === 'string' ? a.content_mode : 'both',
					contentLevel: typeof a.content_level === 'string' ? a.content_level : null,
					targetQuestions: typeof a.target_questions === 'number' ? a.target_questions : 20,
					dueDate: typeof a.due_date === 'string' ? a.due_date : null,
					createdAt: typeof a.created_at === 'string' ? a.created_at : '',
					completedCount: completionMap.get(a.id) ?? 0,
					totalStudents,
					avgAccuracy: accuracyMap.has(a.id)
						? Math.round(
								(accuracyMap.get(a.id)!.totalCorrect / accuracyMap.get(a.id)!.totalAttempted) * 100
							)
						: null,
					totalAttempted: accuracyMap.get(a.id)?.totalAttempted ?? 0
				});
			}
		}
	}

	// Fetch student's own stats if role is student
	let studentStats: {
		overallAccuracy: number | null;
		totalAttempts: number;
		caseScores: CaseAccuracy[];
		assignmentsCompleted: number;
		assignmentsTotal: number;
	} | null = null;

	if (role === 'student' && locals.user) {
		const userId = locals.user.id;

		// Use assignment-scoped case_scores aggregated from assignment_progress
		const ownProgress = assignmentCaseScoresMap.get(userId);

		// Count completed assignments for this student
		let assignmentsCompleted = 0;
		const studentAssignmentMap = progressByStudentAssignment.get(userId);
		if (studentAssignmentMap) {
			for (const [, status] of studentAssignmentMap) {
				if (status.completed) {
					assignmentsCompleted++;
				}
			}
		}

		studentStats = {
			overallAccuracy: ownProgress?.overallAccuracy ?? null,
			totalAttempts: ownProgress?.totalAttempts ?? 0,
			caseScores: ownProgress?.caseScores ?? [],
			assignmentsCompleted,
			assignmentsTotal: assignmentIds.length
		};
	}

	// Fetch progress snapshots for the class (last 30 days)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const snapshotDateFrom = thirtyDaysAgo.toISOString().slice(0, 10);

	interface ProgressSnapshot {
		studentId: string;
		snapshotDate: string;
		overallAccuracy: number | null;
		totalQuestions: number;
		nomAccuracy: number | null;
		genAccuracy: number | null;
		datAccuracy: number | null;
		accAccuracy: number | null;
		vocAccuracy: number | null;
		locAccuracy: number | null;
		insAccuracy: number | null;
	}

	const progressSnapshots: ProgressSnapshot[] = [];

	if (adminClient) {
		const { data: snapshotData } = await adminClient
			.from('class_progress_snapshots')
			.select(
				'student_id, snapshot_date, overall_accuracy, total_questions, nom_accuracy, gen_accuracy, dat_accuracy, acc_accuracy, voc_accuracy, loc_accuracy, ins_accuracy'
			)
			.eq('class_id', classData.id)
			.gte('snapshot_date', snapshotDateFrom)
			.order('snapshot_date', { ascending: true });

		if (Array.isArray(snapshotData)) {
			for (const s of snapshotData) {
				if (
					isRecord(s) &&
					typeof s.student_id === 'string' &&
					typeof s.snapshot_date === 'string'
				) {
					// For students, only include their own snapshots
					if (role === 'student' && locals.user && s.student_id !== locals.user.id) {
						continue;
					}
					progressSnapshots.push({
						studentId: s.student_id,
						snapshotDate: s.snapshot_date,
						overallAccuracy: typeof s.overall_accuracy === 'number' ? s.overall_accuracy : null,
						totalQuestions: typeof s.total_questions === 'number' ? s.total_questions : 0,
						nomAccuracy: typeof s.nom_accuracy === 'number' ? s.nom_accuracy : null,
						genAccuracy: typeof s.gen_accuracy === 'number' ? s.gen_accuracy : null,
						datAccuracy: typeof s.dat_accuracy === 'number' ? s.dat_accuracy : null,
						accAccuracy: typeof s.acc_accuracy === 'number' ? s.acc_accuracy : null,
						vocAccuracy: typeof s.voc_accuracy === 'number' ? s.voc_accuracy : null,
						locAccuracy: typeof s.loc_accuracy === 'number' ? s.loc_accuracy : null,
						insAccuracy: typeof s.ins_accuracy === 'number' ? s.ins_accuracy : null
					});
				}
			}
		}
	}

	// Compute live "today" snapshots from current user_progress data so the chart
	// shows same-day progress without waiting for the daily cron snapshot.
	const today = new Date().toISOString().slice(0, 10);

	function caseAccuracyToSnapshot(
		studentId: string,
		caseScores: CaseAccuracy[],
		overallAccuracy: number | null,
		totalAttempts: number
	): ProgressSnapshot {
		const caseMap = new Map<string, number | null>();
		for (const cs of caseScores) {
			caseMap.set(cs.case, cs.attempts > 0 ? cs.accuracy : null);
		}
		return {
			studentId,
			snapshotDate: today,
			overallAccuracy,
			totalQuestions: totalAttempts,
			nomAccuracy: caseMap.get('nom') ?? null,
			genAccuracy: caseMap.get('gen') ?? null,
			datAccuracy: caseMap.get('dat') ?? null,
			accAccuracy: caseMap.get('acc') ?? null,
			vocAccuracy: caseMap.get('voc') ?? null,
			locAccuracy: caseMap.get('loc') ?? null,
			insAccuracy: caseMap.get('ins') ?? null
		};
	}

	// Remove any cron snapshot for today (it would be stale compared to live data)
	const historicalSnapshots = progressSnapshots.filter((s) => s.snapshotDate !== today);

	// Build live today snapshots
	const todaySnapshots: ProgressSnapshot[] = [];

	if (role === 'teacher') {
		// Create a today data point for each student from assignmentCaseScoresMap
		for (const sid of studentIds) {
			const progress = assignmentCaseScoresMap.get(sid);
			if (progress && progress.totalAttempts > 0) {
				todaySnapshots.push(
					caseAccuracyToSnapshot(
						sid,
						progress.caseScores,
						progress.overallAccuracy,
						progress.totalAttempts
					)
				);
			}
		}
	} else if (role === 'student' && locals.user && studentStats && studentStats.totalAttempts > 0) {
		todaySnapshots.push(
			caseAccuracyToSnapshot(
				locals.user.id,
				studentStats.caseScores,
				studentStats.overallAccuracy,
				studentStats.totalAttempts
			)
		);
	}

	const allSnapshots = [...historicalSnapshots, ...todaySnapshots];

	// Aggregate common mistakes from the already-fetched per-student mistakes (teacher only)
	let commonMistakes: AggregatedMistake[] = [];
	if (role === 'teacher') {
		const freqMap = new Map<
			string,
			{ word: string; expectedForm: string; givenAnswer: string; case: string; count: number }
		>();
		for (const [, studentMistakes] of mistakesByStudent) {
			for (const m of studentMistakes) {
				const key = `${m.word}|${m.expectedForm}|${m.givenAnswer}|${m.case}`;
				const existing = freqMap.get(key);
				if (existing) {
					existing.count += 1;
				} else {
					freqMap.set(key, {
						word: m.word,
						expectedForm: m.expectedForm,
						givenAnswer: m.givenAnswer,
						case: m.case,
						count: 1
					});
				}
			}
		}
		commonMistakes = [...freqMap.values()].sort((a, b) => b.count - a.count).slice(0, 20);
	}

	return {
		students,
		assignments,
		role,
		studentStats,
		progressSnapshots: allSnapshots,
		...(role === 'teacher' ? { classParadigmScores, paradigmStudentBreakdown, commonMistakes } : {})
	};
};

export const actions: Actions = {
	archive: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can archive this class.' });
		}

		const { error: archiveError } = await supabase
			.from('classes')
			.update({ archived: true })
			.eq('id', classId);

		if (archiveError) {
			return fail(500, { message: 'Failed to archive class.' });
		}

		redirect(303, resolve('/classes'));
	},

	unarchive: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can unarchive this class.' });
		}

		const { error: unarchiveError } = await supabase
			.from('classes')
			.update({ archived: false })
			.eq('id', classId);

		if (unarchiveError) {
			return fail(500, { message: 'Failed to unarchive class.' });
		}

		return { success: true, action: 'unarchived' };
	},

	deleteClass: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can delete this class.' });
		}

		const { error: deleteError } = await supabase.from('classes').delete().eq('id', classId);

		if (deleteError) {
			return fail(500, { message: 'Failed to delete class.' });
		}

		redirect(303, resolve('/classes'));
	},

	removeStudent: async ({ request, locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const studentId = (formData.get('studentId') ?? '').toString();

		if (!studentId) {
			return fail(400, { message: 'Student ID is required.' });
		}

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can remove students.' });
		}

		// Collect assignment IDs for this class so we can purge the student's
		// assignment_progress rows (otherwise ghost rows linger after removal).
		const { data: classAssignments } = await supabase
			.from('assignments')
			.select('id')
			.eq('class_id', classId);

		const classAssignmentIds: string[] = [];
		if (Array.isArray(classAssignments)) {
			for (const row of classAssignments) {
				if (isRecord(row) && typeof row.id === 'string') {
					classAssignmentIds.push(row.id);
				}
			}
		}

		if (classAssignmentIds.length > 0) {
			const { error: progressDeleteError } = await supabase
				.from('assignment_progress')
				.delete()
				.eq('student_id', studentId)
				.in('assignment_id', classAssignmentIds);

			if (progressDeleteError) {
				return fail(500, { message: 'Failed to remove student.' });
			}
		}

		const { error: removeError } = await supabase
			.from('class_memberships')
			.delete()
			.eq('class_id', classId)
			.eq('student_id', studentId);

		if (removeError) {
			return fail(500, { message: 'Failed to remove student.' });
		}

		return { success: true, action: 'removed' };
	},

	leaveClass: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		const { data, error } = await supabase
			.from('class_memberships')
			.delete()
			.eq('class_id', classId)
			.eq('student_id', user.id)
			.select('class_id');

		if (error) return fail(500, { message: 'Failed to leave class.' });
		if (!Array.isArray(data) || data.length === 0) {
			return fail(500, { message: 'Failed to leave class. Please try again.' });
		}

		redirect(303, resolve('/classes'));
	},

	regenerateCode: async ({ locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify teacher ownership
		const { data: classData } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can regenerate the class code.' });
		}

		// Postgres function generate_class_code() (migration 005) handles collision internally
		const { data: generatedCode, error: rpcError } = await supabase.rpc('generate_class_code');

		if (rpcError || typeof generatedCode !== 'string' || generatedCode.length !== 6) {
			return fail(500, { message: 'Failed to regenerate class code. Please try again.' });
		}

		const { error: updateError } = await supabase
			.from('classes')
			.update({ class_code: generatedCode })
			.eq('id', classId);

		if (updateError) {
			return fail(500, { message: 'Failed to regenerate class code. Please try again.' });
		}

		return { success: true, action: 'codeRegenerated', classCode: generatedCode };
	}
};
