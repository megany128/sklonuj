<script lang="ts">
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import Settings from '@lucide/svelte/icons/settings';
	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';

	let {
		icon,
		onclick,
		size = 'md',
		label
	}: {
		icon: 'speaker' | 'settings' | 'info' | 'close';
		onclick: () => void;
		size?: 'sm' | 'md';
		label: string;
	} = $props();

	let sizeClasses = $derived(size === 'sm' ? 'h-7 w-7' : 'h-9 w-9');
	let iconSize = $derived(size === 'sm' ? 'h-4 w-4' : 'h-5 w-5');
</script>

<button
	type="button"
	{onclick}
	class="flex shrink-0 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-card-stroke hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emphasis {sizeClasses}"
	aria-label={label}
>
	{#if icon === 'speaker'}
		<Volume2 class={iconSize} aria-hidden="true" />
	{:else if icon === 'settings'}
		<Settings class={iconSize} aria-hidden="true" />
	{:else if icon === 'info'}
		<Info class={iconSize} aria-hidden="true" />
	{:else if icon === 'close'}
		<X class={iconSize} aria-hidden="true" />
	{/if}
</button>
