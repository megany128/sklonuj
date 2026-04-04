<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';

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

	function isClassData(v: unknown): v is ClassData {
		if (!isRecord(v)) return false;
		return typeof v.id === 'string' && typeof v.name === 'string';
	}

	let classData = $derived.by(() => {
		const val: unknown = $page.data.classData;
		return isClassData(val) ? val : null;
	});

	let formResult = $derived($page.form);
	let errorMessage = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.message === 'string') {
			return formResult.message;
		}
		return null;
	});

	let currentName = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.name === 'string') {
			return formResult.name;
		}
		return classData?.name ?? '';
	});

	let currentLevel = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.level === 'string') {
			return formResult.level;
		}
		return classData?.level ?? 'A1';
	});

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Edit {classData?.name ?? 'Class'} - Skloňuj</title>
</svelte:head>

<NavBar user={$page.data.user} />

{#if classData}
	<div class="mx-auto max-w-lg px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>

		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
			<h1 class="mb-6 text-xl font-semibold text-text-default">Edit Class</h1>

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
				<div class="mb-4">
					<label for="name" class="mb-1 block text-sm font-medium text-text-default">
						Class Name
					</label>
					<input
						type="text"
						id="name"
						name="name"
						value={currentName}
						required
						maxlength={100}
						placeholder="e.g. Czech A1 - Monday Group"
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>
				</div>

				<div class="mb-6">
					<label for="level" class="mb-1 block text-sm font-medium text-text-default">
						Level
					</label>
					<select
						id="level"
						name="level"
						value={currentLevel}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
					>
						<option value="A1">A1 - Beginner</option>
						<option value="A2">A2 - Elementary</option>
						<option value="B1">B1 - Intermediate</option>
						<option value="B2">B2 - Upper Intermediate</option>
					</select>
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
{/if}
