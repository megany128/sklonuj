<script lang="ts">
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import type { AdjectiveGenderKey, Case, DrillType, Number_ } from '$lib/types';
	import { CASE_HEX, CASE_LABELS, CASE_NUMBER } from '$lib/types';
	import AnswerDiff from './AnswerDiff.svelte';
	import CaseBadge from './CaseBadge.svelte';
	import DottedUnderline from './DottedUnderline.svelte';
	import WhyNote from './WhyNote.svelte';
	import FeedbackDeclensionChart from './FeedbackDeclensionChart.svelte';
	import FeedbackAdjectiveDeclensionChart from './FeedbackAdjectiveDeclensionChart.svelte';
	import FeedbackPronounDeclensionChart from './FeedbackPronounDeclensionChart.svelte';

	let {
		correctAnswer,
		userAnswer = undefined,
		nominative,
		chartLemma = undefined,
		targetForm,
		translation,
		case_,
		drillType,
		number_ = undefined,
		templateWhy,
		whyNote,
		onSpeak,
		onWordClick,
		adjectiveLemma = undefined,
		adjectiveGenderKey = undefined,
		pronounLemma = undefined
	}: {
		correctAnswer: string;
		/** What the learner typed; marks where the correct form differs from it. */
		userAnswer?: string;
		nominative?: string;
		chartLemma?: string;
		targetForm?: string;
		translation?: string;
		case_: Case;
		drillType: DrillType;
		number_?: Number_;
		templateWhy?: string | null;
		whyNote?: string | null;
		onSpeak?: (text: string) => void;
		onWordClick?: (lemma: string) => void;
		adjectiveLemma?: string;
		adjectiveGenderKey?: AdjectiveGenderKey;
		pronounLemma?: string;
	} = $props();

	let showDiff = $derived(!!userAnswer?.trim());
</script>

<div class="flex flex-col gap-4">
	<!-- The answer itself: green-labelled so it never reads as another mistake.
	     Case colour is kept to the badge/dot, where it only identifies the case. -->
	<div
		class="flex flex-col items-center gap-2 rounded-[24px] border-2 border-positive-stroke/40 bg-positive-background px-6 py-5 text-center"
	>
		<p
			class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-darker-subtitle"
		>
			<CircleCheck class="size-3.5 text-positive-stroke" aria-hidden="true" />
			Correct answer
		</p>

		{#if drillType === 'case_identification'}
			<div class="flex items-center gap-2.5">
				<span
					class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
					style="background-color: {CASE_HEX[case_]}">{CASE_NUMBER[case_]}</span
				>
				<span class="text-2xl font-semibold text-emphasis">{CASE_LABELS[case_]}</span>
			</div>
			{#if nominative && targetForm && nominative !== targetForm}
				<p class="text-sm text-text-subtitle">
					{nominative} &rarr;
					<span class="font-semibold text-text-default">{targetForm}</span>
				</p>
			{/if}
			{#if translation}
				<p class="text-xs italic text-text-subtitle">
					{nominative ?? correctAnswer} = {translation}
				</p>
			{/if}
		{:else}
			<div class="flex items-center gap-3">
				{#if onWordClick}
					<button
						type="button"
						onclick={() => onWordClick?.(correctAnswer)}
						aria-label="Look up {correctAnswer}"
						class="cursor-pointer text-3xl font-semibold text-emphasis transition-opacity hover:opacity-70"
					>
						{#if showDiff && userAnswer}
							<AnswerDiff text={correctAnswer} reference={userAnswer} tone="right" />
						{:else}
							<span>{correctAnswer}</span>
						{/if}
						<DottedUnderline word={correctAnswer} />
					</button>
				{:else}
					<span class="text-3xl font-semibold text-emphasis">
						{#if showDiff && userAnswer}
							<AnswerDiff text={correctAnswer} reference={userAnswer} tone="right" />
						{:else}
							{correctAnswer}
						{/if}
					</span>
				{/if}
				{#if onSpeak}
					<button
						type="button"
						onclick={() => onSpeak?.(correctAnswer)}
						class="flex size-8 shrink-0 items-center justify-center rounded-full bg-card-bg text-darker-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
						aria-label="Listen to pronunciation"
					>
						<Volume2 class="size-4" aria-hidden="true" />
					</button>
				{/if}
			</div>
			<CaseBadge {case_} size="sm" />
			{#if translation}
				<p class="text-xs italic text-text-subtitle">
					{nominative ?? correctAnswer} = {translation}
				</p>
			{/if}
		{/if}
	</div>

	<WhyNote {templateWhy} {whyNote} />

	{#if (chartLemma ?? nominative) && number_}
		<FeedbackDeclensionChart lemma={chartLemma ?? nominative ?? ''} {case_} {number_} />
	{/if}

	{#if adjectiveLemma && adjectiveGenderKey && number_}
		<FeedbackAdjectiveDeclensionChart
			lemma={adjectiveLemma}
			genderKey={adjectiveGenderKey}
			{case_}
			{number_}
		/>
	{/if}

	{#if pronounLemma && number_}
		<FeedbackPronounDeclensionChart lemma={pronounLemma} {case_} {number_} />
	{/if}
</div>
