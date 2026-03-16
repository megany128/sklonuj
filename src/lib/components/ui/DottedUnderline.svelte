<script lang="ts">
	let {
		colorClass = 'bg-text-subtitle',
		word = '',
		scale = 1
	}: {
		colorClass?: string;
		word?: string;
		scale?: number;
	} = $props();

	let dotCount = $derived(Math.max(3, Math.round(word.length * 2.2 * scale)));
</script>

<div class="flex w-full items-center justify-between py-0.5 opacity-50" aria-hidden="true">
	{#each Array.from({ length: dotCount }, (__, i) => i) as i (i)}
		<span class="h-[3px] w-[3px] shrink-0 rounded-full {colorClass}"></span>
	{/each}
</div>
