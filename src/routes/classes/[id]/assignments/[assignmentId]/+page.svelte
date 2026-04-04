<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Breadcrumbs from '$lib/components/ui/Breadcrumbs.svelte';
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
		dueDate: string | null;
		createdAt: string;
	}

	interface StudentProgress {
		studentId: string;
		displayName: string | null;
		questionsAttempted: number;
		questionsCorrect: number;
		completedAt: string | null;
	}

	function isAssignment(v: unknown): v is AssignmentDetail {
		if (!isRecord(v)) return false;
		return typeof v.id === 'string' && typeof v.title === 'string';
	}

	function isProgressArray(v: unknown): v is StudentProgress[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.studentId === 'string' &&
				typeof item.questionsAttempted === 'number'
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
		if (isRecord(val) && typeof val.id === 'string') {
			return { id: val.id, name: typeof val.name === 'string' ? val.name : '' };
		}
		return null;
	});

	let role = $derived.by(() => {
		const val: unknown = $page.data.role;
		return val === 'teacher' || val === 'student' ? val : 'student';
	});

	let assignment = $derived.by(() => {
		const val: unknown = $page.data.assignment;
		return isAssignment(val) ? val : null;
	});

	let studentProgress = $derived.by(() => {
		const val: unknown = $page.data.studentProgress;
		return isProgressArray(val) ? val : [];
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

	function accuracy(attempted: number, correct: number): string {
		if (attempted === 0) return '-';
		return `${Math.round((correct / attempted) * 100)}%`;
	}
</script>

<svelte:head>
	<title>{assignment?.title ?? 'Assignment'} - Skloňuj</title>
</svelte:head>

<NavBar user={$page.data.user} />

{#if classData && assignment}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<Breadcrumbs
			items={[
				{ label: 'Classes', href: resolve('/classes') },
				{ label: classData.name, href: resolve(`/classes/${classData.id}`) },
				{
					label: assignment.title,
					href: resolve(`/classes/${classData.id}/assignments/${assignment.id}`)
				}
			]}
		/>

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
						{new Date(assignment.dueDate).toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric',
							year: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})}
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
			<div class="mb-6 flex items-center gap-2">
				<a
					href={resolve(`/classes/${classData.id}/assignments/${assignment.id}/edit`)}
					class="rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
				>
					Edit Assignment
				</a>
				{#if confirmingDelete}
					<span class="text-xs text-text-subtitle">Are you sure?</span>
					<form method="POST" action="?/delete" use:enhance>
						<button
							type="submit"
							class="cursor-pointer rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
						>
							Yes, Delete
						</button>
					</form>
					<button
						type="button"
						onclick={() => (confirmingDelete = false)}
						class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:text-text-default"
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingDelete = true)}
						class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:text-red-600"
					>
						Delete Assignment
					</button>
				{/if}
			</div>

			<!-- Teacher: student progress table -->
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
											{sp.questionsAttempted}/{assignment.targetQuestions}
										</td>
										<td class="px-4 py-3 text-text-subtitle">
											{accuracy(sp.questionsAttempted, sp.questionsCorrect)}
										</td>
										<td class="px-4 py-3">
											{#if sp.completedAt}
												<span
													class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
												>
													Completed
												</span>
											{:else if sp.questionsAttempted > 0}
												<span
													class="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700"
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
					<div class="mb-4 grid grid-cols-3 gap-4">
						<div class="text-center">
							<p class="text-2xl font-bold text-text-default">
								{myProgress.questionsAttempted}
							</p>
							<p class="text-xs text-text-subtitle">
								of {assignment.targetQuestions} attempted
							</p>
						</div>
						<div class="text-center">
							<p class="text-2xl font-bold text-text-default">
								{accuracy(myProgress.questionsAttempted, myProgress.questionsCorrect)}
							</p>
							<p class="text-xs text-text-subtitle">accuracy</p>
						</div>
						<div class="text-center">
							{#if myProgress.completedAt}
								<p class="text-2xl font-bold text-green-600">Done</p>
								<p class="text-xs text-text-subtitle">completed</p>
							{:else}
								<p class="text-2xl font-bold text-yellow-600">In Progress</p>
								<p class="text-xs text-text-subtitle">keep going!</p>
							{/if}
						</div>
					</div>
				{:else}
					<p class="mb-4 text-sm text-text-subtitle">You haven't started this assignment yet.</p>
				{/if}

				<a
					href="{resolve('/')}?assignment={assignment.id}"
					class="inline-block rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
				>
					{studentProgress.length > 0 && !studentProgress[0].completedAt
						? 'Continue Practice'
						: 'Start Practice'}
				</a>
			</div>
		{/if}
	</div>
{:else if classData}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<Breadcrumbs
			items={[
				{ label: 'Classes', href: resolve('/classes') },
				{ label: classData.name, href: resolve(`/classes/${classData.id}`) }
			]}
		/>
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
			<p class="text-sm text-text-subtitle">Assignment not found.</p>
		</div>
	</div>
{/if}
