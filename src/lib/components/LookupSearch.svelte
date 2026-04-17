<script module lang="ts">
	export type LookupKind = 'noun' | 'adjective';
</script>

<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { loadWordBank } from '$lib/engine/drill';
	import { loadAdjectiveBank } from '$lib/engine/adjective-drill';
	import dictionaryData from '$lib/data/dictionary.json';
	import { stripDiacritics } from '$lib/utils/diacritics';
	import type { AdjectiveEntry, WordEntry } from '$lib/types';

	interface Suggestion {
		lemma: string;
		translation: string;
		kind: LookupKind;
	}

	let {
		query = $bindable(''),
		placeholder = 'Search for a word...',
		onSelect,
		onClear
	}: {
		query?: string;
		placeholder?: string;
		onSelect: (lemma: string, kind: LookupKind) => void;
		onClear?: () => void;
	} = $props();

	const MIN_AUTOCOMPLETE_LENGTH = 3;
	const MAX_SUGGESTIONS = 10;

	const wordBank: WordEntry[] = loadWordBank();
	const adjectiveBank: AdjectiveEntry[] = loadAdjectiveBank();

	// Pre-computed lowercase + stripped keys for fast diacritic-insensitive prefix search
	const wordBankStripped: Array<{ key: string; stripped: string; entry: WordEntry }> = wordBank.map(
		(w) => ({
			key: w.lemma.toLowerCase(),
			stripped: stripDiacritics(w.lemma.toLowerCase()),
			entry: w
		})
	);

	const adjectiveStripped: Array<{ key: string; stripped: string; entry: AdjectiveEntry }> =
		adjectiveBank.map((a) => ({
			key: a.lemma.toLowerCase(),
			stripped: stripDiacritics(a.lemma.toLowerCase()),
			entry: a
		}));

	// Dictionary entries: raw is [lemma, translation, sg[7], pl[7], paradigmHint?]
	interface DictRow {
		key: string;
		stripped: string;
		lemma: string;
		translation: string;
	}

	const dictStripped: DictRow[] = [];
	for (const raw of dictionaryData) {
		const lemma = String(raw[0]);
		const translation = String(raw[1]);
		const key = lemma.toLowerCase();
		dictStripped.push({
			key,
			stripped: stripDiacritics(key),
			lemma,
			translation
		});
	}

	function getSuggestions(q: string): Suggestion[] {
		const qLower = q.toLowerCase();
		const qStripped = stripDiacritics(qLower);
		const results: Suggestion[] = [];
		const seen: Record<string, boolean> = {};

		// Adjective bank (small, curated) — prioritised to make "sil" → silný show up front.
		for (const a of adjectiveStripped) {
			if ((a.key.startsWith(qLower) || a.stripped.startsWith(qStripped)) && !seen['adj:' + a.key]) {
				results.push({ lemma: a.entry.lemma, translation: a.entry.translation, kind: 'adjective' });
				seen['adj:' + a.key] = true;
				if (results.length >= MAX_SUGGESTIONS) return results;
			}
		}

		// Noun word bank (curated drill set)
		for (const w of wordBankStripped) {
			if (
				(w.key.startsWith(qLower) || w.stripped.startsWith(qStripped)) &&
				!seen['noun:' + w.key]
			) {
				results.push({ lemma: w.entry.lemma, translation: w.entry.translation, kind: 'noun' });
				seen['noun:' + w.key] = true;
				if (results.length >= MAX_SUGGESTIONS) return results;
			}
		}

		// Dictionary fallback (18k, lower-quality)
		for (const d of dictStripped) {
			if (
				(d.key.startsWith(qLower) || d.stripped.startsWith(qStripped)) &&
				!seen['noun:' + d.key]
			) {
				results.push({ lemma: d.lemma, translation: d.translation, kind: 'noun' });
				seen['noun:' + d.key] = true;
				if (results.length >= MAX_SUGGESTIONS) return results;
			}
		}

		return results;
	}

	let showSuggestions = $state(false);
	let highlightedIndex = $state(-1);

	let trimmedQuery = $derived(query.trim().toLowerCase());

	let suggestions: Suggestion[] = $derived.by(() => {
		if (trimmedQuery.length < MIN_AUTOCOMPLETE_LENGTH) return [];
		return getSuggestions(trimmedQuery);
	});

	let dropdownOpen = $derived(showSuggestions && trimmedQuery.length >= MIN_AUTOCOMPLETE_LENGTH);

	function commit(s: Suggestion): void {
		query = s.lemma;
		showSuggestions = false;
		highlightedIndex = -1;
		onSelect(s.lemma, s.kind);
	}

	function commitFreeform(): void {
		// Enter without a highlighted suggestion — try to resolve the typed lemma directly.
		// Prefer the first suggestion if one exists; otherwise let the parent try (kind defaults to noun).
		if (suggestions.length > 0) {
			commit(suggestions[0]);
			return;
		}
		const raw = query.trim();
		if (raw === '') return;
		onSelect(raw, 'noun');
		showSuggestions = false;
		highlightedIndex = -1;
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
					commit(suggestions[highlightedIndex]);
				} else {
					commitFreeform();
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
			e.preventDefault();
			commitFreeform();
		}
	}

	function handleInput(): void {
		showSuggestions = true;
		highlightedIndex = -1;
	}

	function clearSearch(): void {
		query = '';
		showSuggestions = false;
		highlightedIndex = -1;
		onClear?.();
	}
</script>

<div class="relative">
	<input
		type="text"
		{placeholder}
		bind:value={query}
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
		aria-controls="lookup-suggestions"
		aria-autocomplete="list"
		aria-activedescendant={highlightedIndex >= 0
			? 'lookup-suggestion-' + highlightedIndex
			: undefined}
		class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 pr-8 text-base text-text-default placeholder:text-text-subtitle outline-none transition-colors focus:border-emphasis"
	/>
	{#if query !== ''}
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
			id="lookup-suggestions"
			class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-card-stroke bg-card-bg shadow-lg"
			role="listbox"
		>
			{#if suggestions.length > 0}
				{#each suggestions as s, idx (s.kind + ':' + s.lemma)}
					<button
						type="button"
						role="option"
						id="lookup-suggestion-{idx}"
						aria-selected={idx === highlightedIndex}
						onmousedown={() => commit(s)}
						onmouseenter={() => (highlightedIndex = idx)}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors
							{idx === highlightedIndex ? 'bg-shaded-background' : 'hover:bg-shaded-background'}"
					>
						<span class="font-semibold text-text-default">{s.lemma}</span>
						{#if s.kind === 'adjective'}
							<span
								class="rounded-full bg-shaded-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-subtitle"
							>
								adj
							</span>
						{/if}
						<span class="text-xs text-text-subtitle">{s.translation}</span>
					</button>
				{/each}
			{:else}
				<div class="px-3 py-2.5 text-xs text-text-subtitle">No matching words found</div>
			{/if}
		</div>
	{/if}
</div>
