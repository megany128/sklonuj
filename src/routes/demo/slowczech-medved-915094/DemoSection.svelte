<script lang="ts">
	import type { DrillResult } from '$lib/types';
	import { checkAnswer } from '$lib/engine/drill';
	import DrillCard from '$lib/components/DrillCard.svelte';
	import type { BuiltSection } from './build-questions';

	export interface SectionProgress {
		/** Shuffled order of question indices for the current pass. */
		order: number[];
		position: number;
		answered: number;
		correct: number;
		streak: number;
	}

	let {
		section,
		progress,
		onSpeak
	}: {
		section: BuiltSection;
		/** Owned by the page so it survives switching between sections. */
		progress: SectionProgress;
		onSpeak: ((text: string) => void) | null;
	} = $props();

	/** Near-misses (missing diacritics) count as correct at A2, with a note. */
	const LEVEL = 'A2';

	let lastResult = $state<DrillResult | null>(null);

	function shuffled(n: number, avoidFirst: number | null): number[] {
		const arr = Array.from({ length: n }, (_, i) => i);
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		// Don't repeat the question that just ended the previous pass.
		if (n > 1 && arr[0] === avoidFirst) [arr[0], arr[1]] = [arr[1], arr[0]];
		return arr;
	}

	// Endless: when a pass runs out, reshuffle and keep going.
	$effect(() => {
		if (progress.order.length === 0 || progress.position >= progress.order.length) {
			const last = progress.order[progress.order.length - 1] ?? null;
			progress.order = shuffled(section.questions.length, last);
			progress.position = 0;
		}
	});

	let current = $derived(section.questions[progress.order[progress.position]] ?? null);

	function handleSubmit(answer: string): void {
		if (!current) return;
		if (answer === '__advance__') {
			lastResult = null;
			progress.position += 1;
			return;
		}
		if (answer === '__skip__') {
			progress.answered += 1;
			progress.streak = 0;
			lastResult = {
				question: current.question,
				userAnswer: '',
				correct: false,
				nearMiss: false
			};
			return;
		}
		const result = checkAnswer(current.question, answer, LEVEL);
		if (!result) return;
		progress.answered += 1;
		if (result.correct) {
			progress.correct += 1;
			progress.streak += 1;
		} else {
			progress.streak = 0;
		}
		lastResult = result;
	}
</script>

<div class="mb-4">
	<h2 class="text-lg font-semibold text-emphasis sm:text-xl">
		<span aria-hidden="true">{section.def.emoji}</span>
		{section.def.label[0]}
		<span class="font-normal text-darker-subtitle">{section.def.label[1]}</span>
	</h2>
	<p class="mt-0.5 text-sm text-text-subtitle">{section.def.usage}</p>
</div>

{#if current}
	<DrillCard
		question={current.question}
		result={lastResult}
		onSubmit={handleSubmit}
		{onSpeak}
		selectedCases={current.caseOptions}
		paradigmNotes={current.paradigmNotes}
		onWordClick={null}
		streak={progress.streak}
		soundEnabled={true}
	/>
{/if}
