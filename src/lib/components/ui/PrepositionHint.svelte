<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_COLORS, CASE_LABELS } from '$lib/types';
	import caseDescriptions from '$lib/data/case_descriptions.json';

	let {
		case_,
		trigger = undefined
	}: {
		case_: Case;
		trigger?: string;
	} = $props();

	interface PrepEntry {
		prep: string;
		meaning: string;
		example: string;
	}

	let prepositions: PrepEntry[] = $derived(
		(caseDescriptions[case_] as { prepositions: PrepEntry[] }).prepositions
	);

	let expanded = $state(false);

	function isHighlighted(prep: string, trig: string): boolean {
		// Match trigger against prep, handling slash-separated variants like "z/ze" or "k/ke"
		const variants = prep.split('/');
		return variants.some((v) => v.toLowerCase() === trig.toLowerCase());
	}
</script>

{#if prepositions.length > 0}
	<div class="w-full border-t border-darker-subtitle/30 pt-3">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-center gap-1.5 text-xs text-darker-subtitle transition-colors hover:text-text-default"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-3.5 w-3.5"
			>
				<path
					d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z"
				/>
			</svg>
			<span class="font-semibold">Prepositions &rarr; {CASE_LABELS[case_]}</span>
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
				{#each prepositions as entry (entry.prep)}
					{@const highlighted = trigger ? isHighlighted(entry.prep, trigger) : false}
					<div
						class="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 {highlighted
							? `${CASE_COLORS[case_].bg} text-on-accent`
							: 'bg-darker-shaded-background text-text-default'}"
						title="{entry.meaning} — {entry.example}"
					>
						<span class="text-sm font-semibold leading-tight">{entry.prep}</span>
						<span
							class="text-[10px] leading-tight {highlighted
								? 'text-on-accent/80'
								: 'text-text-subtitle'}">{entry.meaning}</span
						>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
