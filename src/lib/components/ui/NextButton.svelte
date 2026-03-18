<script lang="ts">
	let {
		onclick,
		disabled = false
	}: {
		onclick: () => void;
		disabled?: boolean;
	} = $props();
</script>

<button
	type="button"
	{onclick}
	{disabled}
	aria-label="Next question"
	class="w-full rounded-[48px] bg-emphasis py-3.5 text-lg font-semibold text-text-inverted transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
>
	Next &rarr;
</button>
