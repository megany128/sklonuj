<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
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
			<BookOpen class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="font-semibold">{CASE_LABELS[case_]} prepositions</span>
			<ChevronDown
				class="h-3.5 w-3.5 transition-transform {expanded ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
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
