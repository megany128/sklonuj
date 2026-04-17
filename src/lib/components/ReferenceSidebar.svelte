<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import DeclensionTable from './DeclensionTable.svelte';
	import AdjectiveDeclensionTable from './AdjectiveDeclensionTable.svelte';
	import PronounTable from './PronounTable.svelte';
	import CaseGuide from './CaseGuide.svelte';
	import LookupSearch, { type LookupKind } from './LookupSearch.svelte';
	import { loadAdjectiveBank } from '$lib/engine/adjective-drill';
	import { stripDiacritics } from '$lib/utils/diacritics';

	type TabId = 'declension' | 'pronouns' | 'cases';

	let {
		initialWord = '',
		initialPronoun = '',
		initialTab = 'declension',
		onClose
	}: {
		initialWord?: string;
		initialPronoun?: string;
		initialTab?: TabId;
		onClose: () => void;
	} = $props();

	// eslint-disable-next-line svelte/prefer-writable-derived -- $derived.writable not available in this Svelte version
	let activeTab: TabId = $state('declension');

	// Sync when parent changes the initial tab (e.g. clicking a pronoun lemma)
	$effect(() => {
		activeTab = initialTab;
	});

	// Build an adjective-lemma lookup (exact + diacritic-stripped) once so we can classify a
	// given lemma as noun-or-adjective without running a full bank search.
	const adjectiveLemmaLookup: Record<string, true> = {};
	for (const a of loadAdjectiveBank()) {
		const lower = a.lemma.toLowerCase();
		adjectiveLemmaLookup[lower] = true;
		adjectiveLemmaLookup[stripDiacritics(lower)] = true;
	}

	function classifyLemma(lemma: string): LookupKind {
		const w = lemma.trim().toLowerCase();
		if (w === '') return 'noun';
		if (adjectiveLemmaLookup[w] === true) return 'adjective';
		if (adjectiveLemmaLookup[stripDiacritics(w)] === true) return 'adjective';
		return 'noun';
	}

	// Unified Lookup tab state — single source of truth for which lemma + kind is shown.
	let selectedLemma = $state('');
	let selectedKind: LookupKind = $state('noun');
	let searchQuery = $state('');

	// Mirror initialWord from the parent (drill lemma clicks). Re-runs on every initialWord change.
	$effect(() => {
		const w = initialWord.trim();
		if (w === '') {
			selectedLemma = '';
			selectedKind = 'noun';
			searchQuery = '';
			return;
		}
		selectedLemma = w;
		selectedKind = classifyLemma(w);
		searchQuery = w;
	});

	function handleSelect(lemma: string, kind: LookupKind): void {
		selectedLemma = lemma;
		selectedKind = kind;
		searchQuery = lemma;
	}

	function handleClear(): void {
		selectedLemma = '';
		selectedKind = 'noun';
		searchQuery = '';
	}

	// Paradigm browser in the noun table uses this to update the lemma.
	function handleParadigmSelect(lemma: string): void {
		if (lemma === '') {
			handleClear();
			return;
		}
		handleSelect(lemma, 'noun');
	}

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'declension', label: 'Lookup' },
		{ id: 'pronouns', label: 'Pronouns' },
		{ id: 'cases', label: 'Cases' }
	];
</script>

<div class="flex h-full flex-col bg-page-background">
	<!-- Header -->
	<div class="flex shrink-0 items-center justify-between px-6 pb-3 pt-6">
		<h2 class="text-base font-semibold uppercase tracking-wider text-text-default">Reference</h2>
		<button
			type="button"
			onclick={onClose}
			class="flex items-center justify-center text-text-subtitle transition-colors hover:text-text-default"
			aria-label="Close"
		>
			<X class="h-5 w-5" aria-hidden="true" />
		</button>
	</div>

	<!-- Tab bar - segmented control style -->
	<div class="shrink-0 px-6 py-2">
		<div
			role="tablist"
			aria-label="Reference tabs"
			class="flex rounded-[16px] border border-card-stroke bg-card-bg p-1"
		>
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === tab.id}
					onclick={() => (activeTab = tab.id)}
					class="flex-1 rounded-[12px] px-3 py-2 text-sm font-normal transition-all
						{activeTab === tab.id
						? 'bg-shaded-background text-text-default'
						: 'text-text-subtitle hover:text-text-default'}"
				>
					{tab.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto px-6 pb-8 pt-3">
		{#if activeTab === 'declension'}
			<div class="space-y-3">
				<LookupSearch
					bind:query={searchQuery}
					placeholder="Search for a word..."
					onSelect={handleSelect}
					onClear={handleClear}
				/>
				{#if selectedKind === 'adjective'}
					<AdjectiveDeclensionTable {selectedLemma} alwaysExpanded={true} />
				{:else}
					<DeclensionTable
						{selectedLemma}
						alwaysExpanded={true}
						onSelectLemma={handleParadigmSelect}
					/>
				{/if}
			</div>
		{:else if activeTab === 'pronouns'}
			<PronounTable {initialPronoun} alwaysExpanded={true} />
		{:else if activeTab === 'cases'}
			<CaseGuide alwaysExpanded={true} />
		{/if}
	</div>
</div>
