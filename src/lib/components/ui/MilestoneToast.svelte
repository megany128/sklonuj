<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { Component } from 'svelte';

	let {
		message,
		emoji,
		icon,
		iconColor,
		index = 0,
		onClick,
		onDismiss
	}: {
		message: string;
		emoji?: string;
		icon?: Component;
		iconColor?: string;
		index?: number;
		onClick?: () => void;
		onDismiss: () => void;
	} = $props();

	$effect(() => {
		const timer = setTimeout(onDismiss, 3000 + index * 400);
		return () => clearTimeout(timer);
	});

	let Icon = $derived(icon);

	function handleClick() {
		onClick?.();
		onDismiss();
	}
</script>

{#snippet body()}
	<p class="flex items-center gap-2 text-sm font-semibold text-emphasis">
		{#if Icon}
			<span class={iconColor ?? ''}>
				<Icon class="size-4" aria-hidden="true" />
			</span>
		{:else if emoji}
			<span>{emoji}</span>
		{/if}
		<span>{message}</span>
	</p>
{/snippet}

<div
	in:fly={{ y: -20, duration: 300 }}
	out:fade={{ duration: 400 }}
	class="toast-slide-in fixed left-1/2 z-50 -translate-x-1/2"
	style="top: {80 + index * 52}px"
	role="status"
	aria-live="polite"
>
	{#if onClick}
		<button
			type="button"
			onclick={handleClick}
			class="block cursor-pointer rounded-2xl border border-card-stroke bg-card-bg px-5 py-3 text-left shadow-lg transition-shadow hover:shadow-xl"
		>
			{@render body()}
		</button>
	{:else}
		<div class="rounded-2xl border border-card-stroke bg-card-bg px-5 py-3 shadow-lg">
			{@render body()}
		</div>
	{/if}
</div>
