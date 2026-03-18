<script lang="ts">
	import { CASE_COLORS, CASE_NUMBER } from '$lib/types';
	import { casePrepositions } from '$lib/data/prepositions';

	let {
		alwaysExpanded = false
	}: {
		alwaysExpanded?: boolean;
	} = $props();

	let expanded = $state(false);
</script>

<div class="w-full">
	{#if !alwaysExpanded}
		<button
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-expanded={expanded}
			aria-controls="cheat-sheet-panel"
		>
			<span class="font-semibold">Preposition cheat sheet</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>
	{/if}

	<div
		id="cheat-sheet-panel"
		class={alwaysExpanded ? '' : 'overflow-hidden transition-all duration-300 ease-in-out'}
		style={alwaysExpanded
			? undefined
			: `max-height: ${expanded ? '1000px' : '0px'}; opacity: ${expanded ? '1' : '0'}`}
	>
		<div
			class="space-y-4 {alwaysExpanded
				? ''
				: 'mt-2 rounded-[24px] border border-card-stroke bg-card-bg p-5'}"
		>
			{#each casePrepositions as group (group.case_)}
				<div class="rounded-[20px] border-2 border-shaded-background bg-card-bg p-4">
					<div class="mb-2 flex items-center gap-3">
						<span
							class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white {CASE_COLORS[
								group.key
							].bg}"
						>
							{CASE_NUMBER[group.key]}
						</span>
						<span class="text-lg font-semibold {CASE_COLORS[group.key].text}">{group.case_}</span>
					</div>
					<div class="flex flex-wrap gap-x-4 gap-y-1">
						{#each group.prepositions as prep (prep.czech)}
							<span class="text-sm">
								<span class="text-emphasis">{prep.czech}</span>
								<span class="text-text-subtitle"> {prep.english}</span>
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
