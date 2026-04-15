<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import TeacherFeedback from '$lib/components/ui/TeacherFeedback.svelte';
	import { ALL_CASES, CASE_LABELS, ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';
	import kzkChaptersJson from '$lib/data/kzk_chapters.json';

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	function toStringArray(v: unknown): string[] {
		if (!Array.isArray(v)) return [];
		return v.filter((item): item is string => typeof item === 'string');
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
		return val === 'teacher' ? 'teacher' : 'student';
	});

	let formResult = $derived(page.form);
	let errorMessage = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.message === 'string') {
			return formResult.message;
		}
		return null;
	});

	// Form state preservation from server validation errors
	let formTitle = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.title === 'string') return formResult.title;
		return '';
	});
	let formDescription = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.description === 'string')
			return formResult.description;
		return '';
	});
	let formCaseValues: string[] = $derived.by(() => {
		if (isRecord(formResult) && Array.isArray(formResult.selectedCases))
			return toStringArray(formResult.selectedCases);
		return [];
	});
	let formDrillTypeValues: string[] = $derived.by(() => {
		if (isRecord(formResult) && Array.isArray(formResult.selectedDrillTypes))
			return toStringArray(formResult.selectedDrillTypes);
		return [];
	});
	let formNumberMode = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.numberMode === 'string')
			return formResult.numberMode;
		return 'both';
	});
	let formContentMode = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.contentMode === 'string')
			return formResult.contentMode;
		return 'both';
	});
	let formIncludeAdjectives = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.includeAdjectives === 'boolean')
			return formResult.includeAdjectives;
		return false;
	});

	// Multi-select content toggles
	let nounsSelected = $state(true);
	let pronounsSelected = $state(true);
	let adjectivesSelected = $state(false);

	// Keep in sync when form result changes (e.g. after server validation error)
	$effect(() => {
		nounsSelected = formContentMode === 'both' || formContentMode === 'nouns';
		pronounsSelected = formContentMode === 'both' || formContentMode === 'pronouns';
		adjectivesSelected = formIncludeAdjectives;
	});

	let derivedContentMode = $derived(
		nounsSelected && pronounsSelected ? 'both' : nounsSelected ? 'nouns' : 'pronouns'
	);
	let derivedIncludeAdjectives = $derived(adjectivesSelected);

	function toggleContent(type: 'nouns' | 'pronouns' | 'adjectives') {
		const total =
			(nounsSelected ? 1 : 0) + (pronounsSelected ? 1 : 0) + (adjectivesSelected ? 1 : 0);
		if (type === 'nouns') {
			if (nounsSelected && total <= 1) return;
			// Prevent leaving only adjectives selected (no nouns or pronouns)
			if (nounsSelected && !pronounsSelected) return;
			nounsSelected = !nounsSelected;
		} else if (type === 'pronouns') {
			if (pronounsSelected && total <= 1) return;
			// Prevent leaving only adjectives selected (no nouns or pronouns)
			if (pronounsSelected && !nounsSelected) return;
			pronounsSelected = !pronounsSelected;
		} else {
			if (adjectivesSelected && total <= 1) return;
			adjectivesSelected = !adjectivesSelected;
		}
	}
	let formContentLevel = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.contentLevel === 'string')
			return formResult.contentLevel;
		return '';
	});
	let formTargetQuestions = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.targetQuestions === 'string')
			return formResult.targetQuestions;
		return '20';
	});
	let formDueDate = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.dueDate === 'string') return formResult.dueDate;
		return '';
	});
	const kzkChapters = kzkChaptersJson;

	type LevelMode = 'student' | 'cefr' | 'kzk';
	let levelMode = $state<LevelMode>('student');
	let cefrLevel = $state('A1');
	let kzkChapter = $state('kzk1_01');

	// Derive the actual content_level value to send
	let contentLevelValue = $derived.by(() => {
		if (levelMode === 'cefr') return cefrLevel;
		if (levelMode === 'kzk') return kzkChapter;
		return '';
	});

	// Restore from form on validation error
	$effect(() => {
		if (formContentLevel) {
			if (/^(A1|A2|B1)$/.test(formContentLevel)) {
				levelMode = 'cefr';
				cefrLevel = formContentLevel;
			} else if (/^kzk[12]_\d{2}$/.test(formContentLevel)) {
				levelMode = 'kzk';
				kzkChapter = formContentLevel;
			}
		}
	});

	let dueDateValue = $state('');
	$effect(() => {
		if (formDueDate) dueDateValue = formDueDate;
	});

	interface OtherClassItem {
		id: string;
		name: string;
		studentCount: number;
	}

	let otherClasses: OtherClassItem[] = $derived.by(() => {
		const val: unknown = page.data.otherClasses;
		if (!Array.isArray(val)) return [];
		const result: OtherClassItem[] = [];
		for (const item of val) {
			if (
				isRecord(item) &&
				typeof item.id === 'string' &&
				typeof item.name === 'string' &&
				typeof item.studentCount === 'number'
			) {
				result.push({ id: item.id, name: item.name, studentCount: item.studentCount });
			}
		}
		return result;
	});

	let showMultiClass = $state(false);
	let selectedAdditionalClasses = new SvelteSet<string>();

	function toggleAdditionalClass(classId: string): void {
		if (selectedAdditionalClasses.has(classId)) {
			selectedAdditionalClasses.delete(classId);
		} else {
			selectedAdditionalClasses.add(classId);
		}
	}

	let additionalClassesValue = $derived(Array.from(selectedAdditionalClasses).join(','));

	let submitting = $state(false);
	let validationError = $state<string | null>(null);

	function toggleAllCheckboxes(e: MouseEvent, name: string, allValues: readonly string[]): void {
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const form = target.closest('form');
		if (!form) return;
		const boxes = form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
		const allChecked = Array.from(boxes).every((b) => b.checked);
		boxes.forEach((b) => (b.checked = !allChecked));
		// Force reactivity by triggering a change event
		void allValues;
	}

	function validateBeforeSubmit(event: SubmitEvent) {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		const formData = new FormData(form);
		const cases = formData.getAll('selected_cases');
		const drillTypes = formData.getAll('selected_drill_types');
		if (cases.length === 0) {
			event.preventDefault();
			validationError = 'Please select at least one case.';
			return;
		}
		if (drillTypes.length === 0) {
			event.preventDefault();
			validationError = 'Please select at least one drill type.';
			return;
		}
		validationError = null;
	}
