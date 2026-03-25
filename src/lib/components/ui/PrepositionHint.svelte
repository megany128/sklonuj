<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_COLORS, CASE_LABELS } from '$lib/types';
	import { casePrepositions } from '$lib/data/prepositions';

	let {
		case_,
		trigger = undefined
	}: {
		case_: Case;
		trigger?: string;
	} = $props();

	let prepositions = $derived.by(() => {
		const group = casePrepositions.find((g) => g.key === case_);
		return group?.prepositions ?? [];
	});

	let expanded = $state(false);

	function isHighlighted(czech: string, trig: string): boolean {
		// Match trigger against czech, handling slash-separated variants like "z / ze" or "k / ke"
		const variants = czech.split('/').map((v) => v.trim());
		return variants.some((v) => v.toLowerCase() === trig.toLowerCase());
	}
</script>

{#if prepositions.length > 0}
	<div class="w-full border-t border-darker-subtitle/30 pt-3">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="flex w-full items-center justify-center gap-1.5 text-xs text-darker-subtitle transition-colors hover:text-text-default"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-3.5 w-3.5"
			>
				<path d="M2 6h4" />
				<path d="M2 10h4" />
				<path d="M2 14h4" />
				<path d="M2 18h4" />
				<rect width="16" height="20" x="4" y="2" rx="2" />
				<path d="M9.5 8h5" />
				<path d="M9.5 12H16" />
				<path d="M9.5 16H14" />
			</svg>
			<span class="font-semibold">{CASE_LABELS[case_]} prepositions</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-3.5 w-3.5 transition-transform {expanded ? 'rotate-180' : ''}"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		{#if expanded}
			<div class="mt-2.5 flex flex-wrap justify-center gap-1.5">
				{#each prepositions as entry (entry.czech)}
					{@const highlighted = trigger ? isHighlighted(entry.czech, trigger) : false}
					<div
						class="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 {highlighted
							? `${CASE_COLORS[case_].bg} text-on-accent`
							: 'bg-darker-shaded-background text-text-default'}"
						title={entry.english}
					>
						<span class="text-sm font-semibold leading-tight">{entry.czech}</span>
						<span
							class="text-xs leading-tight {highlighted
								? 'text-on-accent/80'
								: 'text-text-subtitle'}">{entry.english}</span
						>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
