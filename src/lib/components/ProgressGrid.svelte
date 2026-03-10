<script lang="ts">
	import type { Progress, Case, Number_ } from '$lib/types';
	import { CASE_LABELS } from '$lib/types';

	let { progress }: { progress: Progress } = $props();

	let expanded = $state(false);

	const cases: { key: Case; label: string }[] = [
		{ key: 'nom', label: CASE_LABELS.nom },
		{ key: 'gen', label: CASE_LABELS.gen },
		{ key: 'dat', label: CASE_LABELS.dat },
		{ key: 'acc', label: CASE_LABELS.acc },
		{ key: 'voc', label: CASE_LABELS.voc },
		{ key: 'loc', label: CASE_LABELS.loc },
		{ key: 'ins', label: CASE_LABELS.ins }
	];

	const numbers: { key: Number_; label: string }[] = [
		{ key: 'sg', label: 'Sg' },
		{ key: 'pl', label: 'Pl' }
	];

	function getCellColor(caseKey: Case, numberKey: Number_): string {
		const key = `${caseKey}_${numberKey}`;
		const score = progress.caseScores[key];
		if (!score || score.attempts === 0) {
			return 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600';
		}
		const accuracy = score.correct / score.attempts;
		if (accuracy >= 0.8) {
			return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400';
		}
		if (accuracy >= 0.5) {
			return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400';
		}
		return 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400';
	}

	function getAttempts(caseKey: Case, numberKey: Number_): number {
		const key = `${caseKey}_${numberKey}`;
		const score = progress.caseScores[key];
		return score?.attempts ?? 0;
	}

	function getCellText(caseKey: Case, numberKey: Number_): string {
		const key = `${caseKey}_${numberKey}`;
		const score = progress.caseScores[key];
		if (!score || score.attempts === 0) return '\u2014';
		const pct = Math.round((score.correct / score.attempts) * 100);
		return `${pct}%`;
	}

	let totalAttempts = $derived(
		Object.values(progress.caseScores).reduce((sum, s) => sum + s.attempts, 0)
	);

	let overallAccuracy = $derived.by(() => {
		const scores = Object.values(progress.caseScores);
		if (scores.length === 0) return 0;
		const totalCorrect = scores.reduce((sum, s) => sum + s.correct, 0);
		const totalAtt = scores.reduce((sum, s) => sum + s.attempts, 0);
		return totalAtt > 0 ? Math.round((totalCorrect / totalAtt) * 100) : 0;
	});
</script>

<div class="w-full">
	<button
		onclick={() => (expanded = !expanded)}
		class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
	>
		<span class="font-semibold">
			Progress
			{#if totalAttempts > 0}
				<span class="ml-1.5 font-normal text-slate-400 dark:text-slate-500">
					{totalAttempts} attempts &middot; {overallAccuracy}% accuracy
				</span>
			{/if}
		</span>
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

	{#if expanded}
		<div
			class="drill-fade-enter mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
		>
			<table class="w-full text-center text-xs">
				<thead>
					<tr class="bg-slate-50 dark:bg-slate-800/80">
						<th class="px-3 py-2 text-left text-slate-400 dark:text-slate-500"></th>
						{#each numbers as num (num.key)}
							<th
								class="px-3 py-2 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
							>
								{num.label}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each cases as c (c.key)}
						<tr
							class="border-t border-slate-100 transition-colors hover:bg-slate-50/50 dark:border-slate-700/50 dark:hover:bg-slate-800/30"
						>
							<td
								class="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300"
							>
								{c.label}
							</td>
							{#each numbers as num (num.key)}
								<td class="px-3 py-2">
									<span
										class="inline-block min-w-[2.5rem] rounded-lg px-2 py-1 text-xs font-bold {getCellColor(
											c.key,
											num.key
										)}"
										title="{getAttempts(c.key, num.key)} attempts"
									>
										{getCellText(c.key, num.key)}
									</span>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
