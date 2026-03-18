<script lang="ts">
	import { CASE_LABELS, isCase, isNumber } from '$lib/types';

	let {
		totalAnswered,
		correctCount,
		weakestArea,
		ondismiss
	}: {
		totalAnswered: number;
		correctCount: number;
		weakestArea: string | null;
		ondismiss: () => void;
	} = $props();

	let pct = $derived(totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0);

	function formatWeakestArea(key: string | null): string {
		if (!key) return 'None yet';
		const parts = key.split('_');
		if (parts.length < 2) return key;
		const caseStr = parts[0];
		const numberStr = parts[1];
		if (!caseStr || !numberStr || !isCase(caseStr) || !isNumber(numberStr)) return key;
		const caseName = CASE_LABELS[caseStr];
		return `${caseName} ${numberStr === 'pl' ? 'plural' : 'singular'}`;
	}
</script>

<div
	class="drill-fade-enter w-full rounded-2xl border border-brand-200/60 bg-brand-50/30 p-5 dark:border-brand-800/40 dark:bg-brand-950/20"
>
	<p
		class="mb-2 text-center text-xs font-semibold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400"
	>
		Session checkpoint
	</p>
	<p class="text-center text-lg font-semibold text-emphasis">
		{totalAnswered} questions answered: {correctCount}/{totalAnswered} correct ({pct}%)
	</p>
	{#if weakestArea}
		<p class="mt-1 text-center text-sm text-text-subtitle">
			Weakest area: <span class="font-semibold text-negative-stroke"
				>{formatWeakestArea(weakestArea)}</span
			>
		</p>
	{/if}
	<div class="mt-4 text-center">
		<button
			onclick={ondismiss}
			class="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition-all hover:bg-brand-700 hover:shadow-md active:scale-[0.98] dark:bg-brand-500 dark:hover:bg-brand-400"
		>
			Continue
		</button>
	</div>
</div>
