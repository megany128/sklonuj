<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { loadPronounBank } from '$lib/engine/pronoun-drill';
	import { CASE_HEX, CASE_LABELS, CASE_NUMBER } from '$lib/types';
	import type { Case, PronounCaseForms, PronounEntry } from '$lib/types';

	/**
	 * Pronoun forms one case at a time: a tab per case, a row per pronoun. A
	 * learner usually knows the case they need and is looking for the word,
	 * so every pronoun in that case sits side by side. Vocative is left out —
	 * pronouns have none of their own.
	 */
	const CASE_TABS: Case[] = ['nom', 'gen', 'dat', 'acc', 'loc', 'ins'];
	const pronounBank = loadPronounBank();

	let {
		initialPronoun = '',
		initialCase = null,
		alwaysExpanded = false
	}: {
		/** Pronoun to highlight (the one the learner looked up). */
		initialPronoun?: string;
		/** Case to open on, e.g. the case of the pronoun question in view. */
		initialCase?: Case | null;
		alwaysExpanded?: boolean;
	} = $props();

	let expanded = $state(false);
	let selectedCase: Case = $state('nom');

	// Open where the looked-up pronoun is visible: the question's case when
	// there is one, else genitive — the nominative tab is a note, not rows.
	$effect(() => {
		if (initialCase && CASE_TABS.includes(initialCase)) selectedCase = initialCase;
		else if (initialPronoun.trim() !== '') selectedCase = 'gen';
	});

	/** A pronoun's forms in the number it actually has (my, vy, oni are plural-only). */
	function formsOf(p: PronounEntry): PronounCaseForms | null {
		return p.forms.sg ?? p.forms.pl;
	}

	interface Row {
		lemma: string;
		translation: string;
		bare: string;
		prep: string;
	}

	let rows: Row[] = $derived(
		pronounBank.flatMap((p) => {
			const forms = formsOf(p)?.[selectedCase];
			if (!forms || (forms.bare === '' && forms.prep === '')) return [];
			return [{ lemma: p.lemma, translation: p.translation, bare: forms.bare, prep: forms.prep }];
		})
	);

	/** Some row has a full form beside the everyday one (tě · tebe), so the key is needed. */
	let hasFullForms = $derived(rows.some((r) => r.bare.includes('/')));

	let highlighted = $derived(initialPronoun.trim());
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
			<!-- Case tabs -->
			<div role="tablist" aria-label="Case" class="flex flex-wrap gap-1.5">
				{#each CASE_TABS as c (c)}
					{@const active = selectedCase === c}
					<button
						type="button"
						role="tab"
						aria-selected={active}
						onclick={() => (selectedCase = c)}
						class="inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors {active
							? 'border-emphasis bg-shaded-background font-semibold text-text-default'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					>
						<span
							class="inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
							style="background-color: {CASE_HEX[c]}"
							><span class="digit-nudge">{CASE_NUMBER[c]}</span></span
						>
						{CASE_LABELS[c]}
					</button>
				{/each}
			</div>

			{#if selectedCase === 'nom'}
				<!-- Nominative forms are the pronouns themselves, so a table would only repeat them. -->
				<p class="px-1 text-sm leading-relaxed text-text-default">
					The nominative is the pronoun itself: <span class="font-semibold"
						>{rows.map((r) => r.lemma).join(', ')}</span
					>.
					<span class="text-text-subtitle"><span class="italic">Se</span> has no nominative.</span>
				</p>
			{:else}
				<!-- One row per pronoun in the selected case -->
				<div
					class="overflow-x-auto"
					role="tabpanel"
					aria-label="{CASE_LABELS[selectedCase]} pronouns"
				>
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
								<th class="py-2 pl-3 pr-3">Pronoun</th>
								<th class="py-2 pr-3">No preposition</th>
								<th class="py-2 pr-3">After prep.</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row, i (row.lemma)}
								<tr
									class="border-b border-card-stroke {row.lemma === highlighted
										? 'bg-warning-background'
										: i % 2 === 0
											? 'bg-shaded-background/50'
											: ''}"
								>
									<td class="py-2 pl-3 pr-3">
										<span class="font-semibold text-text-default" title={row.translation}
											>{row.lemma}</span
										>
									</td>
									<td class="py-2 pr-3">
										{#if row.bare === ''}
											<span class="text-darker-shaded-background">&mdash;</span>
										{:else}
											{@const [everyday, ...full] = row.bare.split('/')}
											<span class="text-text-default">{everyday}</span>
											{#if full.length > 0}
												<span class="text-text-subtitle"> · {full.join(' · ')}</span>
											{/if}
										{/if}
									</td>
									<td class="py-2 pr-3">
										{#if row.prep === ''}
											<span class="text-darker-shaded-background">&mdash;</span>
										{:else}
											<span class="text-text-default">{row.prep}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if hasFullForms}
				<p class="text-xs text-text-subtitle">
					Grey: the full form, for emphasis or to start a sentence (<span class="italic"
						>Tebe vidím, ne jeho</span
					>)
				</p>
			{/if}
		</div>
	</div>
</div>
