<script lang="ts">
	import Table from '@lucide/svelte/icons/table';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { loadAdjectiveBank } from '$lib/engine/adjective-drill';
	import type { AdjectiveGenderKey, Case, CaseForms, Number_ } from '$lib/types';
	import {
		CASE_LABELS,
		CASE_INDEX,
		CASE_COLORS,
		CASE_NUMBER,
		ADJECTIVE_GENDER_LABELS
	} from '$lib/types';

	let {
		lemma,
		genderKey,
		case_,
		number_
	}: {
		lemma: string;
		genderKey: AdjectiveGenderKey;
		case_: Case;
		number_: Number_;
	} = $props();

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	function lookupForms(l: string, gk: AdjectiveGenderKey): { sg: CaseForms; pl: CaseForms } | null {
		const bank = loadAdjectiveBank();
		const entry = bank.find((a) => a.lemma.toLowerCase() === l.toLowerCase());
		if (!entry) return null;
		const genderForms = entry.forms[gk];
		if (!genderForms) return null;
		return { sg: genderForms.sg, pl: genderForms.pl };
	}

	let forms = $derived(lookupForms(lemma, genderKey));
	let expanded = $state(false);

	function computeStem(caseForms: CaseForms): string {
		const all = [...caseForms].filter((f) => f !== '');
		if (all.length === 0) return '';
		let prefix = all[0];
		for (let i = 1; i < all.length; i++) {
			while (!all[i].startsWith(prefix) && prefix.length > 0) {
				prefix = prefix.slice(0, -1);
			}
			if (prefix.length === 0) return '';
		}
		return prefix;
	}

	let sgStem = $derived(forms ? computeStem(forms.sg) : '');
	let plStem = $derived(forms ? computeStem(forms.pl) : '');
</script>

{#if forms}
	<div class="w-full border-t border-darker-subtitle/30 pt-3">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="flex w-full items-center justify-center gap-1.5 text-xs text-darker-subtitle transition-colors hover:text-text-default"
		>
			<Table class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="font-semibold">Adjective chart ({ADJECTIVE_GENDER_LABELS[genderKey]})</span>
			<ChevronDown
				class="h-3.5 w-3.5 transition-transform {expanded ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</button>

		{#if expanded}
			<div class="mt-2.5 overflow-hidden rounded-lg">
				<table class="w-full text-left text-xs">
					<thead>
						<tr>
							<th
								scope="col"
								class="rounded-tl-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Case
							</th>
							<th
								scope="col"
								class="bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Singular
							</th>
							<th
								scope="col"
								class="rounded-tr-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Plural
							</th>
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as c (c)}
							{@const idx = CASE_INDEX[c]}
							{@const sgText = forms.sg[idx]}
							{@const plText = forms.pl[idx]}
							{@const isCurrentSg = c === case_ && number_ === 'sg'}
							{@const isCurrentPl = c === case_ && number_ === 'pl'}
							{@const isCurrentRow = c === case_}
							<tr
								class="border-t border-card-stroke {isCurrentRow ? 'bg-shaded-background/50' : ''}"
							>
								<th
									scope="row"
									class="whitespace-nowrap px-3 py-2 text-left font-medium text-text-subtitle"
								>
									{CASE_NUMBER[c]}. {CASE_LABELS[c]}
								</th>
								<td class="px-3 py-2">
									{#if sgText === ''}
										<span class="text-text-subtitle">—</span>
									{:else if sgStem && sgText.startsWith(sgStem)}
										<span
											class={isCurrentSg
												? `${CASE_COLORS[c].text} opacity-60`
												: 'text-text-subtitle'}>{sgStem}</span
										><span
											class={isCurrentSg
												? `font-bold ${CASE_COLORS[c].text}`
												: 'font-semibold text-emphasis'}>{sgText.slice(sgStem.length)}</span
										>
									{:else}
										<span
											class={isCurrentSg ? `font-bold ${CASE_COLORS[c].text}` : 'text-text-default'}
											>{sgText}</span
										>
									{/if}
								</td>
								<td class="px-3 py-2">
									{#if plText === ''}
										<span class="text-text-subtitle">—</span>
									{:else if plStem && plText.startsWith(plStem)}
										<span
											class={isCurrentPl
												? `${CASE_COLORS[c].text} opacity-60`
												: 'text-text-subtitle'}>{plStem}</span
										><span
											class={isCurrentPl
												? `font-bold ${CASE_COLORS[c].text}`
												: 'font-semibold text-emphasis'}>{plText.slice(plStem.length)}</span
										>
									{:else}
										<span
											class={isCurrentPl ? `font-bold ${CASE_COLORS[c].text}` : 'text-text-default'}
											>{plText}</span
										>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}
