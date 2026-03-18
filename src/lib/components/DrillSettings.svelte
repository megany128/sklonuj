<script lang="ts">
	import type { DrillType } from '$lib/types';
	import { ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	let {
		selectedDrillTypes,
		numberMode,
		onSettingsChange,
		hiddenDrillTypes = [],
		hideNumberMode = false
	}: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		onSettingsChange: (settings: {
			selectedDrillTypes: DrillType[];
			numberMode: 'sg' | 'pl' | 'both';
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
		onSettingsChange({ selectedDrillTypes: next, numberMode });
	}

	function setNumberMode(mode: 'sg' | 'pl' | 'both') {
		onSettingsChange({ selectedDrillTypes, numberMode: mode });
	}

	const numberOptions: { value: 'sg' | 'pl' | 'both'; label: string }[] = [
		{ value: 'sg', label: 'Singular' },
		{ value: 'pl', label: 'Plural' },
		{ value: 'both', label: 'Both' }
	];
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
	<!-- Drill types -->
	<div class="flex items-center gap-2" role="group" aria-label="Exercise type">
		<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Type</span>
		<div class="flex flex-wrap gap-1.5">
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
			<div class="flex flex-wrap gap-1.5">
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
