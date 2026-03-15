<script lang="ts">
	const dots = [0, 1, 2, 3, 4, 5, 6, 7];
</script>

<div class="flex items-center justify-center gap-1 py-1" aria-hidden="true">
	{#each dots as dot (dot)}
		<span class="h-1 w-1 rounded-full bg-text-subtitle"></span>
	{/each}
</div>
