<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
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
			return 'bg-shaded-background text-text-subtitle';
		}
		const accuracy = score.correct / score.attempts;
		if (accuracy >= 0.8) {
			return 'bg-positive-background text-positive-stroke';
		}
		if (accuracy >= 0.5) {
			return 'bg-warning-background text-warning-text';
		}
		return 'bg-negative-background text-negative-stroke';
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

	function getCellAriaLabel(caseKey: Case, numberKey: Number_): string {
		const caseLabel = CASE_LABELS[caseKey];
		const numLabel = numberKey === 'sg' ? 'Singular' : 'Plural';
		const key = `${caseKey}_${numberKey}`;
		const score = progress.caseScores[key];
		if (!score || score.attempts === 0) return `${caseLabel} ${numLabel}: no attempts`;
		const pct = Math.round((score.correct / score.attempts) * 100);
		return `${caseLabel} ${numLabel}: ${pct}% accuracy, ${score.attempts} attempts`;
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

	let pronounScores = $derived.by(() => {
		const scores: Record<string, { attempts: number; correct: number }> = {};
		for (const [key, value] of Object.entries(progress.paradigmScores)) {
			if (key.startsWith('pronoun_')) {
				// Extract lemma from key: pronoun_já_dat_sg -> já
				const parts = key.split('_');
				const lemma = parts[1];
				if (!scores[lemma]) {
					scores[lemma] = { attempts: 0, correct: 0 };
				}
				scores[lemma].attempts += value.attempts;
				scores[lemma].correct += value.correct;
			}
		}
		return scores;
	});

	let hasPronounScores = $derived(Object.keys(pronounScores).length > 0);
</script>

<div class="w-full">
	<button
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		aria-controls="progress-grid-panel"
		class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
	>
		<span class="font-semibold">
			Progress
			{#if totalAttempts > 0}
				<span class="ml-1.5 font-normal text-text-subtitle">
					{totalAttempts} attempts &middot; {overallAccuracy}% accuracy
				</span>
			{/if}
		</span>
		<ChevronDown
			class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
			aria-hidden="true"
		/>
	</button>

	{#if expanded}
		<div
			id="progress-grid-panel"
			class="drill-fade-enter mt-2 overflow-hidden rounded-xl border border-card-stroke"
		>
			<table class="w-full text-center text-xs">
				<thead>
					<tr class="bg-card-bg">
						<th class="px-3 py-2 text-left text-text-subtitle"></th>
						{#each numbers as num (num.key)}
							<th class="px-3 py-2 font-semibold tracking-wide text-text-subtitle uppercase">
								{num.label}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each cases as c (c.key)}
						<tr class="border-t border-card-stroke transition-colors hover:bg-shaded-background/50">
							<td class="px-3 py-2 text-left text-xs font-semibold text-emphasis">
								{c.label}
							</td>
							{#each numbers as num (num.key)}
								<td class="px-3 py-2">
									<span
										class="inline-block min-w-[2.5rem] rounded-lg px-2 py-1 text-xs font-semibold {getCellColor(
											c.key,
											num.key
										)}"
										title="{getAttempts(c.key, num.key)} attempts"
										aria-label={getCellAriaLabel(c.key, num.key)}
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

		{#if hasPronounScores}
			<div class="mt-3 overflow-hidden rounded-xl border border-card-stroke">
				<div class="bg-card-bg px-3 py-2">
					<span class="text-xs font-semibold uppercase tracking-wide text-text-subtitle"
						>Pronouns</span
					>
				</div>
				<div class="divide-y divide-card-stroke">
					{#each Object.entries(pronounScores).sort( (a, b) => a[0].localeCompare(b[0]) ) as [lemma, score] (lemma)}
						{@const accuracy =
							score.attempts > 0 ? Math.round((score.correct / score.attempts) * 100) : 0}
						{@const colorClass =
							score.attempts === 0
								? 'bg-shaded-background text-text-subtitle'
								: accuracy >= 80
									? 'bg-positive-background text-positive-stroke'
									: accuracy >= 50
										? 'bg-warning-background text-warning-text'
										: 'bg-negative-background text-negative-stroke'}
						<div
							class="flex items-center justify-between px-3 py-2 transition-colors hover:bg-shaded-background/50"
						>
							<span class="text-xs font-semibold text-emphasis">{lemma}</span>
							<div class="flex items-center gap-2">
								<span class="text-xs text-text-subtitle">{score.attempts} attempts</span>
								<span
									class="inline-block min-w-[2.5rem] rounded-lg px-2 py-1 text-center text-xs font-semibold {colorClass}"
								>
									{accuracy}%
								</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
