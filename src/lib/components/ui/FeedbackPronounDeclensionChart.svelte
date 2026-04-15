<script lang="ts">
	import Table from '@lucide/svelte/icons/table';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { loadPronounBank } from '$lib/engine/pronoun-drill';
	import type { Case, Number_, PronounCaseForms } from '$lib/types';
	import { CASE_LABELS, CASE_COLORS, CASE_NUMBER } from '$lib/types';

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

	function lookupForms(
		l: string
	): { sg: PronounCaseForms | null; pl: PronounCaseForms | null } | null {
		const bank = loadPronounBank();
		const entry = bank.find((p) => p.lemma.toLowerCase() === l.toLowerCase());
		if (!entry) return null;
		return { sg: entry.forms.sg, pl: entry.forms.pl };
	}

	let forms = $derived(lookupForms(lemma));
	let expanded = $state(false);

	/** Has at least one number column with data */
	let hasSg = $derived(forms?.sg !== null);
	let hasPl = $derived(forms?.pl !== null);

	/** Get the display string for a pronoun form: combine prep and bare variants */
	function displayForm(caseForms: PronounCaseForms, c: Case): string {
		const form = caseForms[c];
		const parts: string[] = [];
		if (form.prep) parts.push(form.prep);
		if (form.bare && form.bare !== form.prep) parts.push(form.bare);
		if (parts.length === 0) return '\u2014';
		return parts.join(' / ');
	}

	/** Compute a common prefix stem from the displayed pronoun forms */
	function computeStem(caseForms: PronounCaseForms): string {
		const all = CASE_ORDER.map((c) => displayForm(caseForms, c)).filter((f) => f !== '\u2014');
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

	let sgStem = $derived(forms?.sg ? computeStem(forms.sg) : '');
	let plStem = $derived(forms?.pl ? computeStem(forms.pl) : '');
</script>

{#if forms && (hasSg || hasPl)}
	<div class="w-full border-t border-darker-subtitle/30 pt-3">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="flex w-full items-center justify-center gap-1.5 text-xs text-darker-subtitle transition-colors hover:text-text-default"
		>
			<Table class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="font-semibold">Pronoun chart</span>
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
								class="rounded-tl-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Case
							</th>
							{#if hasSg}
								<th
									class="{hasPl
										? ''
										: 'rounded-tr-lg'} bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
								>
									Singular
								</th>
							{/if}
							{#if hasPl}
								<th
									class="rounded-tr-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
								>
									Plural
								</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as c (c)}
							{@const isCurrentSg = c === case_ && number_ === 'sg'}
							{@const isCurrentPl = c === case_ && number_ === 'pl'}
							{@const isCurrentRow = c === case_}
							<tr
								class="border-t border-card-stroke {isCurrentRow ? 'bg-shaded-background/50' : ''}"
							>
								<td class="whitespace-nowrap px-3 py-2 font-medium text-text-subtitle">
									{CASE_NUMBER[c]}. {CASE_LABELS[c]}
								</td>
								{#if hasSg}
									{@const sgText = forms.sg ? displayForm(forms.sg, c) : '\u2014'}
									<td class="px-3 py-2">
										{#if sgStem && sgText !== '\u2014' && sgText.startsWith(sgStem)}
											<span
												class={isCurrentSg
													? `font-bold ${CASE_COLORS[c].text}`
													: 'text-text-subtitle'}>{sgStem}</span
											><span
												class={isCurrentSg
													? `font-bold ${CASE_COLORS[c].text}`
													: 'font-semibold text-emphasis'}>{sgText.slice(sgStem.length)}</span
											>
										{:else}
											<span
												class={isCurrentSg
													? `font-bold ${CASE_COLORS[c].text}`
													: sgText === '\u2014'
														? 'text-text-subtitle'
														: 'text-text-default'}>{sgText}</span
											>
										{/if}
									</td>
								{/if}
								{#if hasPl}
									{@const plText = forms.pl ? displayForm(forms.pl, c) : '\u2014'}
									<td class="px-3 py-2">
										{#if plStem && plText !== '\u2014' && plText.startsWith(plStem)}
											<span
												class={isCurrentPl
													? `font-bold ${CASE_COLORS[c].text}`
													: 'text-text-subtitle'}>{plStem}</span
											><span
												class={isCurrentPl
													? `font-bold ${CASE_COLORS[c].text}`
													: 'font-semibold text-emphasis'}>{plText.slice(plStem.length)}</span
											>
										{:else}
											<span
												class={isCurrentPl
													? `font-bold ${CASE_COLORS[c].text}`
													: plText === '\u2014'
														? 'text-text-subtitle'
														: 'text-text-default'}>{plText}</span
											>
										{/if}
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}
