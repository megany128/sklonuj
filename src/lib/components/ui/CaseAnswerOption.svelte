<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_LABELS, CASE_COLORS, CASE_HEX, CASE_NUMBER } from '$lib/types';

	let {
		case_,
		selected = false,
		disabled = false,
		correct = false,
		incorrect = false,
		dimmed = false,
		onclick
	}: {
		case_: Case;
		selected?: boolean;
		disabled?: boolean;
		correct?: boolean;
		incorrect?: boolean;
		dimmed?: boolean;
		onclick?: () => void;
	} = $props();

	let isInteractive = $derived(!correct && !incorrect && !dimmed && !selected && !disabled);

	let buttonClass = $derived.by(() => {
		const base =
			'case-answer-option flex items-center gap-1.5 sm:gap-2.5 rounded-full border-2 px-3 py-2 sm:px-4 sm:py-2.5 transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emphasis';

		if (correct) {
			return `${base} border-positive-stroke bg-positive-background text-positive-stroke`;
		}
		if (incorrect) {
			return `${base} border-negative-stroke bg-negative-background text-negative-stroke`;
		}
		if (dimmed) {
			return `${base} border-card-stroke bg-card-bg text-text-subtitle opacity-40 cursor-not-allowed`;
		}
		if (selected) {
			return `${base} ${CASE_COLORS[case_].bg} ${CASE_COLORS[case_].border} text-on-accent`;
		}
		return `${base} border-card-stroke bg-card-bg text-text-default ${disabled ? 'cursor-not-allowed opacity-50' : 'case-answer-interactive cursor-pointer'}`;
	});

	let caseHex = $derived(CASE_HEX[case_]);
</script>

<button
	type="button"
	onclick={() => {
		if (!disabled && !dimmed) onclick?.();
	}}
	disabled={disabled || dimmed}
	class={buttonClass}
	style={isInteractive ? `--case-color: ${caseHex}` : ''}
>
	<span
		class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-transform duration-200
			{correct
			? 'bg-positive-stroke text-white'
			: incorrect
				? 'bg-negative-stroke text-white'
				: selected
					? `bg-card-bg ${CASE_COLORS[case_].text}`
					: `${CASE_COLORS[case_].bg} text-white`}"
	>
		{CASE_NUMBER[case_]}
	</span>
	<span class="transition-colors duration-200">{CASE_LABELS[case_]}</span>
</button>

<style>
	.case-answer-interactive:hover {
		border-color: var(--case-color);
		background-color: color-mix(in oklch, var(--case-color) 8%, var(--color-card-bg));
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--case-color) 15%, transparent);
		transform: scale(1.02);
	}

	.case-answer-interactive:hover span:first-child {
		transform: scale(1.1);
	}

	.case-answer-interactive:active {
		transform: scale(0.98);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--case-color) 20%, transparent);
	}
</style>
