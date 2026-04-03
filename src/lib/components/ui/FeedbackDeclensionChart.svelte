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
			<div class="mt-2.5 overflow-hidden rounded-lg">
				<table class="w-full text-left text-xs">
					<thead>
						<tr>
							<th
								class="rounded-tl-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Case
							</th>
							<th class="bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle">
								Singular
							</th>
							<th
								class="rounded-tr-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Plural
							</th>
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as c (c)}
							{@const idx = CASE_INDEX[c]}
							{@const isCurrentSg = c === case_ && number_ === 'sg'}
							{@const isCurrentPl = c === case_ && number_ === 'pl'}
							{@const isCurrentRow = c === case_}
							<tr
								class="border-t border-card-stroke {isCurrentRow ? 'bg-shaded-background/50' : ''}"
							>
								<td class="whitespace-nowrap px-3 py-2 font-medium text-text-subtitle">
									{CASE_NUMBER[c]}. {CASE_LABELS[c]}
								</td>
								<td class="px-3 py-2">
									{#if sgStem && forms.sg[idx].startsWith(sgStem)}
										<span
											class={isCurrentSg
												? `font-bold ${CASE_COLORS[c].text}`
												: 'text-text-subtitle'}>{sgStem}</span
										><span
											class={isCurrentSg
												? `font-bold ${CASE_COLORS[c].text}`
												: 'font-semibold text-emphasis'}>{forms.sg[idx].slice(sgStem.length)}</span
										>
									{:else}
										<span
											class={isCurrentSg ? `font-bold ${CASE_COLORS[c].text}` : 'text-text-default'}
											>{forms.sg[idx]}</span
										>
									{/if}
								</td>
								<td class="px-3 py-2">
									{#if plStem && forms.pl[idx].startsWith(plStem)}
										<span
											class={isCurrentPl
												? `font-bold ${CASE_COLORS[c].text}`
												: 'text-text-subtitle'}>{plStem}</span
										><span
											class={isCurrentPl
												? `font-bold ${CASE_COLORS[c].text}`
												: 'font-semibold text-emphasis'}>{forms.pl[idx].slice(plStem.length)}</span
										>
									{:else}
										<span
											class={isCurrentPl ? `font-bold ${CASE_COLORS[c].text}` : 'text-text-default'}
											>{forms.pl[idx]}</span
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
