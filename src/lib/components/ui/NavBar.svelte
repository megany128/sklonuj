<script lang="ts">
	let {
		activePage = 'exercises',
		onNavigate
	}: {
		activePage?: 'exercises' | 'lookup';
		onNavigate?: (page: 'exercises' | 'lookup') => void;
	} = $props();
</script>

<nav
	class="sticky top-0 z-10 flex items-center justify-between border-b border-card-stroke bg-card-bg px-6 py-3"
>
	<div class="flex items-baseline gap-2">
		<span class="text-lg font-semibold uppercase tracking-wide text-emphasis">Skloňuj</span>
		<span class="text-sm text-text-subtitle">decline it!</span>
	</div>
	{#if onNavigate}
		<div class="flex items-center gap-4">
			<button
				type="button"
				onclick={() => onNavigate?.('exercises')}
				class="text-sm transition-colors {activePage === 'exercises'
					? 'font-medium text-text-default'
					: 'text-text-subtitle hover:text-text-default'}"
			>
				Exercises
			</button>
			<button
				type="button"
				onclick={() => onNavigate?.('lookup')}
				class="text-sm transition-colors {activePage === 'lookup'
					? 'font-medium text-text-default'
					: 'text-text-subtitle hover:text-text-default'}"
			>
				Lookup
			</button>
		</div>
	{/if}
</nav>
