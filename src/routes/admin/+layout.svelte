<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let { children } = $props();

	const TABS: ReadonlyArray<{ href: '/admin/reports' | '/admin/audit/templates'; label: string }> =
		[
			{ href: '/admin/reports', label: 'Reports' },
			{ href: '/admin/audit/templates', label: 'Template review' }
		];

	let currentPath = $derived(page.url.pathname);
</script>

<NavBar />

<div class="mx-auto w-full max-w-6xl px-4 py-6">
	<header class="mb-6">
		<h1 class="text-2xl font-bold">Admin</h1>
		<p class="text-sm text-darker-subtitle">Internal triage tools.</p>
	</header>

	<nav class="mb-6 flex gap-1 border-b border-card-stroke">
		{#each TABS as tab (tab.href)}
			{@const active = currentPath.startsWith(tab.href)}
			<a
				href={resolve(tab.href)}
				class="border-b-2 px-3 py-2 text-sm font-medium transition-colors {active
					? 'border-text-default text-text-default'
					: 'border-transparent text-darker-subtitle hover:text-text-default'}"
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
