<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import SkipForward from '@lucide/svelte/icons/skip-forward';

	/** One-line verdict shown right under the answer: what happened, then why. */
	let {
		tone,
		title,
		children
	}: {
		tone: 'correct' | 'wrong' | 'almost' | 'skipped';
		title: string;
		children?: Snippet;
	} = $props();

	const TONE = {
		correct: { icon: CircleCheck, text: 'text-positive-stroke' },
		wrong: { icon: CircleX, text: 'text-negative-stroke' },
		almost: { icon: CircleAlert, text: 'text-warning-text' },
		skipped: { icon: SkipForward, text: 'text-darker-subtitle' }
	} as const;

	let Icon = $derived(TONE[tone].icon);
</script>

<div class="flex flex-col items-center gap-1 text-center">
	<div class="flex items-center justify-center gap-2">
		<Icon class="size-5 shrink-0 {TONE[tone].text}" aria-hidden="true" />
		<p class="text-lg font-semibold {TONE[tone].text}">{title}</p>
	</div>
	{#if children}
		<p class="max-w-md text-balance text-sm leading-relaxed text-text-default">
			{@render children()}
		</p>
	{/if}
</div>
