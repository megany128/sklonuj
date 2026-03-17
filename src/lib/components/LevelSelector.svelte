<script lang="ts">
	import type { Difficulty } from '$lib/types';

	let {
		level,
		isCustom,
		onLevelChange
	}: { level: Difficulty; isCustom: boolean; onLevelChange: (level: Difficulty) => void } =
		$props();

	const levels: Difficulty[] = ['A1', 'A2', 'B1'];
</script>

<div class="flex items-center gap-3">
	<div
		class="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
		role="tablist"
		aria-label="Difficulty level"
	>
		{#each levels as lvl (lvl)}
			<button
				role="tab"
				aria-selected={lvl === level && !isCustom}
				class="relative rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-200
					{lvl === level && !isCustom
					? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
					: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}"
				onclick={() => onLevelChange(lvl)}
			>
				{lvl}
			</button>
		{/each}
	</div>
	{#if isCustom}
		<span
			class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-900/50 dark:text-amber-400"
		>
			Custom
		</span>
	{/if}
</div>
