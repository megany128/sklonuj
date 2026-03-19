<script lang="ts">
	import DeclensionTable from './DeclensionTable.svelte';
	import PronounTable from './PronounTable.svelte';
	import CaseGuide from './CaseGuide.svelte';

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
		{ id: 'declension', label: 'Nouns' },
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
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-5 w-5"
			>
				<path
					d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
				/>
			</svg>
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
			<DeclensionTable {initialWord} alwaysExpanded={true} />
		{:else if activeTab === 'pronouns'}
			<PronounTable {initialPronoun} alwaysExpanded={true} />
		{:else if activeTab === 'cases'}
			<CaseGuide alwaysExpanded={true} />
		{/if}
	</div>
</div>
