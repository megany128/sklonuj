<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children: Snippet;
	} = $props();
</script>

<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-sm sm:p-8">
	{@render children()}
</div>
