<script lang="ts">
	import type { Case } from '$lib/types';
	import CaseBadge from './CaseBadge.svelte';
	import DottedUnderline from './DottedUnderline.svelte';

	let {
		correctAnswer,
		case_,
		explanations,
		onSpeak
	}: {
		correctAnswer: string;
		case_: Case;
		explanations: string[];
		onSpeak?: (text: string) => void;
	} = $props();
</script>

<div class="rounded-2xl border-2 border-dashed border-card-stroke p-5">
	<p class="mb-3 text-xs font-semibold uppercase tracking-wider text-text-subtitle">Correct answer:</p>
	<div class="mb-3 flex items-center gap-3">
		<div class="flex flex-col items-center">
			<span class="text-2xl font-semibold text-text-default">{correctAnswer}</span>
			<DottedUnderline />
		</div>
		{#if onSpeak}
			<button
				type="button"
				onclick={() => onSpeak?.(correctAnswer)}
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-card-stroke hover:text-text-default"
				aria-label="Listen to pronunciation"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
				>
					<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
					<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
					<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
				</svg>
			</button>
		{/if}
	</div>
	<div class="mb-3">
		<CaseBadge {case_} size="sm" />
	</div>
	{#if explanations.length > 0}
		<div class="space-y-1">
			{#each explanations as explanation, i (i)}
				<p class="text-sm text-text-subtitle">{explanation}</p>
			{/each}
		</div>
	{/if}
</div>
