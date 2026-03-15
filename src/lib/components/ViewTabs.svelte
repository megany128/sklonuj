<script lang="ts">
	type View = 'exercise' | 'declension';

	let {
		activeView,
		onViewChange
	}: {
		activeView: View;
		onViewChange: (view: View) => void;
	} = $props();

	const tabs: { id: View; label: string }[] = [
		{ id: 'exercise', label: 'Exercises' },
		{ id: 'declension', label: 'Look Up' }
	];
</script>

<div class="mx-auto w-full max-w-4xl px-4 pt-6 pb-3">
	<div
		class="flex overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-slate-700/60 dark:bg-slate-800/80"
	>
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				onclick={() => onViewChange(tab.id)}
				class="flex-1 py-2.5 text-center text-sm font-semibold transition-colors
					{activeView === tab.id
					? 'bg-brand-600 text-white dark:bg-brand-500'
					: 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>
