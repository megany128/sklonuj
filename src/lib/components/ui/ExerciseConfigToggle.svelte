<script lang="ts">
	import Settings from '@lucide/svelte/icons/settings';

	let {
		onclick,
		expanded = false
	}: {
		onclick: () => void;
		expanded?: boolean;
	} = $props();
</script>

<button
	type="button"
	{onclick}
	aria-expanded={expanded}
	class="inline-flex items-center gap-2 rounded-[24px] border-2 border-card-stroke bg-shaded-background px-4 py-2 text-sm font-normal text-darker-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
>
	<Settings class="h-4 w-4" aria-hidden="true" />
	Exercise Configuration
</button>
