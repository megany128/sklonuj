<script lang="ts">
	import type { DrillType } from '$lib/types';
	import { ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	let {
		selectedDrillTypes,
		numberMode,
		onSettingsChange
	}: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		onSettingsChange: (settings: {
			selectedDrillTypes: DrillType[];
			numberMode: 'sg' | 'pl' | 'both';
		}) => void;
	} = $props();

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

<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
	<!-- Drill types -->
	<div class="flex items-center gap-2">
		<span class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-text-subtitle"
			>Type</span
		>
		<div class="flex flex-wrap gap-1.5">
			{#each ALL_DRILL_TYPES as dt (dt)}
				{@const active = selectedDrillTypes.includes(dt)}
				<button
					onclick={() => toggleDrillType(dt)}
					class="rounded-full border px-2.5 py-1 text-xs font-normal transition-all duration-150
								{active
						? 'border-card-stroke bg-darker-shaded-background text-text-default'
						: 'border-transparent bg-shaded-background text-text-subtitle hover:bg-darker-shaded-background hover:text-text-default'}"
					aria-pressed={active}
				>
					{DRILL_TYPE_LABELS[dt]}
				</button>
			{/each}
		</div>
	</div>

	<!-- Number mode -->
	<div class="flex items-center gap-2">
		<span class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-text-subtitle"
			>Number</span
		>
		<div class="inline-flex rounded-[16px] border border-card-stroke bg-card-bg p-1">
			{#each numberOptions as opt (opt.value)}
				<button
					onclick={() => setNumberMode(opt.value)}
					class="rounded-[12px] px-3 py-1 text-xs font-normal transition-all
								{numberMode === opt.value
						? 'bg-shaded-background text-text-default'
						: 'text-text-subtitle hover:text-text-default'}"
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</div>
</div>
