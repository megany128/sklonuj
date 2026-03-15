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

<div class="flex h-full flex-col">
	<!-- Header -->
	<div
		class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700"
	>
		<h2 class="text-sm font-bold text-slate-800 dark:text-slate-100">Reference</h2>
		<button
			type="button"
			onclick={onClose}
			class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
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

	<!-- Tab bar -->
	<div class="flex shrink-0 gap-1 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors {activeTab === tab.id
					? 'bg-brand-600 text-white dark:bg-brand-500'
					: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if activeTab === 'declension'}
			<DeclensionTable {initialWord} alwaysExpanded={true} />
		{:else if activeTab === 'cases'}
			<CaseGuide alwaysExpanded={true} />
		{:else if activeTab === 'prepositions'}
			<CheatSheet alwaysExpanded={true} />
		{/if}
	</div>
</div>
