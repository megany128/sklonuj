<script lang="ts">
	import { diffAnswer } from '$lib/utils/answer-diff';

	/**
	 * Renders `text` with the letters that differ from `reference` marked:
	 * struck through for a wrong answer, underlined in amber for an accent
	 * slip, highlighted in green for the correct form.
	 */
	let {
		text,
		reference,
		tone
	}: {
		text: string;
		reference: string;
		tone: 'wrong' | 'almost' | 'right';
	} = $props();

	let segments = $derived(diffAnswer(text, reference));

	const MARK_CLASS = {
		wrong: 'bg-negative-stroke/15 line-through decoration-2',
		almost: 'bg-warning-text/15 underline decoration-warning-text decoration-2 underline-offset-4',
		right: 'bg-positive-stroke/30'
	} as const;
</script>

<span
	>{#each segments as segment, i (i)}{#if segment.changed}<mark
				class="rounded-[4px] px-[1px] text-inherit {MARK_CLASS[tone]}">{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}</span
>
