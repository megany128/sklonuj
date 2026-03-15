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
	class="w-full rounded-full bg-neutral-800 py-3.5 text-lg font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
>
	Next &rarr;
</button>
