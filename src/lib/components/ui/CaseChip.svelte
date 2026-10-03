<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_HEX, CASE_LABELS, CASE_NUMBER } from '$lib/types';

	/**
	 * Inline case reference for feedback copy. The case colour lives only in the
	 * number dot, so a red (locative) or green (accusative) case never reads as
	 * a wrong/right signal.
	 */
	let {
		case_,
		plural = false
	}: {
		case_: Case;
		plural?: boolean;
	} = $props();
</script>

<span class="inline-flex items-baseline gap-1 whitespace-nowrap font-semibold text-text-default"
	><span
		class="inline-flex size-4 translate-y-[2px] items-center justify-center self-start rounded-full text-[10px] font-bold text-white"
		style="background-color: {CASE_HEX[case_]}"
		><span class="digit-nudge">{CASE_NUMBER[case_]}</span></span
	>{CASE_LABELS[case_]}{plural ? ' plural' : ''}</span
>
