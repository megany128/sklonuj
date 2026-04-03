<script lang="ts">
	import { loadWordBank } from '$lib/engine/drill';
	import dictionaryData from '$lib/data/dictionary.json';
	import type { Case, Number_, CaseForms } from '$lib/types';
	import { CASE_LABELS, CASE_INDEX, CASE_COLORS, CASE_NUMBER } from '$lib/types';

	let {
		lemma,
		case_,
		number_
	}: {
		lemma: string;
		case_: Case;
		number_: Number_;
	} = $props();

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	function lookupForms(l: string): { sg: CaseForms; pl: CaseForms } | null {
		const wordBank = loadWordBank();
		const wb = wordBank.find((w) => w.lemma.toLowerCase() === l.toLowerCase());
		if (wb) return { sg: wb.forms.sg, pl: wb.forms.pl };

		for (const raw of dictionaryData) {
			if (String(raw[0]).toLowerCase() === l.toLowerCase()) {
				const sgRaw = raw[2];
				const plRaw = raw[3];
				if (!Array.isArray(sgRaw) || !Array.isArray(plRaw)) continue;
				return {
					sg: [
						String(sgRaw[0]),
						String(sgRaw[1]),
						String(sgRaw[2]),
						String(sgRaw[3]),
						String(sgRaw[4]),
						String(sgRaw[5]),
						String(sgRaw[6])
					] as CaseForms,
					pl: [
						String(plRaw[0]),
						String(plRaw[1]),
						String(plRaw[2]),
						String(plRaw[3]),
						String(plRaw[4]),
						String(plRaw[5]),
						String(plRaw[6])
					] as CaseForms
				};
			}
		}
		return null;
	}

	let forms = $derived(lookupForms(lemma));
	let expanded = $state(false);
</script>

{#if forms}
	<div class="w-full border-t border-darker-subtitle/30 pt-3">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="flex w-full items-center justify-center gap-1.5 text-xs text-darker-subtitle transition-colors hover:text-text-default"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-3.5 w-3.5"
			>
				<path d="M3 3h18v18H3z" />
				<path d="M3 9h18" />
				<path d="M3 15h18" />
				<path d="M9 3v18" />
			</svg>
			<span class="font-semibold">Declension chart</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-3.5 w-3.5 transition-transform {expanded ? 'rotate-180' : ''}"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		{#if expanded}
			<div class="mt-2.5 overflow-hidden rounded-lg border border-card-stroke">
				<table class="w-full table-fixed text-xs">
					<colgroup>
						<col class="w-[38%]" />
						<col class="w-[31%]" />
						<col class="w-[31%]" />
					</colgroup>
					<thead>
						<tr class="bg-darker-shaded-background text-text-subtitle">
							<th class="px-2 py-1.5 text-left font-semibold">Case</th>
							<th class="px-2 py-1.5 text-left font-semibold">Singular</th>
							<th class="px-2 py-1.5 text-left font-semibold">Plural</th>
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as c (c)}
							{@const idx = CASE_INDEX[c]}
							{@const isCurrentSg = c === case_ && number_ === 'sg'}
							{@const isCurrentPl = c === case_ && number_ === 'pl'}
							{@const isCurrentRow = c === case_}
							<tr class="{isCurrentRow ? 'bg-shaded-background' : ''} border-t border-card-stroke">
								<td class="px-2 py-1 text-left font-semibold text-text-subtitle">
									{CASE_NUMBER[c]}. {CASE_LABELS[c]}
								</td>
								<td
									class="px-2 py-1 text-left {isCurrentSg
										? `font-bold ${CASE_COLORS[c].text}`
										: 'text-text-default'}"
								>
									{forms.sg[idx]}
								</td>
								<td
									class="px-2 py-1 text-left {isCurrentPl
										? `font-bold ${CASE_COLORS[c].text}`
										: 'text-text-default'}"
								>
									{forms.pl[idx]}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}
