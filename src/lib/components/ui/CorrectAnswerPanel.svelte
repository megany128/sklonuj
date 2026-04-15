<script lang="ts">
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import type { AdjectiveGenderKey, Case, DrillType, Number_ } from '$lib/types';
	import { CASE_COLORS, CASE_LABELS, CASE_NUMBER } from '$lib/types';
	import DottedUnderline from './DottedUnderline.svelte';
	import FeedbackDeclensionChart from './FeedbackDeclensionChart.svelte';
	import FeedbackAdjectiveDeclensionChart from './FeedbackAdjectiveDeclensionChart.svelte';
	import FeedbackPronounDeclensionChart from './FeedbackPronounDeclensionChart.svelte';

	let {
		correctAnswer,
		nominative,
		targetForm,
		translation,
		case_,
		drillType,
		nearMiss = false,
		accidentalCase = undefined,
		questionNumber = undefined,
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
		nominative?: string;
		targetForm?: string;
		translation?: string;
		case_: Case;
		drillType: DrillType;
		nearMiss?: boolean;
		accidentalCase?: { case: Case; number: Number_ };
		questionNumber?: Number_;
		number_?: Number_;
		templateWhy?: string | null;
		whyNote?: string | null;
		onSpeak?: (text: string) => void;
		onWordClick?: (lemma: string) => void;
		adjectiveLemma?: string;
		adjectiveGenderKey?: AdjectiveGenderKey;
		pronounLemma?: string;
	} = $props();

	let hasWhy = $derived(!!templateWhy?.trim() || !!whyNote?.trim());
</script>

<div
	role="status"
	aria-live="polite"
	class="flex flex-col items-center gap-4 rounded-[24px] border-2 border-darker-subtitle bg-shaded-background p-6 text-center"
>
	<p class="text-sm text-text-default">Correct answer:</p>

	{#if drillType === 'case_identification'}
		<div class="flex flex-col items-center gap-2">
			<div class="flex items-center gap-4">
				<div
					class="flex size-6 shrink-0 items-center justify-center rounded-full {CASE_COLORS[case_]
						.bg}"
				>
					<span class="text-xs font-semibold text-white">{CASE_NUMBER[case_]}</span>
				</div>
				<span class="text-2xl font-semibold {CASE_COLORS[case_].text}">{CASE_LABELS[case_]}</span>
			</div>
			{#if nominative && targetForm && nominative !== targetForm}
				<p class="text-sm text-text-subtitle">
					{nominative} &rarr;
					<span class="font-semibold {CASE_COLORS[case_].text}">{targetForm}</span>
				</p>
			{/if}
			{#if translation}
				<p class="text-xs italic text-text-subtitle">
					{nominative ?? correctAnswer} = {translation}
				</p>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col items-center gap-2">
			<div class="flex items-center gap-3">
				{#if onWordClick}
					<button
						type="button"
						onclick={() => onWordClick?.(correctAnswer)}
						aria-label="Look up {correctAnswer}"
						class="cursor-pointer text-2xl font-semibold {CASE_COLORS[case_]
							.text} transition-opacity hover:opacity-70"
					>
						<span>{correctAnswer}</span>
						<DottedUnderline colorClass={CASE_COLORS[case_].bg} word={correctAnswer} />
					</button>
				{:else}
					<div class="flex flex-col items-center">
						<span class="text-2xl font-semibold {CASE_COLORS[case_].text}">{correctAnswer}</span>
						<DottedUnderline colorClass={CASE_COLORS[case_].bg} word={correctAnswer} />
					</div>
				{/if}
				{#if onSpeak}
					<button
						type="button"
						onclick={() => onSpeak?.(correctAnswer)}
						class="flex size-8 shrink-0 items-center justify-center rounded-full bg-shaded-background text-darker-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
						aria-label="Listen to pronunciation"
					>
						<Volume2 class="size-4" aria-hidden="true" />
					</button>
				{/if}
			</div>
			<span
				class="inline-flex items-center rounded-full font-semibold text-on-accent {CASE_COLORS[
					case_
				].bg} px-2 py-0.5 text-xs"
			>
				{CASE_NUMBER[case_]}. {CASE_LABELS[case_]}
			</span>
			{#if nominative && targetForm && nominative !== targetForm}
				<p class="text-sm text-text-subtitle">
					{nominative} &rarr;
					<span class="font-semibold {CASE_COLORS[case_].text}">{targetForm}</span>
				</p>
			{/if}
			{#if translation}
				<p class="text-xs italic text-text-subtitle">
					{nominative ?? correctAnswer} = {translation}
				</p>
			{/if}
		</div>
	{/if}

	{#if nearMiss}
		<p class="text-sm font-semibold text-warning-text">Almost! Check your diacritics.</p>
	{/if}

	{#if accidentalCase}
		<p class="text-sm text-text-subtitle">
			You typed the <span class="font-semibold {CASE_COLORS[accidentalCase.case].text}"
				>{CASE_NUMBER[accidentalCase.case]}. {CASE_LABELS[
					accidentalCase.case
				]}{accidentalCase.number !== questionNumber
					? accidentalCase.number === 'pl'
						? ' (plural)'
						: ' (singular)'
					: ''}</span
			> form instead.
		</p>
	{/if}

	{#if hasWhy}
		<div class="w-full border-t border-darker-subtitle/30 pt-4">
			<div class="mb-2 flex items-center justify-center gap-1.5">
				<Lightbulb class="h-3.5 w-3.5 text-darker-subtitle" aria-hidden="true" />
				<p class="text-xs font-semibold text-darker-subtitle">Why?</p>
			</div>
			{#if templateWhy}
				<p class="text-center text-sm leading-relaxed text-darker-subtitle">
					{templateWhy}
				</p>
			{/if}
			{#if whyNote}
				<p
					class="text-center text-sm leading-relaxed {templateWhy
						? 'mt-1.5'
						: ''} text-text-subtitle"
				>
					{whyNote}
				</p>
			{/if}
		</div>
	{/if}

	{#if nominative && number_}
		<FeedbackDeclensionChart lemma={nominative} {case_} {number_} />
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
