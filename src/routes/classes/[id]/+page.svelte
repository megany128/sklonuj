<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { CASE_LABELS, DRILL_TYPE_LABELS } from '$lib/types';
	import type { Case, DrillType } from '$lib/types';

	const ALL_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	interface ClassData {
		id: string;
		teacher_id: string;
		name: string;
		class_code: string;
		level: string;
		archived: boolean;
		created_at: string;
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
	}

	interface AssignmentRow {
		id: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		targetQuestions: number;
		dueDate: string | null;
		createdAt: string;
		completedCount: number;
		totalStudents: number;
	}

	function isClassData(v: unknown): v is ClassData {
		if (!isRecord(v)) return false;
		return typeof v.id === 'string' && typeof v.name === 'string';
	}

	function isAssignmentStatus(v: unknown): v is AssignmentStatus {
		if (!isRecord(v)) return false;
		return (
			typeof v.assignmentId === 'string' &&
			typeof v.assignmentTitle === 'string' &&
			typeof v.attempted === 'number' &&
			typeof v.target === 'number' &&
			typeof v.correct === 'number' &&
			typeof v.completed === 'boolean'
		);
	}

	function isCaseAccuracy(v: unknown): v is CaseAccuracy {
		if (!isRecord(v)) return false;
		return (
			typeof v.case === 'string' &&
			typeof v.attempts === 'number' &&
			typeof v.correct === 'number' &&
			typeof v.accuracy === 'number'
		);
	}

	function isStudentArray(v: unknown): v is StudentRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.studentId === 'string' &&
				typeof item.joinedAt === 'string' &&
				(item.overallAccuracy === null || typeof item.overallAccuracy === 'number') &&
				typeof item.totalAttempts === 'number' &&
				Array.isArray(item.assignmentStatuses) &&
				item.assignmentStatuses.every((s: unknown) => isAssignmentStatus(s)) &&
				Array.isArray(item.caseScores) &&
				item.caseScores.every((c: unknown) => isCaseAccuracy(c))
		);
	}

	function isAssignmentArray(v: unknown): v is AssignmentRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string'
		);
	}

	function isCaseKey(v: string): v is Case {
		return v in CASE_LABELS;
	}

	function isDrillTypeKey(v: string): v is DrillType {
		return v in DRILL_TYPE_LABELS;
	}

	let classData = $derived.by(() => {
		const val: unknown = $page.data.classData;
		return isClassData(val) ? val : null;
	});

	let role = $derived.by(() => {
		const val: unknown = $page.data.role;
		return val === 'teacher' || val === 'student' ? val : 'student';
	});

	let students = $derived.by(() => {
		const val: unknown = $page.data.students;
		return isStudentArray(val) ? val : [];
	});

	let assignments = $derived.by(() => {
		const val: unknown = $page.data.assignments;
		return isAssignmentArray(val) ? val : [];
	});

	// Class-level stats
	let avgClassAccuracy = $derived.by(() => {
		const withProgress = students.filter((s) => s.overallAccuracy !== null);
		if (withProgress.length === 0) return null;
		const sum = withProgress.reduce((acc, s) => acc + (s.overallAccuracy ?? 0), 0);
		return sum / withProgress.length;
	});

	let avgCompletionRate = $derived.by(() => {
		if (assignments.length === 0 || students.length === 0) return null;
		const totalPossible = assignments.length * students.length;
		const totalCompleted = assignments.reduce((acc, a) => acc + a.completedCount, 0);
		return (totalCompleted / totalPossible) * 100;
	});

	let expandedStudents = $state(new Set<string>());
	function toggleStudent(id: string) {
		if (expandedStudents.has(id)) {
			expandedStudents = new Set([...expandedStudents].filter((s) => s !== id));
		} else {
			expandedStudents = new Set([...expandedStudents, id]);
		}
	}

	let codeCopied = $state(false);
	let confirmingArchive = $state(false);
	let confirmingRemoveStudentId = $state<string | null>(null);
	let removeSuccessMessage = $state<string | null>(null);
	let removeSuccessTimer: ReturnType<typeof setTimeout> | null = null;

	function copyCode() {
		if (!classData) return;
		navigator.clipboard.writeText(classData.class_code);
		codeCopied = true;
		setTimeout(() => {
			codeCopied = false;
		}, 2000);
	}

	function formatDueDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const isPast = date < now;
		const formatted = date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
		});
		return isPast ? `Overdue (${formatted})` : `Due ${formatted}`;
	}

	function studentDisplayName(student: StudentRow): string {
		if (student.displayName) return student.displayName;
		if (student.email) return student.email;
		return 'Anonymous';
	}

	function formatAccuracy(accuracy: number | null): string {
		if (accuracy === null) return 'No data';
		return `${Math.round(accuracy)}%`;
	}

	/** Get accuracy color class based on percentage */
	function caseAccuracyColor(accuracy: number): string {
		if (accuracy > 70) return 'bg-green-100 text-green-700';
		if (accuracy >= 40) return 'bg-yellow-100 text-yellow-700';
		return 'bg-red-100 text-red-700';
	}

	/** Look up a case score from array */
	function findCaseScore(scores: CaseAccuracy[], caseKey: string): CaseAccuracy | undefined {
		return scores.find((s) => s.case === caseKey);
	}

	/** CSV export */
	function exportCsv() {
		if (!classData) return;

		const headers = [
			'Student Name',
			'Email',
			'Assignment Title',
			'Questions Attempted',
			'Questions Correct',
			'Accuracy %',
			'Status',
			'Due Date'
		];

		const rows: string[][] = [];
		for (const student of students) {
			const name = studentDisplayName(student);
			const email = student.email ?? '';
			if (student.assignmentStatuses.length === 0) {
				rows.push([name, email, '', '0', '0', '', 'No assignments', '']);
			} else {
				for (const status of student.assignmentStatuses) {
					const accuracyPct =
						status.attempted > 0
							? Math.round((status.correct / status.attempted) * 100).toString()
							: '';
					const statusLabel = status.completed
						? 'Completed'
						: status.attempted > 0
							? 'In Progress'
							: 'Not Started';
					// Find matching assignment for due date
					const matchingAssignment = assignments.find((a) => a.id === status.assignmentId);
					const dueDate = matchingAssignment?.dueDate
						? new Date(matchingAssignment.dueDate).toLocaleDateString()
						: '';
					rows.push([
						name,
						email,
						status.assignmentTitle,
						status.attempted.toString(),
						status.correct.toString(),
						accuracyPct,
						statusLabel,
						dueDate
					]);
				}
			}
		}

		const escapeCsvField = (field: string): string => {
			if (field.includes(',') || field.includes('"') || field.includes('\n')) {
				return `"${field.replace(/"/g, '""')}"`;
			}
			return field;
		};

		const csvContent = [headers, ...rows]
			.map((row) => row.map(escapeCsvField).join(','))
			.join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${classData.name.replace(/[^a-zA-Z0-9]/g, '_')}_progress.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>{classData?.name ?? 'Class'} - Skloňuj</title>
</svelte:head>

<NavBar user={$page.data.user} />

{#if classData}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<a
			href={resolve('/classes')}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to Classes
		</a>

		{#if classData.archived && role === 'teacher'}
			<div
				class="mb-4 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
			>
				This class has been archived. Students can no longer access it.
			</div>
		{/if}

		{#if removeSuccessMessage}
			<div
				class="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
			>
				{removeSuccessMessage}
			</div>
		{/if}

		<div class="mb-6 rounded-2xl border border-card-stroke bg-card-bg p-6">
			<div class="flex items-start justify-between">
				<div class="flex items-center gap-2">
					<h1 class="text-xl font-semibold text-text-default">{classData.name}</h1>
					{#if role === 'teacher' && !classData.archived}
						<a
							href={resolve(`/classes/${classData.id}/edit`)}
							class="inline-flex items-center justify-center rounded-full p-1.5 text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
							title="Edit class"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z"
								/>
								<path
									d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z"
								/>
							</svg>
						</a>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={copyCode}
						class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 font-mono text-xs text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						{codeCopied ? 'Copied!' : classData.class_code}
					</button>
				</div>
			</div>
			<p class="mt-1 text-sm text-text-subtitle">
				Level {classData.level} &middot; {students.length}
				{students.length === 1 ? 'student' : 'students'}
			</p>

			{#if role === 'teacher' && !classData.archived}
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<a
						href={resolve(`/classes/${classData.id}/invite`)}
						class="rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						Invite Students
					</a>
					<a
						href={resolve(`/classes/${classData.id}/assignments/new`)}
						class="rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
					>
						Create Assignment
					</a>
					<button
						type="button"
						onclick={exportCsv}
						class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						Export Progress
					</button>
					{#if confirmingArchive}
						<span class="text-xs text-text-subtitle">Archive this class?</span>
						<form method="POST" action="?/archive" use:enhance>
							<button
								type="submit"
								class="cursor-pointer rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
							>
								Yes, Archive
							</button>
						</form>
						<button
							type="button"
							onclick={() => (confirmingArchive = false)}
							class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:text-text-default"
						>
							Cancel
						</button>
					{:else}
						<button
							type="button"
							onclick={() => (confirmingArchive = true)}
							class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-red-300 hover:text-red-500"
						>
							Archive Class
						</button>
					{/if}
				</div>
			{/if}

			{#if role === 'teacher' && classData.archived}
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<form method="POST" action="?/unarchive" use:enhance>
						<button
							type="submit"
							class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Unarchive Class
						</button>
					</form>
				</div>
			{/if}
		</div>

		<!-- Class Stats Summary -->
		{#if role === 'teacher'}
			<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="rounded-xl bg-shaded-background p-3 text-center">
					<p class="text-2xl font-bold text-text-default">{students.length}</p>
					<p class="text-xs text-text-subtitle">Students</p>
				</div>
				<div class="rounded-xl bg-shaded-background p-3 text-center">
					<p class="text-2xl font-bold text-text-default">
						{avgClassAccuracy !== null ? `${Math.round(avgClassAccuracy)}%` : '--'}
					</p>
					<p class="text-xs text-text-subtitle">Avg Accuracy</p>
				</div>
				<div class="rounded-xl bg-shaded-background p-3 text-center">
					<p class="text-2xl font-bold text-text-default">{assignments.length}</p>
					<p class="text-xs text-text-subtitle">Assignments</p>
				</div>
				<div class="rounded-xl bg-shaded-background p-3 text-center">
					<p class="text-2xl font-bold text-text-default">
						{avgCompletionRate !== null ? `${Math.round(avgCompletionRate)}%` : '--'}
					</p>
					<p class="text-xs text-text-subtitle">Completion Rate</p>
				</div>
			</div>
		{/if}

		<!-- Student Roster -->
		<div class="mb-6">
			<h2 class="mb-3 text-lg font-semibold text-text-default">
				Students ({students.length})
			</h2>
			{#if students.length === 0}
				<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
					<p class="text-sm text-text-subtitle">No students have joined yet.</p>
					{#if role === 'teacher'}
						<p class="mt-1 text-sm text-text-subtitle">
							Share the class code <span class="font-mono font-semibold"
								>{classData.class_code}</span
							> with your students.
						</p>
					{/if}
				</div>
			{:else}
				<div class="overflow-hidden rounded-2xl border border-card-stroke bg-card-bg">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-card-stroke bg-shaded-background">
								{#if role === 'teacher'}
									<th class="w-8 px-2 py-3"></th>
								{/if}
								<th class="px-4 py-3 text-left font-medium text-text-subtitle">Name</th>
								<th class="px-4 py-3 text-left font-medium text-text-subtitle">Joined</th>
								{#if role === 'teacher'}
									<th class="px-4 py-3 text-left font-medium text-text-subtitle">Accuracy</th>
									<th class="px-4 py-3 text-left font-medium text-text-subtitle">Practiced</th>
									{#if !classData.archived}
										<th class="w-16 px-2 py-3"></th>
									{/if}
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each students as student (student.studentId)}
								<tr
									class="border-b border-card-stroke last:border-b-0 {role === 'teacher'
										? 'cursor-pointer transition-colors hover:bg-shaded-background/50'
										: ''}"
									onclick={role === 'teacher' ? () => toggleStudent(student.studentId) : undefined}
								>
									{#if role === 'teacher'}
										<td class="px-2 py-3 text-center text-text-subtitle">
											<span
												class="inline-block transition-transform {expandedStudents.has(
													student.studentId
												)
													? 'rotate-90'
													: ''}"
											>
												&#9654;
											</span>
										</td>
									{/if}
									<td class="px-4 py-3 text-text-default">
										{studentDisplayName(student)}
									</td>
									<td class="px-4 py-3 text-text-subtitle">
										{new Date(student.joinedAt).toLocaleDateString()}
									</td>
									{#if role === 'teacher'}
										<td class="px-4 py-3 text-text-subtitle">
											{formatAccuracy(student.overallAccuracy)}
										</td>
										<td class="px-4 py-3 text-text-subtitle">
											{student.totalAttempts}
										</td>
										{#if !classData.archived}
											<td class="px-2 py-3">
												{#if confirmingRemoveStudentId === student.studentId}
													<form
														method="POST"
														action="?/removeStudent"
														use:enhance={() => {
															return async ({ result, update }) => {
																if (result.type === 'success') {
																	const name = studentDisplayName(student);
																	removeSuccessMessage = `${name} has been removed from the class.`;
																	if (removeSuccessTimer) clearTimeout(removeSuccessTimer);
																	removeSuccessTimer = setTimeout(() => {
																		removeSuccessMessage = null;
																	}, 3000);
																}
																confirmingRemoveStudentId = null;
																await update();
															};
														}}
													>
														<input type="hidden" name="studentId" value={student.studentId} />
														<button
															type="submit"
															class="cursor-pointer text-xs text-red-600 hover:underline"
															onclick={(e) => e.stopPropagation()}
														>
															Confirm
														</button>
													</form>
												{:else}
													<button
														type="button"
														class="cursor-pointer text-xs text-text-subtitle hover:text-red-500"
														onclick={(e) => {
															e.stopPropagation();
															confirmingRemoveStudentId = student.studentId;
														}}
													>
														Remove
													</button>
												{/if}
											</td>
										{/if}
									{/if}
								</tr>
								{#if role === 'teacher' && expandedStudents.has(student.studentId)}
									<tr class="border-b border-card-stroke last:border-b-0">
										<td
											colspan={role === 'teacher' ? (classData.archived ? 5 : 6) : 2}
											class="bg-shaded-background px-4 py-4"
										>
											<div class="space-y-4">
												<!-- Per-case accuracy breakdown -->
												<div>
													<h4
														class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
													>
														Case Accuracy
													</h4>
													<div class="grid grid-cols-7 gap-1.5">
														{#each ALL_CASES as c (c)}
															{@const score = findCaseScore(student.caseScores, c)}
															<div
																class="rounded-lg p-2 text-center {score
																	? caseAccuracyColor(score.accuracy)
																	: 'bg-shaded-background text-text-subtitle'}"
															>
																<p class="text-[10px] font-medium uppercase">
																	{CASE_LABELS[c].slice(0, 3)}
																</p>
																<p class="text-sm font-bold">
																	{score ? `${Math.round(score.accuracy)}%` : '--'}
																</p>
																{#if score}
																	<p class="text-[9px] opacity-70">
																		{score.correct}/{score.attempts}
																	</p>
																{/if}
															</div>
														{/each}
													</div>
												</div>

												<!-- Assignment progress -->
												<div>
													<h4
														class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
													>
														Assignment Progress
													</h4>
													{#if student.assignmentStatuses.length === 0}
														<p class="text-sm text-text-subtitle">No assignments yet.</p>
													{:else}
														<div class="space-y-2">
															{#each student.assignmentStatuses as status (status.assignmentId)}
																<div class="rounded-lg bg-card-bg p-3">
																	<div class="flex items-center justify-between">
																		<span class="text-sm font-medium text-text-default">
																			{status.assignmentTitle}
																		</span>
																		<span
																			class="rounded-full px-2 py-0.5 text-xs font-medium {status.completed
																				? 'bg-positive-stroke/20 text-positive-stroke'
																				: 'bg-shaded-background text-text-subtitle'}"
																		>
																			{status.completed ? 'Completed' : 'In Progress'}
																		</span>
																	</div>
																	<div
																		class="mt-2 flex items-center gap-3 text-xs text-text-subtitle"
																	>
																		<span>
																			{status.attempted}/{status.target} questions
																		</span>
																		<span>
																			{status.attempted > 0
																				? `${Math.round((status.correct / status.attempted) * 100)}% correct`
																				: 'Not started'}
																		</span>
																	</div>
																	<div
																		class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-shaded-background"
																	>
																		<div
																			class="h-full rounded-full {status.completed
																				? 'bg-positive-stroke'
																				: 'bg-emphasis'}"
																			style="width: {Math.min(
																				100,
																				(status.attempted / Math.max(1, status.target)) * 100
																			)}%"
																		></div>
																	</div>
																</div>
															{/each}
														</div>
													{/if}
												</div>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Assignments -->
		<div>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-text-default">
					Assignments ({assignments.length})
				</h2>
				{#if role === 'teacher' && assignments.length > 0}
					<a
						href={resolve(`/classes/${classData.id}/assignments/new`)}
						class="rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						+ New Assignment
					</a>
				{/if}
			</div>

			{#if assignments.length === 0}
				<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
					<p class="text-sm text-text-subtitle">No assignments yet.</p>
					{#if role === 'teacher'}
						<a
							href={resolve(`/classes/${classData.id}/assignments/new`)}
							class="mt-2 inline-block rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
						>
							Create First Assignment
						</a>
					{/if}
				</div>
			{:else}
				<div class="space-y-3">
					{#each assignments as assignment (assignment.id)}
						<a
							href={resolve(`/classes/${classData.id}/assignments/${assignment.id}`)}
							class="block rounded-2xl border border-card-stroke bg-card-bg p-4 transition-colors hover:border-emphasis"
						>
							<div class="flex items-start justify-between">
								<div>
									<h3 class="font-semibold text-text-default">{assignment.title}</h3>
									{#if assignment.description}
										<p class="mt-0.5 text-sm text-text-subtitle">
											{assignment.description}
										</p>
									{/if}
									<div class="mt-2 flex flex-wrap gap-1">
										{#each assignment.selectedCases as c (c)}
											{#if isCaseKey(c)}
												<span
													class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
												>
													{CASE_LABELS[c]}
												</span>
											{/if}
										{/each}
										{#each assignment.selectedDrillTypes as dt (dt)}
											{#if isDrillTypeKey(dt)}
												<span
													class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
												>
													{DRILL_TYPE_LABELS[dt]}
												</span>
											{/if}
										{/each}
									</div>
								</div>
								<div class="flex flex-col items-end gap-1">
									{#if assignment.dueDate}
										<span
											class="text-xs {new Date(assignment.dueDate) < new Date()
												? 'text-red-500'
												: 'text-text-subtitle'}"
										>
											{formatDueDate(assignment.dueDate)}
										</span>
									{/if}
									<span class="text-xs text-text-subtitle">
										{assignment.completedCount}/{assignment.totalStudents} completed
									</span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