</script>

<svelte:head>
	<title>New Assignment - Sklonuj</title>
</svelte:head>

<NavBar user={page.data.user} onSignIn={() => goto(resolve('/auth'))} />

{#if classData}
	<div class="mx-auto max-w-lg px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}?tab=assignments`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>

		{#if role !== 'teacher'}
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
				<p class="text-sm text-text-subtitle">Only teachers can create assignments.</p>
			</div>
		{:else}
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h1 class="mb-6 text-xl font-semibold text-text-default">Create Assignment</h1>

				{#if errorMessage || validationError}
					<div
						class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
					>
						{errorMessage ?? validationError}
					</div>
				{/if}

				<form
					method="POST"
					onsubmit={validateBeforeSubmit}
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
							value={formTitle}
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
							>{formDescription}</textarea
						>
					</div>

					<!-- Cases -->
					<div class="mb-4">
						<div class="mb-2 flex items-center justify-between">
							<p class="text-sm font-medium text-text-default">Cases</p>
							<button
								type="button"
								onclick={(e: MouseEvent) => toggleAllCheckboxes(e, 'selected_cases', ALL_CASES)}
								class="text-xs font-medium text-emphasis hover:underline"
							>
								{#if formCaseValues.length === ALL_CASES.length}
									Deselect All
								{:else}
									Select All
								{/if}
							</button>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each ALL_CASES as c (c)}
								<label
									class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
								>
									<input
										type="checkbox"
										name="selected_cases"
										value={c}
										checked={formCaseValues.includes(c)}
										class="sr-only"
									/>
									{CASE_LABELS[c]}
								</label>
							{/each}
						</div>
					</div>

					<!-- Drill Types -->
					<div class="mb-4">
						<div class="mb-2 flex items-center justify-between">
							<p class="text-sm font-medium text-text-default">Drill Types</p>
							<button
								type="button"
								onclick={(e: MouseEvent) =>
									toggleAllCheckboxes(e, 'selected_drill_types', ALL_DRILL_TYPES)}
								class="text-xs font-medium text-emphasis hover:underline"
							>
								{#if formDrillTypeValues.length === ALL_DRILL_TYPES.length}
									Deselect All
								{:else}
									Select All
								{/if}
							</button>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each ALL_DRILL_TYPES as dt (dt)}
								<label
									class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
								>
									<input
										type="checkbox"
										name="selected_drill_types"
										value={dt}
										checked={formDrillTypeValues.includes(dt)}
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
										checked={formNumberMode === value}
										class="sr-only"
									/>
									{label}
								</label>
							{/each}
						</div>
					</div>

					<!-- Content -->
					<div class="mb-4">
						<p class="mb-2 text-sm font-medium text-text-default">Content</p>
						<div class="flex gap-2">
							<button
								type="button"
								class="rounded-full border px-3 py-1.5 text-xs {nounsSelected
									? 'border-emphasis bg-emphasis text-text-inverted'
									: 'border-card-stroke text-text-default'}"
								onclick={() => toggleContent('nouns')}
							>
								Nouns
							</button>
							<button
								type="button"
								class="rounded-full border px-3 py-1.5 text-xs {pronounsSelected
									? 'border-emphasis bg-emphasis text-text-inverted'
									: 'border-card-stroke text-text-default'}"
								onclick={() => toggleContent('pronouns')}
							>
								Pronouns
							</button>
							<button
								type="button"
								class="rounded-full border px-3 py-1.5 text-xs {adjectivesSelected
									? 'border-emphasis bg-emphasis text-text-inverted'
									: 'border-card-stroke text-text-default'}"
								onclick={() => toggleContent('adjectives')}
							>
								Adjectives
							</button>
						</div>
						<input type="hidden" name="content_mode" value={derivedContentMode} />
						<input
							type="hidden"
							name="include_adjectives"
							value={derivedIncludeAdjectives ? 'true' : 'false'}
						/>
					</div>

					<!-- Level -->
					<div class="mb-4">
						<p class="mb-2 text-sm font-medium text-text-default">Level</p>
						<div class="flex flex-wrap gap-2">
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="radio"
									name="level_mode"
									value="student"
									checked={levelMode === 'student'}
									onchange={() => (levelMode = 'student')}
									class="sr-only"
								/>
								Student's own level
							</label>
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="radio"
									name="level_mode"
									value="cefr"
									checked={levelMode === 'cefr'}
									onchange={() => (levelMode = 'cefr')}
									class="sr-only"
								/>
								CEFR Level
							</label>
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
							>
								<input
									type="radio"
									name="level_mode"
									value="kzk"
									checked={levelMode === 'kzk'}
									onchange={() => (levelMode = 'kzk')}
									class="sr-only"
								/>
								KZK Chapter
							</label>
						</div>
						{#if levelMode === 'cefr'}
							<select
								bind:value={cefrLevel}
								class="mt-2 w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
							>
								<option value="A1">A1</option>
								<option value="A2">A2</option>
								<option value="B1">B1</option>
							</select>
						{:else if levelMode === 'kzk'}
							<select
								bind:value={kzkChapter}
								class="mt-2 w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
							>
								<optgroup label={kzkChapters.kzk1.label}>
									{#each kzkChapters.kzk1.chapters as ch (ch.id)}
										<option value={ch.id}>{ch.label} — {ch.subtitle}</option>
									{/each}
								</optgroup>
								<optgroup label={kzkChapters.kzk2.label}>
									{#each kzkChapters.kzk2.chapters as ch (ch.id)}
										<option value={ch.id}>{ch.label} — {ch.subtitle}</option>
									{/each}
								</optgroup>
							</select>
						{/if}
						<input type="hidden" name="content_level" value={contentLevelValue} />
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
							value={formTargetQuestions}
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
							bind:value={dueDateValue}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
						/>
						{#if dueDateValue && new Date(dueDateValue) < new Date()}
							<p class="mt-1 text-xs text-warning-text">
								This due date is in the past. Students may see it as overdue.
							</p>
						{/if}
					</div>

					<!-- Multi-class creation -->
					{#if otherClasses.length > 0}
						<div class="mb-6 rounded-xl border border-card-stroke p-4">
							<button
								type="button"
								onclick={() => (showMultiClass = !showMultiClass)}
								class="flex w-full items-center justify-between text-sm font-medium text-text-default"
							>
								<span>Also create for other classes</span>
								<span
									class="text-text-subtitle transition-transform"
									class:rotate-180={showMultiClass}
								>
									&#9660;
								</span>
							</button>

							{#if showMultiClass}
								<div class="mt-3 space-y-2">
									{#each otherClasses as cls (cls.id)}
										<label
											class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-card-bg/80"
										>
											<input
												type="checkbox"
												checked={selectedAdditionalClasses.has(cls.id)}
												onchange={() => toggleAdditionalClass(cls.id)}
												class="h-4 w-4 rounded border-card-stroke text-emphasis accent-emphasis"
											/>
											<span class="flex-1 text-sm text-text-default">{cls.name}</span>
											<span class="text-xs text-text-subtitle">
												{cls.studentCount}
												{cls.studentCount === 1 ? 'student' : 'students'}
											</span>
										</label>
									{/each}
								</div>
								{#if selectedAdditionalClasses.size > 0}
									<p class="mt-2 text-xs text-text-subtitle">
										This assignment will be created for {selectedAdditionalClasses.size + 1} classes total.
									</p>
								{/if}
							{/if}
						</div>

						<input type="hidden" name="additional_classes" value={additionalClassesValue} />
					{/if}

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{#if submitting}
							Creating...
						{:else if selectedAdditionalClasses.size > 0}
							Create for {selectedAdditionalClasses.size + 1} Classes
						{:else}
							Create Assignment
						{/if}
					</button>
				</form>
			</div>
		{/if}
		<TeacherFeedback context="New Assignment" />
	</div>
{/if}
