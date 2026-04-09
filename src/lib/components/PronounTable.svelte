<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { loadPronounBank } from '$lib/engine/pronoun-drill';
	import { CASE_LABELS } from '$lib/types';
	import type { Case, PronounCaseForms, PronounEntry } from '$lib/types';

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
	const pronounBank = loadPronounBank();

	let {
		initialPronoun = '',
		alwaysExpanded = false
	}: {
		initialPronoun?: string;
		alwaysExpanded?: boolean;
	} = $props();

	let expanded = $state(false);
	let selectedPronoun: PronounEntry | null = $state(pronounBank[0] ?? null);

	/** Check if a PronounCaseForms object has any non-empty forms */
	function hasNonEmptyForms(forms: PronounCaseForms | null): boolean {
		if (!forms) return false;
		return CASE_ORDER.some((c) => forms[c].prep !== '' || forms[c].bare !== '');
	}

	let hasSgForms = $derived(selectedPronoun ? hasNonEmptyForms(selectedPronoun.forms.sg) : false);

	let currentForms: PronounCaseForms | null = $derived.by(() => {
		if (!selectedPronoun) return null;
		if (hasSgForms) return selectedPronoun.forms.sg;
		return selectedPronoun.forms.pl;
	});

	let currentNumber = $derived(hasSgForms ? 'Singular' : 'Plural');

	$effect(() => {
		if (initialPronoun && initialPronoun.trim() !== '') {
			const found = pronounBank.find((p) => p.lemma === initialPronoun.trim());
			if (found) selectedPronoun = found;
		}
	});
</script>

<div class="w-full">
	{#if !alwaysExpanded}
		<button
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-expanded={expanded}
			aria-controls="pronoun-table-panel"
		>
			<span class="font-semibold">Pronoun table</span>
			<ChevronDown
				class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</button>
	{/if}

	<div
		id="pronoun-table-panel"
		class={alwaysExpanded ? '' : 'overflow-hidden transition-all duration-300 ease-in-out'}
		style={alwaysExpanded
			? undefined
			: `max-height: ${expanded ? '2000px' : '0px'}; opacity: ${expanded ? '1' : '0'}`}
	>
		<div
			class="space-y-4 {alwaysExpanded
				? 'rounded-2xl border border-card-stroke bg-card-bg p-4'
				: 'mt-2 rounded-2xl border border-card-stroke bg-card-bg p-4'}"
		>
			<!-- Pronoun selector pills -->
			<div class="flex flex-wrap gap-1.5">
				{#each pronounBank as p (p.lemma)}
					<button
						type="button"
						onclick={() => (selectedPronoun = p)}
						class="rounded-full border px-2.5 py-1 text-xs transition-colors {selectedPronoun?.lemma ===
						p.lemma
							? 'border-emphasis bg-shaded-background font-semibold text-text-default'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					>
						{p.lemma}
					</button>
				{/each}
			</div>

			<!-- Selected pronoun info -->
			{#if selectedPronoun}
				<div class="flex flex-wrap items-center gap-2 px-1">
					<span class="text-sm font-semibold text-text-default">
						{selectedPronoun.lemma}
					</span>
					<span class="text-xs text-text-subtitle">
						{selectedPronoun.translation}
					</span>
					<span
						class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
					>
						{currentNumber}
					</span>
				</div>
			{/if}

			<!-- Declension table -->
			{#if selectedPronoun && currentForms}
				<div class="overflow-x-auto">
					<table class="w-full table-fixed text-sm">
						<colgroup>
							<col class="w-[30%]" />
							<col class="w-[35%]" />
							<col class="w-[35%]" />
						</colgroup>
						<thead>
							<tr
								class="border-b border-card-stroke text-left text-xs font-semibold uppercase tracking-wider text-text-subtitle"
							>
								<th class="py-2 pr-3">Case</th>
								<th class="py-2 pr-3">After prep.</th>
								<th class="py-2">Without prep.</th>
							</tr>
						</thead>
						<tbody>
							{#each CASE_ORDER as caseKey, i (caseKey)}
								{@const forms = currentForms[caseKey]}
								<tr
									class="border-b border-card-stroke {i % 2 === 0 ? 'bg-shaded-background/50' : ''}"
								>
									<td class="py-2 pr-3 text-xs font-normal text-text-subtitle">
										{CASE_LABELS[caseKey]}
									</td>
									<td class="py-2 pr-3">
										{#if forms.prep === ''}
											<span class="text-darker-shaded-background">&mdash;</span>
										{:else}
											<span class="text-text-default">{forms.prep}</span>
										{/if}
									</td>
									<td class="py-2">
										{#if forms.bare === ''}
											<span class="text-darker-shaded-background">&mdash;</span>
										{:else}
											<span class="text-text-default">{forms.bare}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>
