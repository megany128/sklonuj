<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { CASE_LABELS, DRILL_TYPE_LABELS } from '$lib/types';
	import type { Case, DrillType } from '$lib/types';

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	interface AssignmentDetail {
		id: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		targetQuestions: number;
		minAccuracy: number | null;
		dueDate: string | null;
		createdAt: string;
	}

	interface CaseAccuracy {
		case: string;
		attempts: number;
		correct: number;
		accuracy: number;
	}

	interface MistakeEntry {
		word: string;
		expectedForm: string;
		givenAnswer: string;
		case: string;
		number: string;
	}

	interface StudentProgress {
		studentId: string;
		displayName: string | null;
		questionsAttempted: number;
		questionsCorrect: number;
		completedAt: string | null;
		caseScores: CaseAccuracy[];
		mistakes: MistakeEntry[];
	}

	function isAssignment(v: unknown): v is AssignmentDetail {
		if (!isRecord(v)) return false;
		return typeof v.id === 'string' && typeof v.title === 'string';
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

	function isMistakeEntry(v: unknown): v is MistakeEntry {
		if (!isRecord(v)) return false;
		return (
			typeof v.word === 'string' &&
			typeof v.expectedForm === 'string' &&
			typeof v.givenAnswer === 'string' &&
			typeof v.case === 'string' &&
			typeof v.number === 'string'
		);
	}

	function isProgressArray(v: unknown): v is StudentProgress[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.studentId === 'string' &&
				typeof item.questionsAttempted === 'number' &&
				Array.isArray(item.caseScores) &&
				item.caseScores.every((c: unknown) => isCaseAccuracy(c)) &&
				Array.isArray(item.mistakes) &&
				item.mistakes.every((m: unknown) => isMistakeEntry(m))
		);
	}

	function isCaseKey(v: string): v is Case {
		return v in CASE_LABELS;
	}

	function isDrillTypeKey(v: string): v is DrillType {
		return v in DRILL_TYPE_LABELS;
	}

	let classData = $derived.by(() => {
		const val: unknown = page.data.classData;
		if (isRecord(val) && typeof val.id === 'string') {
			return { id: val.id, name: typeof val.name === 'string' ? val.name : '' };
		}
		return null;
	});

	let role = $derived.by(() => {
		const val: unknown = page.data.role;
		return val === 'teacher' || val === 'student' ? val : 'student';
	});

	let assignment = $derived.by(() => {
		const val: unknown = page.data.assignment;
		return isAssignment(val) ? val : null;
	});

	let studentProgress = $derived.by(() => {
		const val: unknown = page.data.studentProgress;
		return isProgressArray(val) ? val : [];
	});

	/** The cases relevant to this assignment */
	let assignmentCases = $derived.by((): Case[] => {
		if (!assignment) return [];
		const cases = assignment.selectedCases.filter((c): c is Case => isCaseKey(c));
		if (cases.length > 0) return cases;
		const defaults: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
		return defaults;
	});

	function numberModeLabel(mode: string): string {
		if (mode === 'sg') return 'Singular';
		if (mode === 'pl') return 'Plural';
		return 'Both';
	}

	function contentModeLabel(mode: string): string {
		if (mode === 'nouns') return 'Nouns';
		if (mode === 'pronouns') return 'Pronouns';
		return 'Both';
	}

	let confirmingDelete = $state(false);
	let duplicating = $state(false);
	let retrying = $state(false);
	let showMistakes = $state(false);

	function caseLabelFromKey(key: string): string {
		if (isCaseKey(key)) return CASE_LABELS[key];
		return key;
	}

	function numberLabel(n: string): string {
		if (n === 'sg') return 'Singular';
		if (n === 'pl') return 'Plural';
		return n;
	}

	function cappedAttempted(attempted: number): number {
		if (!assignment) return attempted;
		return Math.min(attempted, assignment.targetQuestions);
	}

	function accuracy(attempted: number, correct: number): string {
		if (attempted === 0) return '-';
		return `${Math.round((correct / attempted) * 100)}%`;
	}

	function caseAccuracyColor(pct: number): string {
		if (pct > 70) return 'bg-positive-background text-positive-stroke';
		if (pct >= 40) return 'bg-warning-background text-warning-text';
		return 'bg-negative-background text-negative-stroke';
	}

	function findCaseScore(scores: CaseAccuracy[], caseKey: string): CaseAccuracy | undefined {
		return scores.find((s) => s.case === caseKey);
	}
</script>

<svelte:head>
	<title>{assignment?.title ?? 'Assignment'} - Sklonuj</title>
</svelte:head>

<NavBar user={page.data.user} />

