<script lang="ts">
	import Lightbulb from '@lucide/svelte/icons/lightbulb';

	/**
	 * "Why?" block under an answer. Notes are terse rule lines separated by
	 * newlines; a blank line separates groups (word-specific note, paradigm
	 * rule, pronoun general note). Each group's first line leads, and a leading
	 * gotcha label ("Before -ě:", "Note:") is bolded so lines scan at a glance.
	 */
	let {
		templateWhy = null,
		whyNote = null
	}: {
		/** Why the sentence needs this case (trigger → case). */
		templateWhy?: string | null;
		/** How the word forms it (paradigm ending, word-specific quirks). */
		whyNote?: string | null;
	} = $props();

	const LABEL = /^([A-Z][^:→]{0,40}):\s+(.+)$/;

	interface Line {
		label: string | null;
		body: string;
	}

	function toLines(text: string): Line[] {
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '')
			.map((line) => {
				const match = LABEL.exec(line);
				return match ? { label: match[1], body: match[2] } : { label: null, body: line };
			});
	}

	function toGroups(text: string | null): Line[][] {
		if (!text) return [];
		return text
			.split(/\n\s*\n/)
			.map(toLines)
			.filter((group) => group.length > 0);
	}

	let ruleLines = $derived(templateWhy ? toLines(templateWhy) : []);
	let noteGroups = $derived(toGroups(whyNote));
</script>

{#if ruleLines.length > 0 || noteGroups.length > 0}
	<div class="w-full border-t border-darker-subtitle/30 pt-4 text-center">
		<div class="mb-2 flex items-center justify-center gap-1.5">
			<Lightbulb class="h-3.5 w-3.5 text-darker-subtitle" aria-hidden="true" />
			<p class="text-xs font-semibold text-darker-subtitle">Why?</p>
		</div>
		{#each ruleLines as line, i (i)}
			<p class="text-sm font-medium leading-relaxed text-text-default">
				{#if line.label}<span class="font-semibold">{line.label}:</span>{/if}
				{line.body}
			</p>
		{/each}
		{#each noteGroups as group, g (g)}
			<div class={ruleLines.length > 0 || g > 0 ? 'mt-2' : ''}>
				{#each group as line, i (i)}
					<p
						class="text-sm leading-relaxed {i === 0
							? 'text-darker-subtitle'
							: 'text-text-subtitle'}"
					>
						{#if line.label}<span class="font-semibold text-darker-subtitle">{line.label}:</span
							>{/if}
						{line.body}
					</p>
				{/each}
			</div>
		{/each}
	</div>
{/if}
