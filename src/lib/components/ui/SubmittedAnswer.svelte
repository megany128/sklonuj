<script lang="ts">
	import AnswerDiff from './AnswerDiff.svelte';

	/**
	 * Read-only stand-in for the answer input once it has been graded. Shows what
	 * the learner typed with the differing letters marked, so the mistake is
	 * visible exactly where they were looking.
	 */
	let {
		answer,
		reference,
		tone,
		class: shapeClass = ''
	}: {
		answer: string;
		/** Form to diff against; omit to show the answer unmarked. */
		reference?: string;
		tone: 'correct' | 'wrong' | 'almost' | 'skipped';
		/** Size/shape classes so the field matches the input it replaces. */
		class?: string;
	} = $props();

	const TONE_CLASS = {
		correct: 'border-positive-stroke bg-positive-background text-positive-stroke',
		wrong: 'feedback-shake border-negative-stroke bg-negative-background text-negative-stroke',
		almost: 'border-warning-text bg-warning-background text-warning-text',
		skipped: 'border-dashed border-darker-shaded-background bg-shaded-background text-text-subtitle'
	} as const;
</script>

<div
	class="flex min-w-0 flex-1 items-center justify-center border-2 text-center {TONE_CLASS[
		tone
	]} {shapeClass}"
>
	{#if tone === 'skipped'}
		<span class="italic">Skipped</span>
	{:else if reference !== undefined}
		<span class="sr-only">Your answer:</span>
		<AnswerDiff text={answer} {reference} tone={tone === 'wrong' ? 'wrong' : 'almost'} />
	{:else}
		<span class="sr-only">Your answer:</span>
		{answer}
	{/if}
</div>
