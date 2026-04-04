<script lang="ts">
	interface BreadcrumbItem {
		label: string;
		href: string;
	}

	let { items }: { items: BreadcrumbItem[] } = $props();
</script>

<nav aria-label="Breadcrumb" class="mb-4">
	<ol class="flex flex-wrap items-center gap-1 text-sm text-text-subtitle">
		{#each items as item, i (item.href)}
			{#if i > 0}
				<li aria-hidden="true" class="select-none">/</li>
			{/if}
			{#if i === items.length - 1}
				<li>
					<span class="font-medium text-text-default">{item.label}</span>
				</li>
			{:else}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass already-resolved hrefs -->
					<a href={item.href} class="transition-colors hover:text-text-default">
						{item.label}
					</a>
				</li>
			{/if}
		{/each}
	</ol>
</nav>
