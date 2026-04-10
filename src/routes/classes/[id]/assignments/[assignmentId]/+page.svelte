<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { ALL_CASES, CASE_LABELS, ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';
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
		sentence?: string;
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
	let confirmingDuplicate = $state(false);
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

	// Derive whether any students have started this assignment
	let hasProgress = $derived.by(() => {
		return studentProgress.some((sp) => sp.questionsAttempted > 0);
	});

	// ---------- Edit Assignment Modal ----------
	let showEditModal = $state(false);
	let editSubmitting = $state(false);
	let editError = $state<string | null>(null);
	let editModalEl = $state<HTMLDivElement | null>(null);
	let editOpenerEl: HTMLElement | null = null;

	function formatDateForInput(isoDate: string): string {
		const d = new Date(isoDate);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
	}

	function toggleAllCheckboxes(e: MouseEvent, name: string): void {
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const form = target.closest('form');
		if (!form) return;
		const boxes = form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
		const allChecked = Array.from(boxes).every((b) => b.checked);
		boxes.forEach((b) => (b.checked = !allChecked));
	}

	function allCasesSelected(): boolean {
		if (!assignment) return false;
		return ALL_CASES.every((c) => assignment.selectedCases.includes(c));
	}

	function allDrillTypesSelected(): boolean {
		if (!assignment) return false;
		return ALL_DRILL_TYPES.every((dt) => assignment.selectedDrillTypes.includes(dt));
	}

	function getFocusableElements(container: HTMLElement): HTMLElement[] {
		const selectors =
			'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
		return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
			(el) => !el.hasAttribute('disabled') && el.tabIndex !== -1
		);
	}

	function openEditModal(e?: MouseEvent): void {
		editError = null;
		editSubmitting = false;
		const target = e?.currentTarget;
		editOpenerEl = target instanceof HTMLElement ? target : null;
		showEditModal = true;
	}

	function closeEditModal(): void {
		showEditModal = false;
		if (editOpenerEl) {
			editOpenerEl.focus();
			editOpenerEl = null;
		}
	}

	function editModalKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeEditModal();
			return;
		}
		if (e.key !== 'Tab') return;
		const el = editModalEl;
		if (!el) return;
		const focusables = getFocusableElements(el);
		if (focusables.length === 0) {
			e.preventDefault();
			return;
		}
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (e.shiftKey) {
			if (active === first || !el.contains(active)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	$effect(() => {
		if (!showEditModal) return;
		const el = editModalEl;
		if (!el) return;
		const focusables = getFocusableElements(el);
		if (focusables.length > 0) {
			focusables[0].focus();
		} else {
			el.focus();
		}
	});
</script>

<svelte:head>
	<title>{assignment?.title ?? 'Assignment'} - Sklonuj</title>
</svelte:head>

<NavBar user={page.data.user} />

{#if classData && assignment}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}?tab=assignments`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>

		<!-- Assignment info -->
		<div class="mb-6 rounded-2xl border border-card-stroke bg-card-bg p-6">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<h1 class="text-xl font-semibold text-text-default">{assignment.title}</h1>
					{#if assignment.description}
						<p class="mt-1 text-sm text-text-subtitle">{assignment.description}</p>
					{/if}
				</div>

				{#if role === 'teacher'}
					<!-- Teacher quick actions (icon buttons) -->
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							title="Edit assignment"
							aria-label="Edit assignment"
							onclick={openEditModal}
							class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-card-stroke p-2 text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							<Pencil class="size-4" aria-hidden="true" />
						</button>
						<div class="relative">
							{#if confirmingDuplicate}
								<div
									class="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-card-stroke bg-card-bg p-3 shadow-lg"
								>
									<p class="mb-2 text-xs text-text-subtitle">Duplicate this assignment?</p>
									<div class="flex items-center gap-2">
										<form
											method="POST"
											action="?/duplicate"
											use:enhance={() => {
												duplicating = true;
												return async ({ update }) => {
													duplicating = false;
													confirmingDuplicate = false;
													await update();
												};
											}}
										>
											<button
												type="submit"
												disabled={duplicating}
												class="cursor-pointer rounded-lg border border-emphasis bg-emphasis px-2.5 py-1 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
											>
												{duplicating ? 'Duplicating...' : 'Yes, duplicate'}
											</button>
										</form>
										<button
											type="button"
											onclick={() => (confirmingDuplicate = false)}
											class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
										>
											Cancel
										</button>
									</div>
								</div>
							{/if}
							<button
								type="button"
								title="Duplicate assignment"
								aria-label="Duplicate assignment"
								onclick={() => {
									confirmingDelete = false;
									confirmingDuplicate = !confirmingDuplicate;
								}}
								class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-card-stroke p-2 text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
							>
								<Copy class="size-4" aria-hidden="true" />
							</button>
						</div>
						<div class="relative">
							{#if confirmingDelete}
								<div
									class="absolute right-0 top-full z-10 mt-1 w-52 rounded-xl border border-card-stroke bg-card-bg p-3 shadow-lg"
								>
									<p class="mb-2 text-xs text-text-subtitle">
										Delete this assignment? This cannot be undone.
									</p>
									<div class="flex items-center gap-2">
										<form method="POST" action="?/delete" use:enhance>
											<button
												type="submit"
												class="cursor-pointer rounded-lg border border-negative-stroke px-2.5 py-1 text-xs font-medium text-negative-stroke transition-colors hover:bg-negative-background"
											>
												Yes, delete
											</button>
										</form>
										<button
											type="button"
											onclick={() => (confirmingDelete = false)}
											class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
										>
											Cancel
										</button>
									</div>
								</div>
							{/if}
							<button
								type="button"
								title="Delete assignment"
								aria-label="Delete assignment"
								onclick={() => {
									confirmingDuplicate = false;
									confirmingDelete = !confirmingDelete;
								}}
								class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-card-stroke p-2 text-text-subtitle transition-colors hover:border-negative-stroke hover:text-negative-stroke"
							>
								<Trash2 class="size-4" aria-hidden="true" />
							</button>
						</div>
					</div>
				{/if}
			</div>

			<dl class="mt-4 grid grid-cols-[max-content_1fr] items-start gap-x-4 gap-y-2 text-sm">
				<dt class="pt-0.5 text-text-subtitle">Cases</dt>
				<dd class="flex flex-wrap gap-1">
					{#each assignment.selectedCases as c (c)}
						{#if isCaseKey(c)}
							<span
								class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
							>
								{CASE_LABELS[c]}
							</span>
						{/if}
					{/each}
				</dd>
				<dt class="pt-0.5 text-text-subtitle">Drill types</dt>
				<dd class="flex flex-wrap gap-1">
					{#each assignment.selectedDrillTypes as dt (dt)}
						{#if isDrillTypeKey(dt)}
							<span
								class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
							>
								{DRILL_TYPE_LABELS[dt]}
							</span>
						{/if}
					{/each}
				</dd>
				<dt class="text-text-subtitle">Number</dt>
				<dd class="text-text-default">{numberModeLabel(assignment.numberMode)}</dd>
				<dt class="text-text-subtitle">Content</dt>
				<dd class="text-text-default">{contentModeLabel(assignment.contentMode)}</dd>
				<dt class="text-text-subtitle">Target</dt>
				<dd class="text-text-default">{assignment.targetQuestions} questions</dd>
				{#if assignment.dueDate}
					{@const dueDate = new Date(assignment.dueDate)}
					{@const hasTime = dueDate.getUTCHours() !== 0 || dueDate.getUTCMinutes() !== 0}
					<dt class="text-text-subtitle">Due</dt>
					<dd class="text-text-default">
						{dueDate.toLocaleDateString('en-US', {
							timeZone: 'UTC',
							month: 'short',
							day: 'numeric',
							year: 'numeric',
							...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {})
						})}
					</dd>
				{/if}
			</dl>
		</div>

		{#if role === 'teacher'}
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
					<div class="space-y-3">
						{#each studentProgress as sp (sp.studentId)}
							{@const pct = Math.min(
								100,
								Math.round((sp.questionsAttempted / Math.max(1, assignment.targetQuestions)) * 100)
							)}
							<div class="rounded-xl border border-card-stroke bg-card-bg p-4">
								<div class="flex items-center justify-between gap-3">
									<span class="font-medium text-text-default">
										{sp.displayName ?? 'Anonymous'}
									</span>
									{#if sp.completedAt}
										<span
											class="shrink-0 rounded-full bg-positive-background px-2 py-0.5 text-xs font-medium text-positive-stroke"
										>
											Completed
										</span>
									{:else if sp.questionsAttempted > 0}
										<span
											class="shrink-0 rounded-full bg-warning-background px-2 py-0.5 text-xs font-medium text-warning-text"
										>
											In Progress
										</span>
									{:else}
										<span
											class="shrink-0 rounded-full bg-shaded-background px-2 py-0.5 text-xs font-medium text-text-subtitle"
										>
											Not Started
										</span>
									{/if}
								</div>
								<div class="mt-2 flex items-center gap-3">
									<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-shaded-background">
										<div
											class="h-full rounded-full transition-all {sp.completedAt
												? 'bg-positive-stroke'
												: 'bg-emphasis'}"
											style="width: {pct}%"
										></div>
									</div>
									<span class="shrink-0 text-xs tabular-nums text-text-subtitle">
										{cappedAttempted(sp.questionsAttempted)}/{assignment.targetQuestions}
									</span>
									{#if sp.questionsAttempted > 0}
										<span class="shrink-0 text-xs tabular-nums text-text-subtitle">
											{accuracy(sp.questionsAttempted, sp.questionsCorrect)}
										</span>
									{/if}
								</div>
								{#if sp.questionsAttempted > 0 && sp.caseScores.length > 0}
									<div
										class="mt-3 grid gap-1.5"
										style="grid-template-columns: repeat({assignmentCases.length}, minmax(0, 1fr));"
									>
										{#each assignmentCases as c (c)}
											{@const score = findCaseScore(sp.caseScores, c)}
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
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<!-- Student: own progress -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-4 text-lg font-semibold text-text-default">Your Progress</h2>
				{#if studentProgress.length > 0}
					{@const myProgress = studentProgress[0]}
					<div class="mb-4 grid grid-cols-2 gap-3">
						{#if myProgress.completedAt}
							<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
								<p class="text-2xl font-bold text-text-default">
									{accuracy(myProgress.questionsAttempted, myProgress.questionsCorrect)}
								</p>
								<p class="text-xs text-text-subtitle">accuracy</p>
							</div>
							<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
								<p class="text-2xl font-bold text-text-default">
									{myProgress.questionsCorrect}/{assignment.targetQuestions}
								</p>
								<p class="text-xs text-text-subtitle">correct</p>
							</div>
						{:else}
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
						{/if}
					</div>

					<!-- Student case scores -->
					{#if myProgress.caseScores.length > 0}
						<div class="mb-4">
							<h3 class="mb-2 text-sm font-medium text-text-default">Case Accuracy</h3>
							<div
								class="grid gap-1.5"
								style="grid-template-columns: repeat({assignmentCases.length}, minmax(0, 1fr));"
							>
								{#each assignmentCases as c (c)}
									{@const score = findCaseScore(myProgress.caseScores, c)}
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
					{/if}
					<!-- Review Mistakes section -->
					{#if myProgress.mistakes.length > 0}
						<div class="mb-4">
							<button
								type="button"
								onclick={() => (showMistakes = !showMistakes)}
								class="flex w-full cursor-pointer items-center justify-between rounded-lg bg-shaded-background px-3 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background/80"
							>
								<span>Mistakes ({myProgress.mistakes.length})</span>
								<ChevronDown
									class="size-4 transition-transform {showMistakes ? 'rotate-180' : ''}"
									aria-hidden="true"
								/>
							</button>
							{#if showMistakes}
								<div class="mt-2 space-y-2">
									{#each myProgress.mistakes as mistake, i (i)}
										{@const isCaseId = isCaseKey(mistake.expectedForm)}
										<div
											class="rounded-lg border border-card-stroke bg-shaded-background/50 px-3 py-2.5"
										>
											{#if mistake.sentence}
												<p class="mb-1.5 text-sm text-text-default italic">
													{mistake.sentence}
												</p>
											{/if}
											<div class="flex items-baseline justify-between gap-2">
												{#if isCaseId}
													<span class="text-sm text-text-subtitle">
														<span class="font-medium text-text-default">{mistake.word}</span>
														— correct:
														<span class="font-medium text-positive-stroke"
															>{caseLabelFromKey(mistake.expectedForm)}</span
														>
													</span>
												{:else}
													<span class="text-sm font-medium text-text-default">
														{mistake.word}
														<span class="font-normal text-text-subtitle">&rarr;</span>
														<span class="text-positive-stroke">{mistake.expectedForm}</span>
													</span>
												{/if}
												<span class="shrink-0 text-xs text-text-subtitle">
													{caseLabelFromKey(mistake.case)}
													({numberLabel(mistake.number)})
												</span>
											</div>
											<p class="mt-0.5 text-xs text-text-subtitle">
												your answer: <span class="text-negative-stroke"
													>{isCaseId
														? caseLabelFromKey(mistake.givenAnswer)
														: mistake.givenAnswer}</span
												>
											</p>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{:else}
					<p class="mb-4 text-sm text-text-subtitle">You haven't started this assignment yet.</p>
				{/if}

				<div class="flex flex-wrap items-center gap-2">
					{#if !studentProgress.length || !studentProgress[0].completedAt}
						<a
							href="{resolve('/')}?assignment={assignment.id}"
							class="inline-block rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
						>
							{studentProgress.length > 0 ? 'Continue Practice' : 'Start Practice'}
						</a>
					{/if}
					{#if studentProgress.length > 0 && studentProgress[0].mistakes.length > 0}
						<a
							href="{resolve('/')}?mode=review&assignment={assignment.id}"
							class="inline-block rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Review Mistakes
						</a>
					{/if}

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

	<!-- Edit Assignment Modal -->
	{#if showEditModal && role === 'teacher'}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div class="absolute inset-0 bg-black/50" onclick={closeEditModal} role="presentation"></div>
			<div
				bind:this={editModalEl}
				role="dialog"
				aria-modal="true"
				aria-labelledby="edit-assignment-modal-heading"
				tabindex={-1}
				onkeydown={editModalKeydown}
				class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
			>
				<button
					type="button"
					aria-label="Close"
					onclick={closeEditModal}
					class="absolute right-4 top-4 cursor-pointer text-text-subtitle transition-colors hover:text-text-default"
				>
					<X class="h-5 w-5" aria-hidden="true" />
				</button>

				<h2 id="edit-assignment-modal-heading" class="mb-4 text-xl font-semibold text-text-default">
					Edit Assignment
				</h2>

				{#if hasProgress}
					<div
						class="mb-4 rounded-xl border border-warning-text/30 bg-warning-background px-4 py-3 text-sm text-warning-text"
					>
						Students have already started this assignment. Changes may affect their progress.
					</div>
				{/if}

				{#if editError}
					<div
						class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
					>
						{editError}
					</div>
				{/if}

				<form
					method="POST"
					action={resolve(`/classes/${classData.id}/assignments/${assignment.id}/edit`)}
					onsubmit={(e: SubmitEvent) => {
						if (hasProgress) {
							if (
								!confirm(
									'Students have already started this assignment. Are you sure you want to save changes?'
								)
							) {
								e.preventDefault();
								return;
							}
						}
					}}
					use:enhance={() => {
						editSubmitting = true;
						editError = null;
						return async ({ result, update }) => {
							editSubmitting = false;
							if (result.type === 'redirect') {
								showEditModal = false;
								editOpenerEl = null;
								await invalidateAll();
							} else if (result.type === 'success') {
								showEditModal = false;
								editOpenerEl = null;
								await update();
							} else if (result.type === 'failure') {
								const data: unknown = result.data;
								if (isRecord(data) && typeof data.message === 'string') {
									editError = data.message;
								} else {
									editError = 'Failed to update assignment.';
								}
							}
						};
					}}
				>
					<!-- Title -->
					<div class="mb-4">
						<label for="edit-title" class="mb-1 block text-sm font-medium text-text-default">
							Title
						</label>
						<input
							type="text"
							id="edit-title"
							name="title"
							required
							maxlength={200}
							value={assignment.title}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						/>
					</div>

					<!-- Description -->
					<div class="mb-4">
						<label for="edit-description" class="mb-1 block text-sm font-medium text-text-default">
							Description <span class="text-text-subtitle">(optional)</span>
						</label>
						<textarea
							id="edit-description"
							name="description"
							maxlength={1000}
							rows={3}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
							>{assignment.description ?? ''}</textarea
						>
					</div>

					<!-- Cases -->
					<div class="mb-4">
						<div class="mb-2 flex items-center justify-between">
							<p class="text-sm font-medium text-text-default">Cases</p>
							<button
								type="button"
								onclick={(e: MouseEvent) => toggleAllCheckboxes(e, 'selected_cases')}
								class="text-xs font-medium text-emphasis hover:underline"
							>
								{#if allCasesSelected()}
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
						<div class="mb-2 flex items-center justify-between">
							<p class="text-sm font-medium text-text-default">Drill Types</p>
							<button
								type="button"
								onclick={(e: MouseEvent) => toggleAllCheckboxes(e, 'selected_drill_types')}
								class="text-xs font-medium text-emphasis hover:underline"
							>
								{#if allDrillTypesSelected()}
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
						<label
							for="edit-target_questions"
							class="mb-1 block text-sm font-medium text-text-default"
						>
							Target Questions
						</label>
						<input
							type="number"
							id="edit-target_questions"
							name="target_questions"
							value={assignment.targetQuestions}
							min={1}
							max={200}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
						/>
					</div>

					<!-- Due Date -->
					<div class="mb-6">
						<label for="edit-due_date" class="mb-1 block text-sm font-medium text-text-default">
							Due Date <span class="text-text-subtitle">(optional)</span>
						</label>
						<input
							type="datetime-local"
							id="edit-due_date"
							name="due_date"
							value={assignment.dueDate ? formatDateForInput(assignment.dueDate) : ''}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
						/>
					</div>

					<!-- Notify Students -->
					<div class="mb-6">
						<label class="flex cursor-pointer items-center gap-2 text-sm text-text-default">
							<input
								type="checkbox"
								name="notify_students"
								checked
								class="h-4 w-4 rounded border-card-stroke accent-emphasis"
							/>
							Notify students of this change
						</label>
					</div>

					<div class="flex gap-3">
						<button
							type="submit"
							disabled={editSubmitting}
							class="flex-1 rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{editSubmitting ? 'Saving...' : 'Save Changes'}
						</button>
						<button
							type="button"
							onclick={closeEditModal}
							class="rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
{:else if classData}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}?tab=assignments`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
			<p class="text-sm text-text-subtitle">Assignment not found.</p>
		</div>
	</div>
{/if}
