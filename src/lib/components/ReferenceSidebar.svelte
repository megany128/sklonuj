<script lang="ts">
	import DeclensionTable from './DeclensionTable.svelte';
	import CaseGuide from './CaseGuide.svelte';
	import CheatSheet from './CheatSheet.svelte';

	type TabId = 'declension' | 'cases' | 'prepositions';

	let {
		initialWord = '',
		initialTab = 'declension',
		onClose
	}: {
		initialWord?: string;
		initialTab?: TabId;
		onClose: () => void;
	} = $props();

	let activeTab: TabId = $state('declension');

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'declension', label: 'Declension' },
		{ id: 'cases', label: 'Cases' },
		{ id: 'prepositions', label: 'Prepositions' }
	];

	// Sync activeTab when initialWord or initialTab changes
	$effect(() => {
		if (initialWord && initialWord.trim() !== '') {
			activeTab = 'declension';
		} else {
			activeTab = initialTab;
		}
	});
</script>

<div class="flex h-full flex-col bg-card-bg">
	<!-- Header -->
	<div class="flex shrink-0 items-center justify-between border-b border-card-stroke px-5 py-4">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-text-default">Reference</h2>
		<button
			type="button"
			onclick={onClose}
			class="flex h-8 w-8 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-label="Close"
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
	</div>

	<!-- Tab bar - segmented control style -->
	<div class="shrink-0 px-5 py-3">
		<div class="flex rounded-[24px] bg-shaded-background p-1">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					onclick={() => (activeTab = tab.id)}
					class="flex-1 rounded-[20px] px-3 py-2 text-xs font-semibold transition-all
						{activeTab === tab.id
						? 'bg-card-bg text-text-default shadow-sm'
						: 'text-text-subtitle hover:text-text-default'}"
				>
					{tab.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto px-5 py-4">
		{#if activeTab === 'declension'}
			<DeclensionTable {initialWord} alwaysExpanded={true} />
		{:else if activeTab === 'cases'}
			<CaseGuide alwaysExpanded={true} />
		{:else if activeTab === 'prepositions'}
			<CheatSheet alwaysExpanded={true} />
		{/if}
	</div>
</div>
