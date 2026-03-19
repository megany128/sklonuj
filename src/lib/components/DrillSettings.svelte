<script lang="ts">
	import type { DrillType, ContentMode } from '$lib/types';
	import { ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	let {
		selectedDrillTypes,
		numberMode,
		contentMode = 'nouns' as ContentMode,
		pronounsUnlocked = false,
		onSettingsChange,
		hiddenDrillTypes = [],
		hideNumberMode = false
	}: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		contentMode?: ContentMode;
		pronounsUnlocked?: boolean;
		onSettingsChange: (settings: {
			selectedDrillTypes: DrillType[];
			numberMode: 'sg' | 'pl' | 'both';
			contentMode?: ContentMode;
		}) => void;
		hiddenDrillTypes?: DrillType[];
		hideNumberMode?: boolean;
	} = $props();

	let visibleDrillTypes = $derived(ALL_DRILL_TYPES.filter((dt) => !hiddenDrillTypes.includes(dt)));

	function toggleDrillType(dt: DrillType) {
		const isSelected = selectedDrillTypes.includes(dt);
		if (isSelected && selectedDrillTypes.length <= 1) return;
		const next = isSelected
			? selectedDrillTypes.filter((x) => x !== dt)
			: [...selectedDrillTypes, dt];
		onSettingsChange({ selectedDrillTypes: next, numberMode, contentMode });
	}

	function setNumberMode(mode: 'sg' | 'pl' | 'both') {
		onSettingsChange({ selectedDrillTypes, numberMode: mode, contentMode });
	}

	function setContentMode(mode: ContentMode) {
		onSettingsChange({ selectedDrillTypes, numberMode, contentMode: mode });
	}

	const contentOptions: { value: ContentMode; label: string }[] = [
		{ value: 'nouns', label: 'Nouns' },
		{ value: 'pronouns', label: 'Pronouns' },
		{ value: 'both', label: 'Both' }
	];

	const numberOptions: { value: 'sg' | 'pl' | 'both'; label: string }[] = [
		{ value: 'sg', label: 'Singular' },
		{ value: 'pl', label: 'Plural' },
		{ value: 'both', label: 'Both' }
	];
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
	<!-- Content mode (only shown when pronouns are unlocked) -->
	{#if pronounsUnlocked}
		<div class="flex items-center gap-2" role="group" aria-label="Content type">
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Content</span>
			<div class="flex gap-1.5">
				{#each contentOptions as opt (opt.value)}
					<button
						onclick={() => setContentMode(opt.value)}
						aria-pressed={contentMode === opt.value}
						class="rounded-full border px-2.5 py-1 text-xs transition-all {contentMode === opt.value
							? 'border-emphasis bg-shaded-background font-semibold text-text-default'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Drill types -->
	<div class="flex items-center gap-2" role="group" aria-label="Exercise type">
		<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Type</span>
		<div class="flex gap-1.5">
			{#each visibleDrillTypes as dt (dt)}
				{@const active = selectedDrillTypes.includes(dt)}
				<button
					onclick={() => toggleDrillType(dt)}
					class="rounded-full border px-2.5 py-1 text-xs transition-all {active
						? 'border-emphasis bg-shaded-background font-semibold text-text-default'
						: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					aria-pressed={active}
				>
					{DRILL_TYPE_LABELS[dt]}
				</button>
			{/each}
		</div>
	</div>

	<!-- Number mode (hidden when chapter forces singular only) -->
	{#if !hideNumberMode}
		<div class="flex items-center gap-2" role="group" aria-label="Grammatical number">
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Number</span>
			<div class="flex gap-1.5">
				{#each numberOptions as opt (opt.value)}
					<button
						onclick={() => setNumberMode(opt.value)}
						aria-pressed={numberMode === opt.value}
						class="rounded-full border px-2.5 py-1 text-xs transition-all {numberMode === opt.value
							? 'border-emphasis bg-shaded-background font-semibold text-text-default'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
