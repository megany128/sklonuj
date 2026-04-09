<script lang="ts">
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import DottedUnderline from './DottedUnderline.svelte';

	let {
		word,
		onSpeak,
		onClick,
		colorClass = 'text-text-default',
		borderColorClass = 'bg-text-subtitle'
	}: {
		word: string;
		onSpeak?: (text: string) => void;
		onClick?: (lemma: string) => void;
		colorClass?: string;
		borderColorClass?: string;
	} = $props();
</script>

<div class="inline-flex items-center gap-3">
	<div class="flex flex-col items-center">
		{#if onClick}
			<button
				type="button"
				onclick={() => onClick?.(word)}
				class="cursor-pointer text-4xl font-semibold {colorClass} transition-opacity hover:opacity-70"
			>
				{word}
				<DottedUnderline colorClass={borderColorClass} {word} scale={1.4} />
			</button>
		{:else}
			<span class="text-4xl font-semibold {colorClass}">{word}</span>
			<DottedUnderline colorClass={borderColorClass} {word} scale={1.4} />
		{/if}
	</div>
	{#if onSpeak}
		<button
			type="button"
			onclick={() => onSpeak?.(word)}
			class="flex size-8 shrink-0 items-center justify-center rounded-full bg-shaded-background text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
			aria-label="Listen to pronunciation"
		>
			<Volume2 class="size-4" aria-hidden="true" />
		</button>
	{/if}
</div>