{#if classData && assignment}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>

		<!-- Assignment info -->
		<div class="mb-6 rounded-2xl border border-card-stroke bg-card-bg p-6">
			<h1 class="text-xl font-semibold text-text-default">{assignment.title}</h1>
			{#if assignment.description}
				<p class="mt-1 text-sm text-text-subtitle">{assignment.description}</p>
			{/if}

			<div class="mt-4 flex flex-wrap gap-4 text-sm text-text-subtitle">
				<div>
					<span class="font-medium text-text-default">Target:</span>
					{assignment.targetQuestions} questions
				</div>
				{#if assignment.minAccuracy !== null}
					<div>
						<span class="font-medium text-text-default">Min Accuracy:</span>
						{assignment.minAccuracy}%
					</div>
				{/if}
				<div>
					<span class="font-medium text-text-default">Number:</span>
					{numberModeLabel(assignment.numberMode)}
				</div>
				<div>
					<span class="font-medium text-text-default">Content:</span>
					{contentModeLabel(assignment.contentMode)}
				</div>
				{#if assignment.dueDate}
					<div>
						<span class="font-medium text-text-default">Due:</span>
						{new Date(assignment.dueDate).toLocaleDateString('en-US', {
							timeZone: 'UTC',
							month: 'short',
							day: 'numeric',
							year: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})} UTC
					</div>
				{/if}
			</div>

			<div class="mt-3 flex flex-wrap gap-1">
				{#each assignment.selectedCases as c (c)}
					{#if isCaseKey(c)}
						<span class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle">
							{CASE_LABELS[c]}
						</span>
					{/if}
				{/each}
				{#each assignment.selectedDrillTypes as dt (dt)}
					{#if isDrillTypeKey(dt)}
						<span class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle">
							{DRILL_TYPE_LABELS[dt]}
						</span>
					{/if}
				{/each}
			</div>
		</div>

		{#if role === 'teacher'}
			<!-- Teacher actions -->
			<div class="mb-6 flex flex-wrap items-center gap-2">
				<a
					href={resolve(`/classes/${classData.id}/assignments/${assignment.id}/edit`)}
					class="rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
				>
					Edit Assignment
				</a>
				<form
					method="POST"
					action="?/duplicate"
					use:enhance={() => {
						duplicating = true;
						return async ({ update }) => {
							duplicating = false;
							await update();
						};
					}}
				>
					<button
						type="submit"
						disabled={duplicating}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default disabled:opacity-50"
					>
						{duplicating ? 'Duplicating...' : 'Duplicate'}
					</button>
				</form>
				{#if confirmingDelete}
					<span class="text-sm text-text-subtitle">Are you sure?</span>
					<form method="POST" action="?/delete" use:enhance>
						<button
							type="submit"
							class="cursor-pointer rounded-xl border border-negative-stroke px-4 py-2 text-sm font-medium text-negative-stroke transition-colors hover:bg-negative-background"
						>
							Yes, Delete
						</button>
					</form>
					<button
						type="button"
						onclick={() => (confirmingDelete = false)}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingDelete = true)}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-negative-stroke transition-colors hover:border-negative-stroke hover:bg-negative-background"
					>
						Delete Assignment
					</button>
				{/if}
			</div>

			<!-- Teacher: student progress table with per-case breakdown -->
			<div>
				<h2 class="mb-3 text-lg font-semibold text-text-default">
					Student Progress ({studentProgress.length})
				</h2>
				{#if studentProgress.length === 0}
					<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
						<p class="text-sm text-text-subtitle">No students in this class yet.</p>
					</div>
				{:else}
					<div class="overflow-hidden rounded-2xl border border-card-stroke bg-card-bg">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-card-stroke bg-shaded-background">
									<th class="px-4 py-3 text-left font-medium text-text-subtitle">Student</th>
									<th class="px-4 py-3 text-left font-medium text-text-subtitle">Progress</th>
									<th class="px-4 py-3 text-left font-medium text-text-subtitle">Accuracy</th>
									<th class="px-4 py-3 text-left font-medium text-text-subtitle">Status</th>
								</tr>
							</thead>
							<tbody>
								{#each studentProgress as sp (sp.studentId)}
									<tr class="border-b border-card-stroke last:border-b-0">
										<td class="px-4 py-3 text-text-default">
											{sp.displayName ?? 'Anonymous'}
										</td>
										<td class="px-4 py-3 text-text-subtitle">
											{cappedAttempted(sp.questionsAttempted)}/{assignment.targetQuestions}
										</td>
										<td class="px-4 py-3 text-text-subtitle">
											{accuracy(sp.questionsAttempted, sp.questionsCorrect)}
										</td>
										<td class="px-4 py-3">
											{#if sp.completedAt}
												<span
													class="rounded-full bg-positive-background px-2 py-0.5 text-xs font-medium text-positive-stroke"
												>
													Completed
												</span>
											{:else if sp.questionsAttempted > 0}
												<span
													class="rounded-full bg-warning-background px-2 py-0.5 text-xs font-medium text-warning-text"
												>
													In Progress
												</span>
											{:else}
												<span
													class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-medium text-text-subtitle"
												>
													Not Started
												</span>
											{/if}
										</td>
									</tr>
									<!-- Per-case breakdown row for this student -->
									{#if sp.caseScores.length > 0}
										<tr class="border-b border-card-stroke last:border-b-0">
											<td colspan="4" class="px-4 pb-3 pt-0">
												<div class="flex flex-wrap gap-1.5">
													{#each assignmentCases as c (c)}
														{@const score = findCaseScore(sp.caseScores, c)}
														<div
															class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs {score
																? caseAccuracyColor(score.accuracy)
																: 'bg-shaded-background text-text-subtitle'}"
														>
															<span class="font-medium">{CASE_LABELS[c].slice(0, 3)}</span>
															<span>{score ? `${Math.round(score.accuracy)}%` : '--'}</span>
														</div>
													{/each}
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
		{:else}
			<!-- Student: own progress -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-4 text-lg font-semibold text-text-default">Your Progress</h2>
				{#if studentProgress.length > 0}
					{@const myProgress = studentProgress[0]}
					<div class="mb-4 grid grid-cols-3 gap-3">
						<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
							<p class="text-2xl font-bold text-text-default">
								{myProgress.questionsAttempted}
							</p>
							<p class="text-xs text-text-subtitle">
								of {assignment.targetQuestions} attempted
							</p>
						</div>
						<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
							<p class="text-2xl font-bold text-text-default">
								{accuracy(myProgress.questionsAttempted, myProgress.questionsCorrect)}
							</p>
							<p class="text-xs text-text-subtitle">accuracy</p>
						</div>
						<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
							{#if myProgress.completedAt}
								<p class="text-2xl font-bold text-positive-stroke">Done</p>
								<p class="text-xs text-text-subtitle">completed</p>
							{:else}
								<p class="text-2xl font-bold text-warning-text">In Progress</p>
								<p class="text-xs text-text-subtitle">keep going!</p>
							{/if}
						</div>
					</div>

					<!-- Student case scores -->
					{#if myProgress.caseScores.length > 0}
						<div class="mb-4">
							<h3 class="mb-2 text-sm font-medium text-text-default">Case Accuracy</h3>
							<div class="flex flex-wrap gap-1.5">
								{#each assignmentCases as c (c)}
									{@const score = findCaseScore(myProgress.caseScores, c)}
									<div
										class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs {score
											? caseAccuracyColor(score.accuracy)
											: 'bg-shaded-background text-text-subtitle'}"
									>
										<span class="font-medium">{CASE_LABELS[c].slice(0, 3)}</span>
										<span>{score ? `${Math.round(score.accuracy)}%` : '--'}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
					<!-- Review Mistakes section -->
					{#if myProgress.mistakes.length > 0}
						<div class="mb-4">
							<button
								type="button"
								onclick={() => (showMistakes = !showMistakes)}
								class="mb-2 cursor-pointer text-sm font-medium text-emphasis transition-opacity hover:opacity-80"
							>
								{showMistakes ? 'Hide Mistakes' : `Review Mistakes (${myProgress.mistakes.length})`}
							</button>
							{#if showMistakes}
								<div class="overflow-hidden rounded-xl border border-card-stroke">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b border-card-stroke bg-shaded-background">
												<th class="px-3 py-2 text-left font-medium text-text-subtitle">Word</th>
												<th class="px-3 py-2 text-left font-medium text-text-subtitle">Expected</th>
												<th class="px-3 py-2 text-left font-medium text-text-subtitle"
													>Your Answer</th
												>
												<th class="px-3 py-2 text-left font-medium text-text-subtitle">Case</th>
											</tr>
										</thead>
										<tbody>
											{#each myProgress.mistakes as mistake, i (i)}
												<tr class="border-b border-card-stroke last:border-b-0">
													<td class="px-3 py-2 text-text-default">{mistake.word}</td>
													<td class="px-3 py-2 font-medium text-positive-stroke"
														>{mistake.expectedForm}</td
													>
													<td class="px-3 py-2 text-negative-stroke">{mistake.givenAnswer}</td>
													<td class="px-3 py-2 text-text-subtitle">
														{caseLabelFromKey(mistake.case)}
														<span class="text-xs">({numberLabel(mistake.number)})</span>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{/if}
				{:else}
					<p class="mb-4 text-sm text-text-subtitle">You haven't started this assignment yet.</p>
				{/if}

				<div class="flex flex-wrap items-center gap-2">
					<a
						href="{resolve('/')}?assignment={assignment.id}"
						class="inline-block rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
					>
						{studentProgress.length > 0 && !studentProgress[0].completedAt
							? 'Continue Practice'
							: 'Start Practice'}
					</a>

					{#if studentProgress.length > 0 && studentProgress[0].completedAt}
						<form
							method="POST"
							action="?/retry"
							use:enhance={() => {
								retrying = true;
								return async ({ update }) => {
									retrying = false;
									await update();
								};
							}}
						>
							<button
								type="submit"
								disabled={retrying}
								onclick={(e: MouseEvent) => {
									if (
										!confirm('This will reset your progress for this assignment. Are you sure?')
									) {
										e.preventDefault();
									}
								}}
								class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default disabled:opacity-50"
							>
								{retrying ? 'Resetting...' : 'Retry Assignment'}
							</button>
						</form>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else if classData}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
			<p class="text-sm text-text-subtitle">Assignment not found.</p>
		</div>
	</div>
{/if}
