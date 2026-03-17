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

<div class="rounded-[20px] border-2 border-shaded-background bg-card-bg p-4">
	<div class="flex items-center gap-3">
		<span
			class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white {CASE_COLORS[
				case_
			].bg}"
		>
			{CASE_NUMBER[case_]}
		</span>
		<span class="text-lg font-semibold {CASE_COLORS[case_].text}">{CASE_LABELS[case_]}</span>
		<span class="text-xs text-text-subtitle">{question}</span>
	</div>
	<div class="mt-3 space-y-3">
		<p class="text-sm text-emphasis">{mnemonic}</p>
		<p class="text-sm text-text-subtitle">{description}</p>
		<p class="text-sm">
			<span class="text-emphasis">{example}</span>
			<span class="text-text-subtitle"> {exampleTranslation}</span>
		</p>
	</div>
</div>
