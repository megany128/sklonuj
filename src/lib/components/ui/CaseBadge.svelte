<script lang="ts">
	import type { Case } from '$lib/types';
	import { CASE_LABELS, CASE_COLORS, CASE_NUMBER } from '$lib/types';

	let {
		case_,
		size = 'md'
	}: {
		case_: Case;
		size?: 'sm' | 'md';
	} = $props();
</script>

<span
	class="inline-flex items-center rounded-full font-semibold text-white {CASE_COLORS[case_]
		.bg} {size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}"
>
	{CASE_NUMBER[case_]}. {CASE_LABELS[case_]}
</span>
