<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { loadAdjectiveBank } from '$lib/engine/adjective-drill';
	import { CASE_LABELS, CASE_INDEX, CASE_NUMBER, ALL_ADJECTIVE_GENDER_KEYS } from '$lib/types';
	import type { AdjectiveEntry, AdjectiveGenderKey, Case, CaseForms } from '$lib/types';
	import { stripDiacritics } from '$lib/utils/diacritics';

	let {
		selectedLemma = '',
		alwaysExpanded = false
	}: {
		selectedLemma?: string;
		alwaysExpanded?: boolean;
	} = $props();

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	const adjectiveBank: AdjectiveEntry[] = loadAdjectiveBank();

	// Pre-compute stripped lemmas for fast diacritic-insensitive lookup
	const adjectiveStripped: Array<{ stripped: string; entry: AdjectiveEntry }> = adjectiveBank.map(
		(a) => ({
			stripped: stripDiacritics(a.lemma.toLowerCase()),
			entry: a
		})
	);

	const PARADIGM_TYPE_LABELS: Record<string, string> = {
		hard: 'Hard',
		soft: 'Soft'
	};

	const GENDER_GROUPS: Array<{ label: string; key: AdjectiveGenderKey }> = [
		{ label: 'M. anim.', key: 'm_anim' },
		{ label: 'M. inan.', key: 'm_inanim' },
		{ label: 'Feminine', key: 'f' },
		{ label: 'Neuter', key: 'n' }
	];

	function lookupAdjective(query: string): AdjectiveEntry | null {
		const q = query.toLowerCase();
		const qStripped = stripDiacritics(q);

		const exact = adjectiveBank.find((a) => a.lemma.toLowerCase() === q);
		if (exact) return exact;

		const stripped = adjectiveStripped.find((e) => e.stripped === qStripped);
		if (stripped) return stripped.entry;

		return null;
	}

	let expanded = $state(false);

	const fallbackEntry: AdjectiveEntry =
		adjectiveBank.find((a) => a.lemma === 'nový') ?? adjectiveBank[0];

	let displayEntry: AdjectiveEntry = $derived.by(() => {
		const lemma = selectedLemma.trim();
		if (lemma === '') return fallbackEntry;
		return lookupAdjective(lemma) ?? fallbackEntry;
	});

	// Compute longest common prefix across all forms (all 4 genders × sg+pl) so we can dim the stem.
	function computeStemAcrossAll(entry: AdjectiveEntry): string {
		const all: string[] = [];
		for (const gk of ALL_ADJECTIVE_GENDER_KEYS) {
			for (const f of entry.forms[gk].sg) if (f !== '') all.push(f);
			for (const f of entry.forms[gk].pl) if (f !== '') all.push(f);
		}
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

	function formStem(form: string, stemStr: string): string {
		if (stemStr.length > 0 && form.startsWith(stemStr)) return stemStr;
		return form;
	}

	function formEnding(form: string, stemStr: string): string {
		if (stemStr.length > 0 && form.startsWith(stemStr)) return form.slice(stemStr.length);
		return '';
	}

	let stem: string = $derived(computeStemAcrossAll(displayEntry));

	function formAt(
		entry: AdjectiveEntry,
		gk: AdjectiveGenderKey,
		num: 'sg' | 'pl',
		c: Case
	): string {
		const forms: CaseForms = entry.forms[gk][num];
		return forms[CASE_INDEX[c]];
	}
</script>

<div class="w-full">
	{#if !alwaysExpanded}
		<button
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-expanded={expanded}
			aria-controls="adjective-declension-table-panel"
		>
			<span class="font-semibold">Adjective declension table</span>
			<ChevronDown
				class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</button>
	{/if}

	<div
		id="adjective-declension-table-panel"
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
			<!-- Adjective info -->
			<div class="flex flex-wrap items-center gap-2 px-1">
				<span class="text-sm font-semibold text-text-default">
					{displayEntry.lemma}
				</span>
				<span class="text-xs text-text-subtitle">
					{displayEntry.translation}
				</span>
				<span
					class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
				>
					{PARADIGM_TYPE_LABELS[displayEntry.paradigmType] ?? displayEntry.paradigmType}
				</span>
			</div>

			<!-- Declension table: 7 case rows × (4 genders × sg/pl) = 8 form columns -->
			<div class="overflow-x-auto">
				<table class="w-full text-left text-xs">
					<thead>
						<tr>
							<th
								rowspan="2"
								class="rounded-tl-lg bg-shaded-background px-2 py-2 text-xs font-semibold text-text-subtitle align-bottom"
							>
								Case
							</th>
							{#each GENDER_GROUPS as g, idx (g.key)}
								<th
									colspan="2"
									class="bg-shaded-background px-2 py-2 text-center text-xs font-semibold text-text-subtitle {idx ===
									GENDER_GROUPS.length - 1
										? 'rounded-tr-lg'
										: ''}"
								>
									{g.label}
								</th>
							{/each}
						</tr>
						<tr>
							{#each GENDER_GROUPS as g (g.key + '-sub')}
								<th class="bg-shaded-background px-2 pb-2 text-xs font-normal text-text-subtitle">
									Sg
								</th>
								<th class="bg-shaded-background px-2 pb-2 text-xs font-normal text-text-subtitle">
									Pl
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as caseKey, i (caseKey)}
							<tr
								class="border-t border-card-stroke {i % 2 === 0 ? 'bg-shaded-background/50' : ''}"
							>
								<td class="whitespace-nowrap px-2 py-2 font-medium text-text-subtitle">
									{CASE_NUMBER[caseKey]}. {CASE_LABELS[caseKey]}
								</td>
								{#each GENDER_GROUPS as g (g.key + '-' + caseKey)}
									{@const sgForm = formAt(displayEntry, g.key, 'sg', caseKey)}
									{@const plForm = formAt(displayEntry, g.key, 'pl', caseKey)}
									<td class="whitespace-nowrap px-2 py-2">
										{#if sgForm === ''}
											<span class="text-darker-shaded-background">&mdash;</span>
										{:else if stem.length > 0}
											<span class="text-text-subtitle">{formStem(sgForm, stem)}</span><span
												class="text-emphasis">{formEnding(sgForm, stem)}</span
											>
										{:else}
											<span class="text-text-default">{sgForm}</span>
										{/if}
									</td>
									<td class="whitespace-nowrap px-2 py-2">
										{#if plForm === ''}
											<span class="text-darker-shaded-background">&mdash;</span>
										{:else if stem.length > 0}
											<span class="text-text-subtitle">{formStem(plForm, stem)}</span><span
												class="text-emphasis">{formEnding(plForm, stem)}</span
											>
										{:else}
											<span class="text-text-default">{plForm}</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>
