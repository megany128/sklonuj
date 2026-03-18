<script lang="ts">
	import { loadWordBank } from '$lib/engine/drill';
	import paradigmsData from '$lib/data/paradigms.json';
	import dictionaryData from '$lib/data/dictionary.json';
	import { CASE_LABELS, CASE_INDEX } from '$lib/types';
	import type { Case, CaseForms, WordEntry } from '$lib/types';

	// Unified display entry for the table
	interface DeclensionEntry {
		lemma: string;
		translation: string;
		sg: CaseForms;
		pl: CaseForms;
		paradigmHint: string;
	}

	let {
		initialWord = '',
		alwaysExpanded = false
	}: {
		initialWord?: string;
		alwaysExpanded?: boolean;
	} = $props();

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
	const wordBank: WordEntry[] = loadWordBank();

	// Paradigm name lookup
	const paradigmNames: Record<string, string> = {};
	for (const p of paradigmsData) {
		paradigmNames[p.id] = p.name;
	}

	// Process dictionary JSON into typed entries.
	// Each raw entry is [lemma, translation, sg[7], pl[7]].

	let cachedDictionary: DeclensionEntry[] | null = null;

	function loadDictionary(): DeclensionEntry[] {
		if (cachedDictionary) return cachedDictionary;
		const entries: DeclensionEntry[] = [];
		for (const raw of dictionaryData) {
			const lemma = String(raw[0]);
			const translation = String(raw[1]);
			const sgRaw = raw[2];
			const plRaw = raw[3];
			if (!Array.isArray(sgRaw) || !Array.isArray(plRaw)) continue;
			entries.push({
				lemma,
				translation,
				sg: [
					String(sgRaw[0]),
					String(sgRaw[1]),
					String(sgRaw[2]),
					String(sgRaw[3]),
					String(sgRaw[4]),
					String(sgRaw[5]),
					String(sgRaw[6])
				],
				pl: [
					String(plRaw[0]),
					String(plRaw[1]),
					String(plRaw[2]),
					String(plRaw[3]),
					String(plRaw[4]),
					String(plRaw[5]),
					String(plRaw[6])
				],
				paradigmHint: raw[4] != null ? String(raw[4]) : ''
			});
		}
		cachedDictionary = entries;
		return entries;
	}

	const dictionary = loadDictionary();

	// Strip Czech diacritics for fuzzy matching
	const DIACRITICS: Record<string, string> = {
		á: 'a',
		č: 'c',
		ď: 'd',
		é: 'e',
		ě: 'e',
		í: 'i',
		ň: 'n',
		ó: 'o',
		ř: 'r',
		š: 's',
		ť: 't',
		ú: 'u',
		ů: 'u',
		ý: 'y',
		ž: 'z'
	};

	function stripDiacritics(s: string): string {
		let result = '';
		for (const ch of s) {
			result += DIACRITICS[ch] ?? ch;
		}
		return result;
	}

	// Build lookup maps for fast dictionary search by lemma (exact and stripped)
	const dictByLemma: Record<string, DeclensionEntry> = {};
	const dictByStripped: Record<string, DeclensionEntry> = {};
	for (const entry of dictionary) {
		const key = entry.lemma.toLowerCase();
		if (!(key in dictByLemma)) {
			dictByLemma[key] = entry;
		}
		const stripped = stripDiacritics(key);
		if (!(stripped in dictByStripped)) {
			dictByStripped[stripped] = entry;
		}
	}

	// Pre-compute stripped lemmas for fast diacritic-insensitive search
	const wordBankStripped: Array<{ stripped: string; word: WordEntry }> = wordBank.map((w) => ({
		stripped: stripDiacritics(w.lemma.toLowerCase()),
		word: w
	}));

	const dictStripped: Array<{ key: string; stripped: string; entry: DeclensionEntry }> =
		dictionary.map((e) => ({
			key: e.lemma.toLowerCase(),
			stripped: stripDiacritics(e.lemma.toLowerCase()),
			entry: e
		}));

	function wordBankToEntry(w: WordEntry): DeclensionEntry {
		return {
			lemma: w.lemma,
			translation: w.translation,
			sg: w.forms.sg,
			pl: w.forms.pl,
			paradigmHint: paradigmNames[w.paradigm] ?? ''
		};
	}

	function dictToEntry(d: DeclensionEntry): DeclensionEntry {
		return d;
	}

	function lookupWord(query: string): DeclensionEntry | null {
		const q = query.toLowerCase();
		const qStripped = stripDiacritics(q);

		// Exact match in word bank
		const wbExact = wordBank.find((w) => w.lemma.toLowerCase() === q);
		if (wbExact) return wordBankToEntry(wbExact);

		// Exact match in dictionary
		if (dictByLemma[q]) return dictToEntry(dictByLemma[q]);

		// Stripped (diacritic-insensitive) match in word bank
		const wbStripped = wordBankStripped.find((e) => e.stripped === qStripped);
		if (wbStripped) return wordBankToEntry(wbStripped.word);

		// Stripped match in dictionary
		if (dictByStripped[qStripped]) return dictToEntry(dictByStripped[qStripped]);

		return null;
	}

	// Autocomplete: search both word bank and dictionary by prefix
	interface Suggestion {
		lemma: string;
		translation: string;
	}

	function getSuggestions(query: string): Suggestion[] {
		const q = query.toLowerCase();
		const qStripped = stripDiacritics(q);
		const results: Suggestion[] = [];
		const seen: Record<string, boolean> = {};

		// Word bank first (higher quality)
		for (const w of wordBankStripped) {
			const key = w.word.lemma.toLowerCase();
			if ((key.startsWith(q) || w.stripped.startsWith(qStripped)) && !seen[key]) {
				results.push({ lemma: w.word.lemma, translation: w.word.translation });
				seen[key] = true;
				if (results.length >= MAX_SUGGESTIONS) return results;
			}
		}

		// Then dictionary (using pre-computed stripped lemmas)
		for (const d of dictStripped) {
			if ((d.key.startsWith(q) || d.stripped.startsWith(qStripped)) && !seen[d.key]) {
				results.push({ lemma: d.entry.lemma, translation: d.entry.translation });
				seen[d.key] = true;
				if (results.length >= MAX_SUGGESTIONS) return results;
			}
		}

		return results;
	}

	const MIN_AUTOCOMPLETE_LENGTH = 3;
	const MAX_SUGGESTIONS = 8;

	// Paradigm browser data
	interface ParadigmInfo {
		id: string;
		name: string;
		exampleLemma: string;
		label: string;
	}

	const PARADIGM_LABELS: Record<string, string> = {
		hrad: 'hrad',
		stroj: 'stroj',
		pán: 'pán',
		muž: 'muž',
		předseda: 'předseda',
		žena: 'žena',
		růže: 'růže',
		píseň: 'píseň',
		kost: 'kost',
		město: 'město',
		moře: 'moře',
		kuře: 'kuře',
		stavení: 'stavení'
	};

	const paradigmList: ParadigmInfo[] = paradigmsData
		.filter((p) => p.id in PARADIGM_LABELS)
		.map((p) => ({
			id: p.id,
			name: p.name,
			exampleLemma: p.exampleLemma,
			label: PARADIGM_LABELS[p.id] ?? p.id
		}));

	interface GenderGroup {
		label: string;
		paradigms: ParadigmInfo[];
	}

	const GENDER_GROUP_ORDER = ['Masculine', 'Feminine', 'Neuter'] as const;
	const GENDER_GROUP_IDS: Record<string, string[]> = {
		Masculine: ['hrad', 'stroj', 'pán', 'muž', 'předseda'],
		Feminine: ['žena', 'růže', 'píseň', 'kost'],
		Neuter: ['město', 'moře', 'kuře', 'stavení']
	};

	const genderGroups: GenderGroup[] = GENDER_GROUP_ORDER.map((label) => ({
		label,
		paradigms: (GENDER_GROUP_IDS[label] ?? [])
			.map((id) => paradigmList.find((p) => p.id === id))
			.filter((p): p is ParadigmInfo => p !== undefined)
	}));

	let expanded = $state(false);
	let searchQuery = $state('');
	let showSuggestions = $state(false);
	let selectedEntry: DeclensionEntry | null = $state(null);
	let highlightedIndex = $state(-1);
	let selectedParadigm: string | null = $state(null);
	let paradigmsExpanded = $state(false);

	let trimmedQuery = $derived(searchQuery.trim().toLowerCase());
	let isPivo = $derived(trimmedQuery === 'pivo');

	const defaultEntry = wordBankToEntry(wordBank.find((w) => w.lemma === 'žena') ?? wordBank[0]);

	let suggestions: Suggestion[] = $derived.by(() => {
		if (trimmedQuery.length < MIN_AUTOCOMPLETE_LENGTH) return [];
		return getSuggestions(trimmedQuery);
	});

	let displayEntry: DeclensionEntry = $derived(selectedEntry ?? defaultEntry);

	function computeStem(sg: CaseForms, pl: CaseForms): string {
		const forms = [...sg, ...pl].filter((f) => f !== '');
		if (forms.length === 0) return '';

		let prefix = forms[0];
		for (let i = 1; i < forms.length; i++) {
			while (!forms[i].startsWith(prefix) && prefix.length > 0) {
				prefix = prefix.slice(0, -1);
			}
			if (prefix.length === 0) return '';
		}
		return prefix;
	}

	function splitForm(form: string, stemStr: string): { stem: string; ending: string } {
		if (stemStr.length > 0 && form.startsWith(stemStr)) {
			return { stem: stemStr, ending: form.slice(stemStr.length) };
		}
		return { stem: form, ending: '' };
	}

	function formStem(form: string, stemStr: string): string {
		return splitForm(form, stemStr).stem;
	}

	function formEnding(form: string, stemStr: string): string {
		return splitForm(form, stemStr).ending;
	}

	let stem: string = $derived(computeStem(displayEntry.sg, displayEntry.pl));

	let dropdownOpen = $derived(
		showSuggestions && trimmedQuery.length >= MIN_AUTOCOMPLETE_LENGTH && !selectedEntry
	);

	function selectWord(lemma: string): void {
		const entry = lookupWord(lemma);
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
					selectWord(suggestions[highlightedIndex].lemma);
				} else {
					selectWord(searchQuery.trim());
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
			selectWord(searchQuery.trim());
		}
	}

	function handleInput(): void {
		showSuggestions = true;
		highlightedIndex = -1;
		selectedParadigm = null;
		if (
			selectedEntry !== null &&
			searchQuery.trim().toLowerCase() !== selectedEntry.lemma.toLowerCase()
		) {
			selectedEntry = null;
		}
	}

	function toggleParadigm(id: string): void {
		if (selectedParadigm === id) {
			selectedParadigm = null;
			searchQuery = '';
			selectedEntry = null;
			showSuggestions = false;
			highlightedIndex = -1;
		} else {
			selectedParadigm = id;
			const info = paradigmList.find((p) => p.id === id);
			if (info) {
				selectWord(info.exampleLemma);
			}
		}
	}

	function clearSearch(): void {
		searchQuery = '';
		selectedEntry = null;
		showSuggestions = false;
		highlightedIndex = -1;
	}

	// When initialWord changes, auto-select that word
	$effect(() => {
		if (initialWord && initialWord.trim() !== '') {
			selectWord(initialWord.trim());
		}
	});
