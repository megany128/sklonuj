<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { DrillResult } from '$lib/types';

	let {
		result,
		paradigmNotes
	}: {
		result: DrillResult | null;
		paradigmNotes: Record<string, string> | null;
	} = $props();

	let noteKey = $derived(result ? `${result.question.case}_${result.question.number}` : '');
	let whyNote = $derived(paradigmNotes && noteKey ? (paradigmNotes[noteKey] ?? null) : null);
	let templateWhy = $derived(
		result && result.question.template.id !== '_form_production'
			? result.question.template.why
			: null
	);
</script>

{#if result && !result.correct && (whyNote || templateWhy)}
	<div
		transition:slide={{ duration: 300 }}
		class="w-full rounded-2xl border border-brand-200/60 bg-brand-50/50 p-5 dark:border-brand-800/40 dark:bg-brand-950/30"
	>
		<div class="mb-3 flex items-center gap-2">
			<div
				class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-3.5 w-3.5 text-brand-600 dark:text-brand-400"
				>
					<path
						d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.75.75h2.5a.75.75 0 00.75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.563 7.563 0 01-2.274 0z"
					/>
				</svg>
			</div>
			<p class="text-xs font-bold tracking-wide text-brand-600 uppercase dark:text-brand-400">
				Why?
			</p>
		</div>

		{#if templateWhy}
			<p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
				{templateWhy}
			</p>
		{/if}

		{#if whyNote}
			<p
				class="text-sm leading-relaxed {templateWhy
					? 'mt-2'
					: ''} text-slate-600 dark:text-slate-400"
			>
				{whyNote}
			</p>
		{/if}
	</div>
{/if}
