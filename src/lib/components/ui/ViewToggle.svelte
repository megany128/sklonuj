<script lang="ts">
	let {
		tabs,
		activeTab,
		onTabChange
	}: {
		tabs: { id: string; label: string; badge?: number }[];
		activeTab: string;
		onTabChange: (id: string) => void;
	} = $props();
</script>

<div class="inline-flex rounded-full bg-card-stroke/50 p-1">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			onclick={() => onTabChange(tab.id)}
			class="rounded-full px-4 py-2 text-sm font-semibold transition-all
				{activeTab === tab.id
				? 'bg-card-bg text-text-default shadow-sm'
				: 'text-text-subtitle hover:text-text-default'}"
		>
			{tab.label}
			{#if tab.badge !== undefined}
				<span
					class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-card-stroke px-1 text-xs font-semibold text-text-subtitle"
				>
					{tab.badge}
				</span>
			{/if}
		</button>
	{/each}
</div>
