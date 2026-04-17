<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import { loadAdjectiveBank } from '$lib/engine/adjective-drill';
	import { CASE_LABELS, CASE_INDEX, CASE_NUMBER, ALL_ADJECTIVE_GENDER_KEYS } from '$lib/types';
	import type { AdjectiveEntry, AdjectiveGenderKey, Case, CaseForms } from '$lib/types';
	import { stripDiacritics } from '$lib/utils/diacritics';

	let {
		initialWord = '',
		alwaysExpanded = false
	}: {
		initialWord?: string;
		alwaysExpanded?: boolean;
	} = $props();

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	const adjectiveBank: AdjectiveEntry[] = loadAdjectiveBank();

	// Pre-compute stripped lemmas for fast diacritic-insensitive search
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

	interface Suggestion {
		lemma: string;
		translation: string;
	}

	const MIN_AUTOCOMPLETE_LENGTH = 3;
	const MAX_SUGGESTIONS = 8;

	function getSuggestions(query: string): Suggestion[] {
		const q = query.toLowerCase();
		const qStripped = stripDiacritics(q);
		const results: Suggestion[] = [];
		const seen: Record<string, boolean> = {};

		for (const a of adjectiveStripped) {
			const key = a.entry.lemma.toLowerCase();
			if ((key.startsWith(q) || a.stripped.startsWith(qStripped)) && !seen[key]) {
				results.push({ lemma: a.entry.lemma, translation: a.entry.translation });
				seen[key] = true;
				if (results.length >= MAX_SUGGESTIONS) return results;
			}
		}

		return results;
	}

	let expanded = $state(false);
	let searchQuery = $state('');
	let showSuggestions = $state(false);
	let selectedEntry: AdjectiveEntry | null = $state(null);
	let highlightedIndex = $state(-1);

	let trimmedQuery = $derived(searchQuery.trim().toLowerCase());

	const fallbackEntry: AdjectiveEntry =
		adjectiveBank.find((a) => a.lemma === 'nový') ?? adjectiveBank[0];

	const defaultEntry: AdjectiveEntry = $derived.by(() => {
		if (initialWord && initialWord.trim() !== '') {
			const entry = lookupAdjective(initialWord.trim());
			if (entry) return entry;
		}
		return fallbackEntry;
	});

	let suggestions: Suggestion[] = $derived.by(() => {
		if (trimmedQuery.length < MIN_AUTOCOMPLETE_LENGTH) return [];
		return getSuggestions(trimmedQuery);
	});

	let displayEntry: AdjectiveEntry = $derived(selectedEntry ?? defaultEntry);

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

	let dropdownOpen = $derived(
		showSuggestions && trimmedQuery.length >= MIN_AUTOCOMPLETE_LENGTH && !selectedEntry
	);

	function selectAdjective(lemma: string): void {
		const entry = lookupAdjective(lemma);
		if (entry) {
			searchQuery = entry.lemma;
			selectedEntry = entry;
			showSuggestions = false;
			highlightedIndex = -1;
		}
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (dropdownOpen && suggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				highlightedIndex = highlightedIndex < suggestions.length - 1 ? highlightedIndex + 1 : 0;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				highlightedIndex = highlightedIndex > 0 ? highlightedIndex - 1 : suggestions.length - 1;
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
					selectAdjective(suggestions[highlightedIndex].lemma);
				} else {
					selectAdjective(searchQuery.trim());
				}
				return;
			}
			if (e.key === 'Escape') {
				showSuggestions = false;
				highlightedIndex = -1;
				return;
			}
		}

		if (e.key === 'Enter') {
			selectAdjective(searchQuery.trim());
		}
	}

	function handleInput(): void {
		showSuggestions = true;
		highlightedIndex = -1;
		if (
			selectedEntry !== null &&
			searchQuery.trim().toLowerCase() !== selectedEntry.lemma.toLowerCase()
		) {
			selectedEntry = null;
		}
	}

	function clearSearch(): void {
		searchQuery = '';
		selectedEntry = null;
		showSuggestions = false;
		highlightedIndex = -1;
	}

	// When initialWord changes, auto-select that adjective (mirrors DeclensionTable behaviour).
	$effect(() => {
		if (initialWord && initialWord.trim() !== '') {
			selectAdjective(initialWord.trim());
		}
	});

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
			<!-- Search input -->
			<div>
				<div class="relative">
					<input
						type="text"
						placeholder="Search for an adjective..."
						bind:value={searchQuery}
						oninput={handleInput}
						onkeydown={handleKeydown}
						onfocus={() => {
							if (trimmedQuery.length >= MIN_AUTOCOMPLETE_LENGTH) showSuggestions = true;
						}}
						onblur={() => setTimeout(() => (showSuggestions = false), 150)}
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						spellcheck="false"
						aria-label="Search for a Czech adjective"
						role="combobox"
						aria-expanded={dropdownOpen}
						aria-controls="adjective-declension-suggestions"
						aria-autocomplete="list"
						aria-activedescendant={highlightedIndex >= 0
							? 'adj-suggestion-' + highlightedIndex
							: undefined}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 pr-8 text-base text-text-default placeholder:text-text-subtitle outline-none transition-colors focus:border-emphasis"
					/>
					{#if searchQuery !== ''}
						<button
							type="button"
							onclick={clearSearch}
							class="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtitle hover:text-text-default"
							aria-label="Clear search"
							tabindex="0"
						>
							<X class="h-4 w-4" aria-hidden="true" />
						</button>
					{/if}
					{#if dropdownOpen}
						<div
							id="adjective-declension-suggestions"
							class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-card-stroke bg-card-bg shadow-lg"
							role="listbox"
						>
							{#if suggestions.length > 0}
								{#each suggestions as s, idx (s.lemma)}
									<button
										type="button"
										role="option"
										id="adj-suggestion-{idx}"
										aria-selected={idx === highlightedIndex}
										onmousedown={() => selectAdjective(s.lemma)}
										onmouseenter={() => (highlightedIndex = idx)}
										class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors
										{idx === highlightedIndex ? 'bg-shaded-background' : 'hover:bg-shaded-background'}"
									>
										<span class="font-semibold text-text-default">{s.lemma}</span>
										<span class="text-xs text-text-subtitle">{s.translation}</span>
									</button>
								{/each}
							{:else}
								<div class="px-3 py-2.5 text-xs text-text-subtitle">
									No matching adjectives found
								</div>
							{/if}
						</div>
					{/if}
				</div>
				{#if selectedEntry}
					<div class="mt-1.5 flex flex-wrap items-center gap-2 px-1">
						<span class="text-xs text-text-subtitle">
							{selectedEntry.translation}
						</span>
						<span
							class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
						>
							{PARADIGM_TYPE_LABELS[selectedEntry.paradigmType] ?? selectedEntry.paradigmType}
						</span>
					</div>
				{/if}
			</div>

			<!-- Adjective info (default, when no search) -->
			{#if !selectedEntry}
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
			{/if}

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
