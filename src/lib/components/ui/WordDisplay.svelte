<script lang="ts">
	import DottedUnderline from './DottedUnderline.svelte';

	let {
		word,
		onSpeak,
		onClick
	}: {
		word: string;
		onSpeak?: (text: string) => void;
		onClick?: (lemma: string) => void;
	} = $props();
</script>

<div class="inline-flex items-center gap-3">
	<div class="flex flex-col items-center">
		{#if onClick}
			<button
				type="button"
				onclick={() => onClick?.(word)}
				class="cursor-pointer text-3xl font-semibold italic text-text-default transition-opacity hover:opacity-70"
			>
				{word}
			</button>
		{:else}
			<span class="text-3xl font-semibold italic text-text-default">{word}</span>
		{/if}
		<DottedUnderline />
	</div>
	{#if onSpeak}
		<button
			type="button"
			onclick={() => onSpeak?.(word)}
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-card-stroke hover:text-text-default"
			aria-label="Listen to pronunciation"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-5 w-5"
			>
				<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
				<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
				<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
			</svg>
		</button>
	{/if}
</div>
