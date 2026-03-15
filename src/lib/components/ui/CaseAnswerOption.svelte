<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_LABELS, CASE_COLORS, CASE_NUMBER } from '$lib/types';

	let {
		case_,
		selected = false,
		disabled = false,
		onclick
	}: {
		case_: Case;
		selected?: boolean;
		disabled?: boolean;
		onclick?: () => void;
	} = $props();
</script>

<button
	type="button"
	{onclick}
	{disabled}
	class="flex items-center gap-2.5 rounded-full border-2 px-4 py-2.5 font-semibold transition-all
		{selected
		? `${CASE_COLORS[case_].bg} ${CASE_COLORS[case_].border} text-white`
		: 'border-card-stroke bg-card-bg text-text-default hover:opacity-80'}
		{disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}"
>
	<span
		class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold
			{selected ? `bg-white ${CASE_COLORS[case_].text}` : `${CASE_COLORS[case_].bg} text-white`}"
	>
		{CASE_NUMBER[case_]}
	</span>
	<span>{CASE_LABELS[case_]}</span>
</button>
