<script lang="ts">
	import type { Case, Difficulty, DrillType, DrillSettings } from '$lib/types';
	import { CASE_LABELS, ALL_CASES, ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	let {
		selectedCases,
		selectedDrillTypes,
		numberMode,
		showWordHint,
		level,
		isCustom,
		onSettingsChange,
		onLevelChange
	}: {
		selectedCases: Case[];
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		showWordHint: boolean;
		level: Difficulty;
		isCustom: boolean;
		onSettingsChange: (settings: DrillSettings) => void;
		onLevelChange: (level: Difficulty) => void;
	} = $props();

	const levels: Difficulty[] = ['A1', 'A2', 'B1'];

	let expanded = $state(false);

	function toggleCase(c: Case) {
		const isSelected = selectedCases.includes(c);
		if (isSelected && selectedCases.length <= 1) return;
		const next = isSelected ? selectedCases.filter((x) => x !== c) : [...selectedCases, c];
		onSettingsChange({ selectedCases: next, selectedDrillTypes, numberMode, showWordHint });
	}

	function toggleDrillType(dt: DrillType) {
		const isSelected = selectedDrillTypes.includes(dt);
		if (isSelected && selectedDrillTypes.length <= 1) return;
		const next = isSelected
			? selectedDrillTypes.filter((x) => x !== dt)
			: [...selectedDrillTypes, dt];
		onSettingsChange({ selectedCases, selectedDrillTypes: next, numberMode, showWordHint });
	}

	function setNumberMode(mode: 'sg' | 'pl' | 'both') {
		onSettingsChange({ selectedCases, selectedDrillTypes, numberMode: mode, showWordHint });
	}

	function toggleShowWordHint() {
		onSettingsChange({
			selectedCases,
			selectedDrillTypes,
			numberMode,
			showWordHint: !showWordHint
		});
	}

	const numberOptions: { value: 'sg' | 'pl' | 'both'; label: string }[] = [
		{ value: 'sg', label: 'Singular' },
		{ value: 'pl', label: 'Plural' },
		{ value: 'both', label: 'Both' }
	];
</script>

<div class="w-full">
	<button
		onclick={() => (expanded = !expanded)}
		class="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
		aria-expanded={expanded}
		aria-controls="drill-settings-panel"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
			<path
				fill-rule="evenodd"
				d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
				clip-rule="evenodd"
			/>
		</svg>
		Settings
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
		>
			<path
				fill-rule="evenodd"
				d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	<div
		id="drill-settings-panel"
		class="settings-panel overflow-hidden transition-all duration-300 ease-in-out"
		style="max-height: {expanded ? '600px' : '0px'}; opacity: {expanded ? '1' : '0'}"
	>
		<div
			class="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/80"
		>
			<!-- Level preset -->
			<div class="mb-4">
				<p
					class="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
				>
					Level preset
				</p>
				<div class="flex items-center gap-2">
					<div
						class="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900"
					>
						{#each levels as lvl (lvl)}
							<button
								onclick={() => onLevelChange(lvl)}
								class="rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200
									{lvl === level && !isCustom
									? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
									: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}"
							>
								{lvl}
							</button>
						{/each}
					</div>
					{#if isCustom}
						<span
							class="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-600 dark:bg-amber-900/50 dark:text-amber-400"
						>
							Custom
						</span>
					{/if}
				</div>
			</div>

			<!-- Cases -->
			<div class="mb-4">
				<p
					class="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
				>
					Cases
				</p>
				<div class="flex flex-wrap gap-2">
					{#each ALL_CASES as c (c)}
						{@const active = selectedCases.includes(c)}
						<button
							onclick={() => toggleCase(c)}
							class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150
								{active
								? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500'
								: 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:bg-slate-700 dark:text-slate-500 dark:hover:bg-slate-600 dark:hover:text-slate-300'}"
							aria-pressed={active}
						>
							{CASE_LABELS[c]}
						</button>
					{/each}
				</div>
			</div>

			<!-- Drill types -->
			<div class="mb-4">
				<p
					class="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
				>
					Drill Types
				</p>
				<div class="flex flex-wrap gap-2">
					{#each ALL_DRILL_TYPES as dt (dt)}
						{@const active = selectedDrillTypes.includes(dt)}
						<button
							onclick={() => toggleDrillType(dt)}
							class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150
								{active
								? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500'
								: 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:bg-slate-700 dark:text-slate-500 dark:hover:bg-slate-600 dark:hover:text-slate-300'}"
							aria-pressed={active}
						>
							{DRILL_TYPE_LABELS[dt]}
						</button>
					{/each}
				</div>
			</div>

			<!-- Number mode -->
			<div class="mb-4">
				<p
					class="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
				>
					Number
				</p>
				<div
					class="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900"
				>
					{#each numberOptions as opt (opt.value)}
						<button
							onclick={() => setNumberMode(opt.value)}
							class="rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200
								{numberMode === opt.value
								? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
								: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}"
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Show word hint toggle -->
			<div>
				<p
					class="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
				>
					Sentence Fill-In
				</p>
				<button
					onclick={toggleShowWordHint}
					class="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm transition-colors"
					role="switch"
					aria-checked={showWordHint}
				>
					<span
						class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200
							{showWordHint ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'}"
					>
						<span
							class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200
								{showWordHint ? 'translate-x-[1.125rem]' : 'translate-x-[0.175rem]'}"
						></span>
					</span>
					<span class="text-xs font-medium text-slate-600 dark:text-slate-300">
						Show word hint
					</span>
				</button>
			</div>
		</div>
	</div>
</div>
