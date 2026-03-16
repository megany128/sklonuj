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

<div class="flex w-full rounded-[20px] border border-card-stroke bg-card-bg p-1.5">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			onclick={() => onTabChange(tab.id)}
			class="flex-1 rounded-[16px] px-4 py-3 text-sm transition-all
				{activeTab === tab.id
				? 'bg-shaded-background text-text-default'
				: 'text-text-subtitle hover:text-text-default'}"
		>
			{tab.label}
			{#if tab.badge !== undefined}
				<span
					class="ml-1.5 inline-flex items-center justify-center rounded-[24px] border-2 border-card-stroke bg-shaded-background px-3 py-0.5 text-sm font-normal text-darker-subtitle"
				>
					{tab.badge}
				</span>
			{/if}
		</button>
	{/each}
</div>
