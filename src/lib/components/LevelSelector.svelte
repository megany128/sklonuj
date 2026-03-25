<script lang="ts">
	import type { Difficulty } from '$lib/types';
	import { DIFFICULTY_META } from '$lib/constants';

	let {
		level,
		isCustom,
		onLevelChange
	}: { level: Difficulty; isCustom: boolean; onLevelChange: (level: Difficulty) => void } =
		$props();

	const levels: Difficulty[] = ['A1', 'A2', 'B1', 'B2'];
</script>

<div class="flex items-center gap-3">
	<div
		class="inline-flex rounded-xl border border-card-stroke bg-shaded-background p-1"
		role="radiogroup"
		aria-label="Difficulty level"
	>
		{#each levels as lvl (lvl)}
			<button
				role="radio"
				aria-checked={lvl === level && !isCustom}
				class="relative flex flex-col items-center rounded-lg px-4 py-1.5 transition-all duration-200
					{lvl === level && !isCustom
					? 'bg-card-bg text-text-default shadow-sm'
					: 'text-text-subtitle hover:text-text-default'}"
				onclick={() => onLevelChange(lvl)}
			>
				<span class="text-sm font-semibold">{lvl}</span>
				<span
					class="text-xs leading-tight {lvl === level && !isCustom
						? 'text-emphasis'
						: 'text-text-subtitle/50'}"
				>
					{DIFFICULTY_META[lvl].subtitle}
				</span>
			</button>
		{/each}
	</div>
	{#if isCustom}
		<span
			class="rounded-full bg-warning-text/10 px-2.5 py-0.5 text-xs font-semibold text-warning-text"
		>
			Custom
		</span>
	{/if}
</div>
