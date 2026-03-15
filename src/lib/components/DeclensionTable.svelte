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
	interface DictEntry {
		lemma: string;
		translation: string;
		sg: CaseForms;
		pl: CaseForms;
		paradigmHint: string;
	}

	function loadDictionary(): DictEntry[] {
		const entries: DictEntry[] = [];
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
	const dictByLemma: Record<string, DictEntry> = {};
	const dictByStripped: Record<string, DictEntry> = {};
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

	const dictStripped: Array<{ key: string; stripped: string; entry: DictEntry }> = dictionary.map(
		(e) => ({
			key: e.lemma.toLowerCase(),
			stripped: stripDiacritics(e.lemma.toLowerCase()),
			entry: e
		})
	);

	function wordBankToEntry(w: WordEntry): DeclensionEntry {
		return {
			lemma: w.lemma,
			translation: w.translation,
			sg: w.forms.sg,
			pl: w.forms.pl,
			paradigmHint: paradigmNames[w.paradigm] ?? ''
		};
	}

	function dictToEntry(d: DictEntry): DeclensionEntry {
		return {
			lemma: d.lemma,
			translation: d.translation,
			sg: d.sg,
			pl: d.pl,
			paradigmHint: d.paradigmHint
		};
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

	let expanded = $state(false);
	let searchQuery = $state('');
	let showSuggestions = $state(false);
	let selectedEntry: DeclensionEntry | null = $state(null);
	let highlightedIndex = $state(-1);

	let trimmedQuery = $derived(searchQuery.trim().toLowerCase());

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
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
			class="space-y-4 {alwaysExpanded
				? ''
				: 'mt-2 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/80'}"
		>
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
						class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-brand-500 dark:focus:ring-brand-900/50"
					/>
					{#if searchQuery !== ''}
						<button
							type="button"
							onclick={clearSearch}
							class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
							aria-label="Clear search"
							tabindex="-1"
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
							class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800"
							role="listbox"
						>
							{#if suggestions.length > 0}
								{#each suggestions as s, idx (s.lemma)}
									<button
										type="button"
										role="option"
										aria-selected={idx === highlightedIndex}
										onmousedown={() => selectWord(s.lemma)}
										onmouseenter={() => (highlightedIndex = idx)}
										class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors
										{idx === highlightedIndex
											? 'bg-brand-50 dark:bg-brand-950/50'
											: 'hover:bg-brand-50 dark:hover:bg-brand-950/50'}"
									>
										<span class="font-medium text-slate-700 dark:text-slate-200">{s.lemma}</span>
										<span class="text-xs text-slate-400 dark:text-slate-500">{s.translation}</span>
									</button>
								{/each}
							{:else}
								<div class="px-3 py-2.5 text-xs text-slate-400 dark:text-slate-500">
									No matching words found
								</div>
							{/if}
						</div>
					{/if}
				</div>
				{#if selectedEntry}
					<div class="mt-1.5 flex flex-wrap items-center gap-2 px-1">
						<span class="text-xs text-slate-500 dark:text-slate-400">
							{selectedEntry.translation}
						</span>
						{#if selectedEntry.paradigmHint}
							<span
								class="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400"
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
					<span class="text-sm font-medium text-slate-700 dark:text-slate-200">
						{displayEntry.lemma}
					</span>
					<span class="text-xs text-slate-500 dark:text-slate-400">
						{displayEntry.translation}
					</span>
					{#if displayEntry.paradigmHint}
						<span
							class="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400"
						>
							{displayEntry.paradigmHint}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Declension table -->
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr
							class="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:text-slate-500"
						>
							<th class="py-2 pr-3">Case</th>
							<th class="py-2 pr-3">Singular</th>
							<th class="py-2">Plural</th>
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as caseKey, i (caseKey)}
							<tr
								class="border-b border-slate-100 dark:border-slate-700/40 {i % 2 === 0
									? 'bg-slate-50/50 dark:bg-slate-800/30'
									: ''}"
							>
								<td class="py-2 pr-3 text-xs font-medium text-slate-500 dark:text-slate-400">
									{CASE_LABELS[caseKey]}
								</td>
								<td class="py-2 pr-3 font-medium">
									{#if displayEntry.sg[CASE_INDEX[caseKey]] === ''}
										<span class="text-slate-300 dark:text-slate-600">&mdash;</span>
									{:else if stem.length > 0}
										<span class="text-slate-400 dark:text-slate-500"
											>{formStem(displayEntry.sg[CASE_INDEX[caseKey]], stem)}</span
										><span class="font-semibold text-slate-800 dark:text-slate-100"
											>{formEnding(displayEntry.sg[CASE_INDEX[caseKey]], stem)}</span
										>
									{:else}
										<span class="text-slate-700 dark:text-slate-200"
											>{displayEntry.sg[CASE_INDEX[caseKey]]}</span
										>
									{/if}
								</td>
								<td class="py-2 font-medium">
									{#if displayEntry.pl[CASE_INDEX[caseKey]] === ''}
										<span class="text-slate-300 dark:text-slate-600">&mdash;</span>
									{:else if stem.length > 0}
										<span class="text-slate-400 dark:text-slate-500"
											>{formStem(displayEntry.pl[CASE_INDEX[caseKey]], stem)}</span
										><span class="font-semibold text-slate-800 dark:text-slate-100"
											>{formEnding(displayEntry.pl[CASE_INDEX[caseKey]], stem)}</span
										>
									{:else}
										<span class="text-slate-700 dark:text-slate-200"
											>{displayEntry.pl[CASE_INDEX[caseKey]]}</span
										>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>
