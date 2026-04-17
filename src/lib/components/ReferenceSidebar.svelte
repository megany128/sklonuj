<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import DeclensionTable from './DeclensionTable.svelte';
	import AdjectiveDeclensionTable from './AdjectiveDeclensionTable.svelte';
	import PronounTable from './PronounTable.svelte';
	import CaseGuide from './CaseGuide.svelte';
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

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'declension', label: 'Lookup' },
		{ id: 'pronouns', label: 'Pronouns' },
		{ id: 'cases', label: 'Cases' }
	];

	// Build an adjective-lemma lookup (exact + diacritic-stripped) once so we can route
	// the Lookup tab to the adjective view when the user clicks an adjective lemma.
	const adjectiveLemmaLookup: Record<string, true> = {};
	for (const a of loadAdjectiveBank()) {
		const lower = a.lemma.toLowerCase();
		adjectiveLemmaLookup[lower] = true;
		adjectiveLemmaLookup[stripDiacritics(lower)] = true;
	}

	let isAdjective = $derived.by(() => {
		const w = initialWord.trim().toLowerCase();
		if (w === '') return false;
		return adjectiveLemmaLookup[w] === true || adjectiveLemmaLookup[stripDiacritics(w)] === true;
	});
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
			{#if isAdjective}
				<AdjectiveDeclensionTable {initialWord} alwaysExpanded={true} />
			{:else}
				<DeclensionTable {initialWord} alwaysExpanded={true} />
			{/if}
		{:else if activeTab === 'pronouns'}
			<PronounTable {initialPronoun} alwaysExpanded={true} />
		{:else if activeTab === 'cases'}
			<CaseGuide alwaysExpanded={true} />
		{/if}
	</div>
</div>