</script>

<div class="w-full">
	{#if !alwaysExpanded}
		<button
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-expanded={expanded}
			aria-controls="declension-table-panel"
		>
			<span class="font-semibold">Declension table</span>
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
	{/if}

	<div
		id="declension-table-panel"
		class={alwaysExpanded ? '' : 'overflow-hidden transition-all duration-300 ease-in-out'}
		style={alwaysExpanded
			? undefined
			: `max-height: ${expanded ? '2000px' : '0px'}; opacity: ${expanded ? '1' : '0'}`}
	>
		<div
			class="relative overflow-hidden space-y-4 {alwaysExpanded
				? isPivo
					? 'rounded-2xl border-2 border-easter-egg-border bg-card-bg p-4'
					: 'rounded-2xl border border-card-stroke bg-card-bg p-4'
				: isPivo
					? 'mt-2 rounded-2xl border-2 border-easter-egg-border bg-card-bg p-4'
					: 'mt-2 rounded-2xl border border-card-stroke bg-card-bg p-4'} {isPivo
				? 'pivo-cursor'
				: ''}"
		>
			<!-- Paradigm browser toggle -->
			<div>
				<button
					type="button"
					onclick={() => (paradigmsExpanded = !paradigmsExpanded)}
					class="flex items-center gap-1 text-xs font-medium text-text-subtitle transition-colors hover:text-text-default"
				>
					Browse paradigms
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="h-3 w-3 transition-transform duration-200 {paradigmsExpanded
							? 'rotate-180'
							: ''}"
					>
						<path
							fill-rule="evenodd"
							d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
				{#if paradigmsExpanded}
					<div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
						{#each genderGroups as group (group.label)}
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">
									{group.label}
								</span>
								{#each group.paradigms as paradigm (paradigm.id)}
									<button
										type="button"
										onclick={() => toggleParadigm(paradigm.id)}
										class="rounded-full border px-2.5 py-1 text-xs transition-colors {selectedParadigm ===
										paradigm.id
											? 'border-emphasis bg-shaded-background font-semibold text-text-default'
											: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
									>
										{paradigm.label}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Search input -->
			<div>
				<div class="relative">
					<input
						type="text"
						placeholder="Search for a word..."
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
						aria-label="Search for a Czech word"
						role="combobox"
						aria-expanded={dropdownOpen}
						aria-controls="declension-suggestions"
						aria-autocomplete="list"
						aria-activedescendant={highlightedIndex >= 0
							? 'suggestion-' + highlightedIndex
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
								/>
							</svg>
						</button>
					{/if}
					{#if dropdownOpen}
						<div
							id="declension-suggestions"
							class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-card-stroke bg-card-bg shadow-lg"
							role="listbox"
						>
							{#if suggestions.length > 0}
								{#each suggestions as s, idx (s.lemma)}
									<button
										type="button"
										role="option"
										id="suggestion-{idx}"
										aria-selected={idx === highlightedIndex}
										onmousedown={() => selectWord(s.lemma)}
										onmouseenter={() => (highlightedIndex = idx)}
										class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors
										{idx === highlightedIndex ? 'bg-shaded-background' : 'hover:bg-shaded-background'}"
									>
										<span class="font-semibold text-text-default">{s.lemma}</span>
										<span class="text-xs text-text-subtitle">{s.translation}</span>
									</button>
								{/each}
							{:else}
								<div class="px-3 py-2.5 text-xs text-text-subtitle">No matching words found</div>
							{/if}
						</div>
					{/if}
				</div>
				{#if selectedEntry}
					<div class="mt-1.5 flex flex-wrap items-center gap-2 px-1">
						<span class="text-xs text-text-subtitle">
							{selectedEntry.translation}
						</span>
						{#if selectedEntry.paradigmHint}
							<span
								class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
							>
								{selectedEntry.paradigmHint}
							</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Word info (default, when no search) -->
			{#if !selectedEntry}
				<div class="flex flex-wrap items-center gap-2 px-1">
					<span class="text-sm font-semibold text-text-default">
						{displayEntry.lemma}
					</span>
					<span class="text-xs text-text-subtitle">
						{displayEntry.translation}
					</span>
					{#if displayEntry.paradigmHint}
						<span
							class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
						>
							{displayEntry.paradigmHint}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Declension table -->
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
							<th class="py-2 pr-3">Singular</th>
							<th class="py-2">Plural</th>
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as caseKey, i (caseKey)}
							<tr
								class="border-b border-card-stroke {i % 2 === 0 ? 'bg-shaded-background/50' : ''}"
							>
								<td class="py-2 pr-3 text-xs font-normal text-text-subtitle">
									{CASE_LABELS[caseKey]}
								</td>
								<td class="py-2 pr-3">
									{#if displayEntry.sg[CASE_INDEX[caseKey]] === ''}
										<span class="text-darker-shaded-background">&mdash;</span>
									{:else if stem.length > 0}
										<span class="text-text-subtitle"
											>{formStem(displayEntry.sg[CASE_INDEX[caseKey]], stem)}</span
										><span class="text-emphasis"
											>{formEnding(displayEntry.sg[CASE_INDEX[caseKey]], stem)}</span
										>
									{:else}
										<span class="text-text-default">{displayEntry.sg[CASE_INDEX[caseKey]]}</span>
									{/if}
								</td>
								<td class="py-2">
									{#if displayEntry.pl[CASE_INDEX[caseKey]] === ''}
										<span class="text-darker-shaded-background">&mdash;</span>
									{:else if stem.length > 0}
										<span class="text-text-subtitle"
											>{formStem(displayEntry.pl[CASE_INDEX[caseKey]], stem)}</span
										><span class="text-emphasis"
											>{formEnding(displayEntry.pl[CASE_INDEX[caseKey]], stem)}</span
										>
									{:else}
										<span class="text-text-default">{displayEntry.pl[CASE_INDEX[caseKey]]}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if isPivo}
				{#key searchQuery}
					<div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[40px]">
						{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
							<span
								class="beer-float absolute bottom-0 text-2xl"
								style="left: {8 + i * 11}%; animation-delay: {i * 0.2}s">🍺</span
							>
						{/each}
					</div>
				{/key}
			{/if}
		</div>
	</div>
</div>
