<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { ALL_CASES, CASE_LABELS, ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	interface AssignmentData {
		id: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		targetQuestions: number;
		dueDate: string | null;
	}

	function isAssignmentData(v: unknown): v is AssignmentData {
		if (!isRecord(v)) return false;
		return typeof v.id === 'string' && typeof v.title === 'string';
	}

	let classData = $derived.by(() => {
		const val: unknown = $page.data.classData;
		if (isRecord(val) && typeof val.id === 'string') {
			return { id: val.id, name: typeof val.name === 'string' ? val.name : '' };
		}
		return null;
	});

	let assignment = $derived.by(() => {
		const val: unknown = $page.data.assignment;
		return isAssignmentData(val) ? val : null;
	});

	let formResult = $derived($page.form);
	let errorMessage = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.message === 'string') {
			return formResult.message;
		}
		return null;
	});

	let submitting = $state(false);

	function formatDateForInput(isoDate: string): string {
		const d = new Date(isoDate);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
</script>

<svelte:head>
	<title>Edit Assignment - Skloňuj</title>
</svelte:head>

<NavBar user={$page.data.user} />

{#if classData && assignment}
	<div class="mx-auto max-w-lg px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}/assignments/${assignment.id}`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {assignment.title}
		</a>

		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
			<h1 class="mb-6 text-xl font-semibold text-text-default">Edit Assignment</h1>

			{#if errorMessage}
				<div class="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
					{errorMessage}
				</div>
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
					};
				}}
			>
				<!-- Title -->
				<div class="mb-4">
					<label for="title" class="mb-1 block text-sm font-medium text-text-default">
						Title
					</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						maxlength={200}
						value={assignment.title}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>
				</div>

				<!-- Description -->
				<div class="mb-4">
					<label for="description" class="mb-1 block text-sm font-medium text-text-default">
						Description <span class="text-text-subtitle">(optional)</span>
					</label>
					<textarea
						id="description"
						name="description"
						maxlength={1000}
						rows={3}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						>{assignment.description ?? ''}</textarea
					>
				</div>

				<!-- Cases -->
				<div class="mb-4">
					<p class="mb-2 text-sm font-medium text-text-default">Cases</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_CASES as c (c)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="checkbox"
									name="selected_cases"
									value={c}
									checked={assignment.selectedCases.includes(c)}
									class="sr-only"
								/>
								{CASE_LABELS[c]}
							</label>
						{/each}
					</div>
				</div>

				<!-- Drill Types -->
				<div class="mb-4">
					<p class="mb-2 text-sm font-medium text-text-default">Drill Types</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_DRILL_TYPES as dt (dt)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="checkbox"
									name="selected_drill_types"
									value={dt}
									checked={assignment.selectedDrillTypes.includes(dt)}
									class="sr-only"
								/>
								{DRILL_TYPE_LABELS[dt]}
							</label>
						{/each}
					</div>
				</div>

				<!-- Number Mode -->
				<div class="mb-4">
					<p class="mb-2 text-sm font-medium text-text-default">Number</p>
					<div class="flex gap-2">
						{#each [['both', 'Both'], ['sg', 'Singular Only'], ['pl', 'Plural Only']] as [value, label] (value)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="radio"
									name="number_mode"
									{value}
									checked={assignment.numberMode === value}
									class="sr-only"
								/>
								{label}
							</label>
						{/each}
					</div>
				</div>

				<!-- Content Mode -->
				<div class="mb-4">
					<p class="mb-2 text-sm font-medium text-text-default">Content</p>
					<div class="flex gap-2">
						{#each [['both', 'Both'], ['nouns', 'Nouns Only'], ['pronouns', 'Pronouns Only']] as [value, label] (value)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="radio"
									name="content_mode"
									{value}
									checked={assignment.contentMode === value}
									class="sr-only"
								/>
								{label}
							</label>
						{/each}
					</div>
				</div>

				<!-- Target Questions -->
				<div class="mb-4">
					<label for="target_questions" class="mb-1 block text-sm font-medium text-text-default">
						Target Questions
					</label>
					<input
						type="number"
						id="target_questions"
						name="target_questions"
						value={assignment.targetQuestions}
						min={1}
						max={200}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
					/>
				</div>

				<!-- Due Date -->
				<div class="mb-6">
					<label for="due_date" class="mb-1 block text-sm font-medium text-text-default">
						Due Date <span class="text-text-subtitle">(optional)</span>
					</label>
					<input
						type="datetime-local"
						id="due_date"
						name="due_date"
						value={assignment.dueDate ? formatDateForInput(assignment.dueDate) : ''}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
					/>
				</div>

				<button
					type="submit"
					disabled={submitting}
					class="w-full rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity disabled:opacity-50"
				>
					{submitting ? 'Saving...' : 'Save Changes'}
				</button>
			</form>
		</div>
	</div>
{:else if classData}
	<div class="mx-auto max-w-lg px-4 py-8">
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
			<p class="text-sm text-text-subtitle">Assignment not found or you do not have access.</p>
		</div>
	</div>
{/if}
