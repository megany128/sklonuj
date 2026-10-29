<script lang="ts">
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import { CASE_COLORS, CASE_HEX, CASE_NUMBER } from '$lib/types';
	import type { CardPhrase, LearningCardModel } from '$lib/engine/learning-cards';

	let {
		card,
		onPrimary,
		onSecondary
	}: {
		card: LearningCardModel;
		onPrimary: () => void;
		onSecondary?: () => void;
	} = $props();

	let hex = $derived(card.case ? CASE_HEX[card.case] : null);

	// The primary button takes focus, so Enter carries on as it does on a question.
	function focusOnMount(node: HTMLButtonElement) {
		node.focus({ preventScroll: true });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && onSecondary) {
			e.preventDefault();
			onSecondary();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet phrase(ph: CardPhrase, tone: 'plain' | 'case' | 'chip')}
	<span
		>{ph.before}<span
			class="font-semibold {tone === 'plain'
				? 'text-text-default'
				: tone === 'chip'
					? 'mx-0.5 rounded-md px-1.5 py-0.5 text-white'
					: ''}"
			style={tone === 'chip' && hex ? `background-color: ${hex}` : undefined}
			class:case-text={tone === 'case'}>{ph.bold}</span
		>{ph.after}</span
	>
{/snippet}

<section
	class="drill-fade-enter w-full rounded-[24px] border-2 border-card-stroke bg-card-bg p-5 sm:rounded-[40px] sm:p-8"
	aria-labelledby="learning-card-title"
	data-testid="learning-card"
	data-kind={card.kind}
	style={hex ? `--case-color: ${hex}` : undefined}
>
	{#if card.eyebrow}
		<p class="text-xs text-text-subtitle">{card.eyebrow}</p>
	{:else if card.kind === 'struggle'}
		<p class="flex items-center gap-1 text-xs text-text-subtitle">
			<Lightbulb class="size-3.5" aria-hidden="true" /> Quick rundown
		</p>
	{/if}

	<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
		{#if card.case && hex}
			<span
				class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
				style="background-color: {hex}">{CASE_NUMBER[card.case]}</span
			>
		{/if}
		<h2
			id="learning-card-title"
			class="text-xl font-semibold leading-tight {card.case
				? CASE_COLORS[card.case].text
				: 'text-emphasis'}"
		>
			{card.title}
		</h2>
		{#if card.question}
			<span class="text-sm text-text-subtitle">{card.question}</span>
		{/if}
	</div>

	{#if card.line}
		<p class="mt-3 text-sm leading-relaxed text-text-default sm:text-base">{card.line}</p>
	{/if}

	{#if card.rows}
		<dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm sm:text-base">
			{#each card.rows as row (row.label)}
				<dt class="text-text-subtitle">{row.label}</dt>
				<dd class="flex flex-wrap gap-x-1.5 text-text-subtitle">
					{#each row.phrases as ph, i (i)}
						{#if i > 0}<span aria-hidden="true">·</span>{/if}
						{@render phrase(ph, 'plain')}
					{/each}
				</dd>
			{/each}
		</dl>
	{/if}

	{#if card.examples && card.examples.length > 0}
		<ul
			class="mt-4 flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm leading-loose text-text-default sm:text-base"
			style={hex ? `background-color: ${hex}1a` : undefined}
			class:bg-shaded-background={!hex}
		>
			{#each card.examples as ex, i (i)}
				<li>{@render phrase(ex, card.highlight === 'chip' ? 'chip' : 'case')}</li>
			{/each}
		</ul>
	{/if}

	{#if card.note}
		<p class="mt-3 text-sm text-text-subtitle">{@render phrase(card.note, 'plain')}</p>
	{/if}

	<div class="mt-5 flex gap-2">
		{#if card.secondary && onSecondary}
			<button
				type="button"
				onclick={onSecondary}
				class="flex-1 rounded-[16px] border border-card-stroke px-4 py-2.5 text-sm font-semibold text-text-subtitle transition-colors hover:text-text-default"
			>
				{card.secondary}
			</button>
		{/if}
		<button
			type="button"
			use:focusOnMount
			onclick={onPrimary}
			class="flex-[2] rounded-[16px] bg-emphasis px-4 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
		>
			{card.primary}
		</button>
	</div>
</section>

<style>
	.case-text {
		color: var(--case-color);
	}
</style>
