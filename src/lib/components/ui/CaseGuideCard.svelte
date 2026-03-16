<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_LABELS, CASE_COLORS, CASE_NUMBER } from '$lib/types';

	let {
		case_,
		question,
		mnemonic,
		description,
		example,
		exampleTranslation
	}: {
		case_: Case;
		question: string;
		mnemonic: string;
		description: string;
		example: string;
		exampleTranslation: string;
	} = $props();
</script>

<div class="rounded-[24px] border-2 border-shaded-background bg-card-bg p-5">
	<div class="mb-3 flex items-start gap-3">
		<span
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white {CASE_COLORS[
				case_
			].bg}"
		>
			{CASE_NUMBER[case_]}
		</span>
		<div class="min-w-0">
			<p class="font-semibold {CASE_COLORS[case_].text}">{CASE_LABELS[case_]}</p>
			<p class="text-sm text-text-subtitle">{question}</p>
		</div>
	</div>
	<div class="ml-10 space-y-2">
		<p class="text-sm font-semibold text-text-default">{mnemonic}</p>
		<p class="text-sm text-text-subtitle">{description}</p>
		<p class="text-sm">
			<span class="font-semibold text-text-default">{example}</span>
			<span class="ml-1 text-text-subtitle">&mdash; {exampleTranslation}</span>
		</p>
	</div>
</div>
