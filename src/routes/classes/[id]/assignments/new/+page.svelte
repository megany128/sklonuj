<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Breadcrumbs from '$lib/components/ui/Breadcrumbs.svelte';
	import { ALL_CASES, CASE_LABELS, ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
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
		return val === 'teacher' ? 'teacher' : 'student';
	});

	let formResult = $derived($page.form);
	let errorMessage = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.message === 'string') {
			return formResult.message;
		}
		return null;
	});

	let submitting = $state(false);
	let validationError = $state<string | null>(null);

	function validateForm(event: SubmitEvent) {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		const formData = new FormData(form);
		const cases = formData.getAll('selected_cases');
		const drillTypes = formData.getAll('selected_drill_types');
		if (cases.length === 0) {
			validationError = 'Please select at least one case.';
			event.preventDefault();
			return;
		}
		if (drillTypes.length === 0) {
			validationError = 'Please select at least one drill type.';
			event.preventDefault();
			return;
		}
		validationError = null;
	}
</script>

<svelte:head>
	<title>New Assignment - Skloňuj</title>
</svelte:head>

<NavBar user={$page.data.user} />

{#if classData}
	<div class="mx-auto max-w-lg px-4 py-8">
		<Breadcrumbs
			items={[
				{ label: 'Classes', href: resolve('/classes') },
				{ label: classData.name, href: resolve(`/classes/${classData.id}`) },
				{
					label: 'New Assignment',
					href: resolve(`/classes/${classData.id}/assignments/new`)
				}
			]}
		/>

		{#if role !== 'teacher'}
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
				<p class="text-sm text-text-subtitle">Only teachers can create assignments.</p>
			</div>
		{:else}
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h1 class="mb-6 text-xl font-semibold text-text-default">Create Assignment</h1>

				{#if errorMessage || validationError}
					<div
						class="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
					>
						{validationError ?? errorMessage}
					</div>
				{/if}

				<form
					method="POST"
					onsubmit={validateForm}
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
							placeholder="e.g. Week 3 - Dative Practice"
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
							placeholder="Instructions or notes for students..."
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						></textarea>
					</div>

					<!-- Cases -->
					<div class="mb-4">
						<p class="mb-2 text-sm font-medium text-text-default">Cases</p>
						<div class="flex flex-wrap gap-2">
							{#each ALL_CASES as c (c)}
								<label
									class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
								>
									<input type="checkbox" name="selected_cases" value={c} checked class="sr-only" />
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
										checked
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
										checked={value === 'both'}
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
										checked={value === 'both'}
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
							value={20}
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
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
						/>
					</div>

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity disabled:opacity-50"
					>
						{submitting ? 'Creating...' : 'Create Assignment'}
					</button>
				</form>
			</div>
		{/if}
	</div>
{/if}
