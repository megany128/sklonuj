<script lang="ts">
	import { fly } from 'svelte/transition';

	let { message, emoji, onDismiss }: { message: string; emoji: string; onDismiss: () => void } =
		$props();

	$effect(() => {
		const timer = setTimeout(onDismiss, 3000);
		return () => clearTimeout(timer);
	});
</script>

<div
	transition:fly={{ y: -20, duration: 300 }}
	class="toast-slide-in fixed left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-card-stroke bg-card-bg px-5 py-3 shadow-lg"
	style="top: 80px"
	role="status"
	aria-live="polite"
>
	<p class="flex items-center gap-2 text-sm font-semibold text-emphasis">
		<span>{emoji}</span>
		<span>{message}</span>
	</p>
</div>
