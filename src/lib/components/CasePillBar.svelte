<script lang="ts">
	import { type Case, ALL_CASES, CASE_LABELS, CASE_NUMBER, CASE_HEX } from '$lib/types';

	interface Props {
		selectedCase: Case | 'all';
		caseStrengths: Record<Case, { accuracy: number; attempts: number }>;
		onSelect: (selected: Case | 'all') => void;
	}

	let { selectedCase, caseStrengths, onSelect }: Props = $props();

	const ACCURACY_COLORS = {
		red: '#d73e3e',
		amber: '#e5a000',
		green: '#40c607'
	};

	function handleCaseClick(c: Case) {
		if (selectedCase === c) return;
		onSelect(c);
	}

	function accuracyColor(accuracy: number): string {
		if (accuracy < 0.5) return ACCURACY_COLORS.red;
		if (accuracy < 0.8) return ACCURACY_COLORS.amber;
		return ACCURACY_COLORS.green;
	}
</script>

<div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
	<button
		class="flex items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-2 text-sm font-semibold transition-all duration-200
			{selectedCase === 'all'
			? 'border-emphasis bg-emphasis text-text-inverted'
			: 'border-card-stroke bg-card-bg text-text-default hover:border-emphasis/40'}"
		onclick={() => onSelect('all')}
	>
		All
	</button>

	{#each ALL_CASES as c (c)}
		{@const isSelected = selectedCase === c}
		{@const strength = caseStrengths[c]}
		{@const hex = CASE_HEX[c]}
		{@const accuracyPct = strength.attempts > 0 ? Math.round(strength.accuracy * 100) : null}
		{@const accColor = strength.attempts > 0 ? accuracyColor(strength.accuracy) : null}
		<button
			class="case-pill flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-2 text-sm font-semibold transition-all duration-200 ease-out
				{accColor && !isSelected ? '' : 'border-card-stroke'}"
			style={isSelected
				? `background-color: color-mix(in oklch, ${hex} 10%, var(--color-card-bg)); border-color: ${hex}; box-shadow: 0 0 0 3px color-mix(in oklch, ${hex} 15%, transparent); --case-color: ${hex}`
				: `--case-color: ${hex}; ${accColor ? `background-color: ${accColor}18; border-color: ${accColor}70` : ''}`}
			onclick={() => handleCaseClick(c)}
		>
			<span class="flex items-center gap-1" style="color: {hex}">
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
					style="background-color: {hex}"
				>
					{CASE_NUMBER[c]}
				</span>
				<span class="hidden sm:inline">{CASE_LABELS[c].slice(0, 3)}</span>
			</span>
			{#if accuracyPct !== null && accColor}
				<span class="text-xs font-bold" style="color: {accColor}">{accuracyPct}%</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.case-pill:hover {
		border-color: var(--case-color) !important;
		background-color: color-mix(in oklch, var(--case-color) 10%, var(--color-card-bg)) !important;
	}
</style>
